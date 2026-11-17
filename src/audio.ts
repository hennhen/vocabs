import { getToken } from './api'

/*
 * Pronunciation playback.
 *
 * iOS mutes the browser's speech synthesis when the ringer switch is off, but <audio> elements
 * still play. So we fetch an MP3 of each word from the server (/api/speak), cache it on the
 * phone, and play it through one shared <audio> element. Speech synthesis is only the fallback
 * (offline, or no passphrase set yet).
 */

const CACHE = 'vocabs-tts-v1'
const urls = new Map<string, string>()
const inflight = new Map<string, Promise<string>>()
let player: HTMLAudioElement | null = null

const key = (term: string) => term.trim().toLowerCase()

function getPlayer(): HTMLAudioElement {
  if (!player) {
    player = new Audio()
    player.preload = 'auto'
    // Safari 17+: treat our sound as media playback rather than ambient sound.
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession
    if (session) session.type = 'playback'
  }
  return player
}

/** A WAV made on the phone: silence (to unlock playback during a tap) or a short beep (for testing). */
function wavUrl(seconds: number, freq: number): string {
  const rate = 8000
  const samples = Math.round(rate * seconds)
  const buf = new ArrayBuffer(44 + samples * 2)
  const v = new DataView(buf)
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)))
  str(0, 'RIFF'); v.setUint32(4, 36 + samples * 2, true); str(8, 'WAVE'); str(12, 'fmt ')
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true)
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true)
  str(36, 'data'); v.setUint32(40, samples * 2, true)
  for (let i = 0; i < samples; i++) v.setInt16(44 + i * 2, freq ? Math.round(Math.sin((2 * Math.PI * freq * i) / rate) * 8000) : 0, true)
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }))
}

let silent: string | null = null
const silentUrl = () => (silent ??= wavUrl(0.1, 0))

async function fromCacheStorage(term: string): Promise<Blob | null> {
  try {
    const hit = await (await caches.open(CACHE)).match(`/tts/${encodeURIComponent(term)}`)
    return hit ? await hit.blob() : null
  } catch {
    return null
  }
}

async function download(term: string): Promise<Blob> {
  const token = await getToken()
  if (!token) throw new Error('no passphrase')
  const res = await fetch(`/api/speak?term=${encodeURIComponent(term)}`, {
    headers: { authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`speak ${res.status}`)
  const blob = await res.blob()
  try {
    await (await caches.open(CACHE)).put(
      `/tts/${encodeURIComponent(term)}`,
      new Response(blob, { headers: { 'content-type': 'audio/mpeg' } }),
    )
  } catch {
    // Cache Storage unavailable: it still plays, it just downloads again next time.
  }
  return blob
}

/** Resolves to a playable URL for the word's audio, from memory, the phone's cache, or the server. */
function audioUrl(raw: string): Promise<string> {
  const term = key(raw)
  const ready = urls.get(term)
  if (ready) return Promise.resolve(ready)
  let p = inflight.get(term)
  if (!p) {
    p = (async () => {
      const blob = (await fromCacheStorage(term)) ?? (await download(term))
      const url = URL.createObjectURL(blob)
      urls.set(term, url)
      return url
    })().finally(() => inflight.delete(term))
    inflight.set(term, p)
  }
  return p
}

/** Start fetching a word's audio in the background (call when a card appears). */
export function preloadAudio(term: string) {
  audioUrl(term).catch(() => {})
}

let lastFallback = ''

function speakWithSynthesis(term: string) {
  lastFallback = term
  if (!('speechSynthesis' in window)) return
  speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(term)
  u.lang = 'en-US'
  speechSynthesis.speak(u)
}

/** Play a word's pronunciation. Must be called from a tap. */
export function speak(raw: string) {
  const p = getPlayer()
  const ready = urls.get(key(raw))
  if (ready) {
    p.src = ready
    p.play().catch(() => speakWithSynthesis(raw))
    return
  }
  // Not downloaded yet: "unlock" the element during the tap, then play once the audio arrives.
  p.src = silentUrl()
  p.play().catch(() => {})
  audioUrl(raw)
    .then((url) => {
      p.src = url
      return p.play()
    })
    .catch(() => speakWithSynthesis(raw))
}

const errName = (e: unknown) => (e instanceof Error ? `${e.name}: ${e.message}` : String(e))

/**
 * Step-by-step sound check for Settings. Must be started from a tap.
 * Reports each step through `log` so problems can be pinpointed from a screenshot.
 */
export async function soundCheck(log: (line: string) => void) {
  const p = getPlayer()
  const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession
  log(`Audio session: ${session ? session.type : 'not supported'}`)

  // 1. A beep generated on the phone: tests whether <audio> plays at all (e.g. with the ringer off).
  try {
    p.src = wavUrl(0.5, 660)
    await p.play()
    log('1. Beep made on the phone: played ✓ (did you hear it?)')
  } catch (e) {
    log(`1. Beep made on the phone: FAILED (${errName(e)})`)
  }
  await new Promise((r) => setTimeout(r, 700))

  // 2. Fetch a pronunciation from the server (bypassing the phone's cache).
  const token = await getToken()
  if (!token) {
    log('2. Server audio: skipped (no passphrase saved)')
    return
  }
  let blob: Blob
  try {
    const res = await fetch(`/api/speak?term=hello&check=${Date.now()}`, { headers: { authorization: `Bearer ${token}` } })
    const type = res.headers.get('content-type') ?? '?'
    if (!res.ok) {
      log(`2. Server audio: HTTP ${res.status} (${(await res.text()).slice(0, 160)})`)
      return
    }
    blob = await res.blob()
    log(`2. Server audio: HTTP 200, ${type}, ${(blob.size / 1024).toFixed(1)} KB ✓`)
  } catch (e) {
    log(`2. Server audio: request failed (${errName(e)})`)
    return
  }

  // 3. Play it.
  try {
    p.src = URL.createObjectURL(blob)
    await p.play()
    log('3. Playing "hello": played ✓ (did you hear it?)')
  } catch (e) {
    log(`3. Playing "hello": FAILED (${errName(e)})`)
  }
  log(`Last time 🔊 fell back to the old voice: ${lastFallback ? `"${lastFallback}"` : 'never (this session)'}`)
}

/** Clears the cached app files and reloads, so the newest version loads. Words are untouched. */
export async function forceUpdate() {
  try {
    const regs = (await navigator.serviceWorker?.getRegistrations()) ?? []
    await Promise.all(regs.map((r) => r.unregister()))
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k)
  } finally {
    location.reload()
  }
}
