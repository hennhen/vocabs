import Anthropic from '@anthropic-ai/sdk'
import { cleanTerm, clip, defineWord, moreExamples } from './define'
import type { Inbox } from './inbox'
import type { Vault } from './vault'

export interface Env {
  ANTHROPIC_API_KEY: string
  /** Passphrase the app sends, so strangers who find the URL can't spend your API credit. */
  APP_TOKEN: string
  ASSETS: Fetcher
  INBOX: DurableObjectNamespace<Inbox>
  VAULT: DurableObjectNamespace<Vault>
  AI?: Ai
}

export const TTS_MODEL = '@cf/deepgram/aura-2-en'
/** Bump to replace every cached pronunciation (server and phone). */
const AUDIO_VERSION = 'v2'

/**
 * A human recording of the word from Wiktionary (via the Free Dictionary API), preferring
 * American, then British, then any. Returns null if there isn't one.
 */
export async function findRecording(term: string): Promise<ArrayBuffer | null> {
  const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(term)}`, {
    signal: AbortSignal.timeout(4000),
  })
  if (!res.ok) return null
  const entries = (await res.json()) as { phonetics?: { audio?: string }[] }[]
  const urls = entries.flatMap((e) => e.phonetics ?? []).map((p) => p.audio ?? '').filter((u) => u.startsWith('https://'))
  const rank = (u: string) => (/-us\.mp3$/.test(u) ? 0 : /-uk\.mp3$/.test(u) ? 1 : 2)
  const best = urls.sort((a, b) => rank(a) - rank(b))[0]
  if (!best) return null
  const audio = await fetch(best, { signal: AbortSignal.timeout(4000) })
  return audio.ok ? audio.arrayBuffer() : null
}

/**
 * Pronunciation as an MP3, so the app can play it through an <audio> element.
 * Unlike the browser's speech synthesis, that still plays when the iPhone's ringer is off.
 * Uses a real recording when Wiktionary has one, otherwise an AI voice. Each word is made once,
 * then served from Cloudflare's cache.
 */
async function speak(term: string, env: Env, ctx?: ExecutionContext): Promise<Response> {
  const cache = typeof caches !== 'undefined' ? (caches as unknown as { default: Cache }).default : undefined
  const key = new Request(`https://tts.vocabs.internal/${AUDIO_VERSION}/${encodeURIComponent(term)}`)
  const hit = await cache?.match(key)
  if (hit) return hit

  let audio: ArrayBuffer | ReadableStream | Uint8Array | null = await findRecording(term).catch(() => null)
  let source = 'recording'
  if (!audio) {
    if (!env.AI) return json({ error: 'Text-to-speech is not set up' }, 503)
    // Call run() on the binding itself: a detached `env.AI.run` loses `this` and throws
    // "Cannot set properties of undefined (setting '#options')".
    const ai = env.AI as unknown as { run(model: string, input: object): Promise<ReadableStream | Uint8Array> }
    // The trailing period makes the voice say it as a statement; a bare word comes out rising, like a question.
    audio = await ai.run(TTS_MODEL, { text: `${term}.`, encoding: 'mp3' })
    source = 'ai-voice'
  }
  const res = new Response(audio, {
    headers: {
      'content-type': 'audio/mpeg',
      'cache-control': 'private, max-age=31536000, immutable',
      'x-pronunciation-source': source,
    },
  })
  if (cache) {
    const save = cache.put(key, res.clone())
    if (ctx) ctx.waitUntil(save)
    else await save
  }
  return res
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

/** Plain-text replies for the iOS Shortcut, which shows the response as a notification. */
const text = (body: string, status = 200) =>
  new Response(body, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } })

const inbox = (env: Env) => env.INBOX.get(env.INBOX.idFromName('inbox'))
const vault = (env: Env) => env.VAULT.get(env.VAULT.idFromName('vault'))

const MAX_SNAPSHOT = 25 * 1024 * 1024

/** Turns a share-sheet selection like `“Ubiquitous,”` into `ubiquitous`. */
export const fromSelection = (raw: string) =>
  cleanTerm(raw.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '').toLowerCase())

async function tokenMatches(given: string, expected: string): Promise<boolean> {
  const enc = new TextEncoder()
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(given)),
    crypto.subtle.digest('SHA-256', enc.encode(expected)),
  ])
  // Constant-time comparison of the two digests.
  const x = new Uint8Array(a)
  const y = new Uint8Array(b)
  let diff = 0
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i]
  return diff === 0
}

/** Runs a Claude call and turns failures into clear JSON errors. */
async function askClaude(fn: () => Promise<unknown>): Promise<Response> {
  try {
    return json(await fn())
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json({ error: 'Too many requests, try again shortly' }, 429)
    if (e instanceof Anthropic.AuthenticationError) return json({ error: 'The server’s Anthropic key is invalid' }, 502)
    if (e instanceof Anthropic.APIError) return json({ error: `Claude API error ${e.status}` }, 502)
    return json({ error: (e as Error).message }, 502)
  }
}

export async function handleApi(request: Request, env: Env, client?: Anthropic, ctx?: ExecutionContext): Promise<Response> {
  const url = new URL(request.url)
  if (!env.APP_TOKEN || !env.ANTHROPIC_API_KEY) return json({ error: 'Server is missing its secrets' }, 500)
  const auth = request.headers.get('authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  const fromShortcut = url.pathname === '/api/inbox' && request.method === 'POST'
  if (!(await tokenMatches(token, env.APP_TOKEN))) {
    return fromShortcut ? text('Vocabs: wrong passphrase in the Shortcut', 401) : json({ error: 'Wrong app passphrase' }, 401)
  }

  if (fromShortcut) {
    const raw = request.headers.get('content-type')?.includes('json')
      ? ((await request.json().catch(() => ({}))) as { term?: unknown }).term
      : await request.text()
    const term = typeof raw === 'string' ? fromSelection(raw) : null
    if (!term) return text('Vocabs: select a single word or short phrase', 400)
    try {
      const r = await inbox(env).add(term)
      return text(r.added ? `Added “${term}” to Vocabs` : `“${term}” is already waiting in Vocabs`)
    } catch (e) {
      return text(`Vocabs: ${(e as Error).message}`, 507)
    }
  }

  if (url.pathname === '/api/speak' && request.method === 'GET') {
    const term = cleanTerm(url.searchParams.get('term'))
    if (!term) return json({ error: 'Send a single word or short phrase' }, 400)
    try {
      return await speak(term.toLowerCase(), env, ctx)
    } catch (e) {
      return json({ error: `Text-to-speech failed: ${(e as Error).message}` }, 502)
    }
  }

  // Cloud sync: the phone uploads its whole deck (backup format); GET returns it.
  if (url.pathname === '/api/sync' && request.method === 'PUT') {
    const body = await request.text()
    if (body.length > MAX_SNAPSHOT) return json({ error: 'Deck too large to sync' }, 413)
    let words: number
    try {
      const data = JSON.parse(body) as { app?: unknown; words?: unknown }
      if (data.app !== 'vocabs' || !Array.isArray(data.words)) throw new Error()
      words = data.words.length
    } catch {
      return json({ error: 'Not a Vocabs deck' }, 400)
    }
    try {
      return json(await vault(env).save(body, words))
    } catch (e) {
      return json({ error: (e as Error).message }, 409)
    }
  }
  if (url.pathname === '/api/sync' && request.method === 'GET') {
    const which = url.searchParams.get('version') === 'previous' ? 'previous' : 'latest'
    const body = await vault(env).load(which)
    if (!body) return json({ error: 'Nothing synced yet' }, 404)
    return new Response(body, { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })
  }
  if (url.pathname === '/api/sync/info' && request.method === 'GET') {
    return json(await vault(env).info())
  }

  if (url.pathname === '/api/inbox/take' && request.method === 'POST') {
    return json({ terms: await inbox(env).take() })
  }

  if (url.pathname === '/api/ping') return json({ ok: true })

  if (url.pathname === '/api/define' && request.method === 'POST') {
    const body = (await request.json().catch(() => null)) as { term?: unknown } | null
    const term = cleanTerm(body?.term)
    if (!term) return json({ error: 'Send a single word or short phrase' }, 400)
    return askClaude(() => defineWord(client ?? new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }), term))
  }

  if (url.pathname === '/api/examples' && request.method === 'POST') {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    const term = cleanTerm(body?.term)
    if (!term) return json({ error: 'Send a single word or short phrase' }, 400)
    const existing = (Array.isArray(body?.existing) ? body.existing : []).slice(0, 20).map((e) => clip(e, 300)).filter(Boolean)
    const req = { term, pos: clip(body?.pos, 40), definition: clip(body?.definition, 300), existing }
    return askClaude(async () => ({
      examples: await moreExamples(client ?? new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }), req),
    }))
  }

  return json({ error: 'Not found' }, 404)
}
