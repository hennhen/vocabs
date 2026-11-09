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

/** A tiny silent WAV, played inside the tap so iOS lets this element play again moments later. */
let silent: string | null = null
function silentUrl(): string {
  if (silent) return silent
  const samples = 800
  const buf = new ArrayBuffer(44 + samples * 2)
  const v = new DataView(buf)
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)))
  str(0, 'RIFF'); v.setUint32(4, 36 + samples * 2, true); str(8, 'WAVE'); str(12, 'fmt ')
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true)
  v.setUint32(24, 8000, true); v.setUint32(28, 16000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true)
  str(36, 'data'); v.setUint32(40, samples * 2, true)
  silent = URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }))
  return silent
}

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

function speakWithSynthesis(term: string) {
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
