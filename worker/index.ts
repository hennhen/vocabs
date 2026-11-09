import Anthropic from '@anthropic-ai/sdk'
import { cleanTerm, defineWord } from './define'
import type { Inbox } from './inbox'

export { Inbox } from './inbox'

export interface Env {
  ANTHROPIC_API_KEY: string
  /** Passphrase the app sends, so strangers who find the URL can't spend your API credit. */
  APP_TOKEN: string
  ASSETS: Fetcher
  INBOX: DurableObjectNamespace<Inbox>
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

/** Plain-text replies for the iOS Shortcut, which shows the response as a notification. */
const text = (body: string, status = 200) =>
  new Response(body, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } })

const inbox = (env: Env) => env.INBOX.get(env.INBOX.idFromName('inbox'))

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

export async function handleApi(request: Request, env: Env, client?: Anthropic): Promise<Response> {
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

  if (url.pathname === '/api/inbox/take' && request.method === 'POST') {
    return json({ terms: await inbox(env).take() })
  }

  if (url.pathname === '/api/ping') return json({ ok: true })

  if (url.pathname === '/api/define' && request.method === 'POST') {
    const body = (await request.json().catch(() => null)) as { term?: unknown } | null
    const term = cleanTerm(body?.term)
    if (!term) return json({ error: 'Send a single word or short phrase' }, 400)
    try {
      const def = await defineWord(client ?? new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }), term)
      return json(def)
    } catch (e) {
      if (e instanceof Anthropic.RateLimitError) return json({ error: 'Too many requests, try again shortly' }, 429)
      if (e instanceof Anthropic.AuthenticationError) return json({ error: 'The server’s Anthropic key is invalid' }, 502)
      if (e instanceof Anthropic.APIError) return json({ error: `Claude API error ${e.status}` }, 502)
      return json({ error: (e as Error).message }, 502)
    }
  }
  return json({ error: 'Not found' }, 404)
}

export default {
  fetch(request, env) {
    if (new URL(request.url).pathname.startsWith('/api/')) return handleApi(request, env)
    return env.ASSETS.fetch(request)
  },
} satisfies ExportedHandler<Env>
