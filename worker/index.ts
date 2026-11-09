import Anthropic from '@anthropic-ai/sdk'
import { cleanTerm, defineWord } from './define'

export interface Env {
  ANTHROPIC_API_KEY: string
  /** Passphrase the app sends, so strangers who find the URL can't spend your API credit. */
  APP_TOKEN: string
  ASSETS: Fetcher
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

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
  if (!(await tokenMatches(token, env.APP_TOKEN))) return json({ error: 'Wrong app passphrase' }, 401)

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
