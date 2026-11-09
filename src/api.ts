import { addTerms, db, getMeta, setMeta, updateWord } from './db'
import type { WordDraft } from './types'

export interface Definition extends WordDraft {
  isWord: boolean
  suggestion: string
}

export class ApiError extends Error {}

export const getToken = () => getMeta<string>('appToken', '')
export const setToken = (t: string) => setMeta('appToken', t.trim())

async function call(path: string, body?: unknown): Promise<unknown> {
  const token = await getToken()
  if (!token) throw new ApiError('Set your auto-fill passphrase in Settings first')
  let res: Response
  try {
    res = await fetch(path, {
      method: body ? 'POST' : 'GET',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiError('You’re offline. Try again when you have a connection')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError((data as { error?: string }).error ?? `Server error ${res.status}`)
  return data
}

export const ping = () => call('/api/ping')

export const define = (term: string) => call('/api/define', { term }) as Promise<Definition>

export const toDraft = (d: Definition): WordDraft => ({
  term: d.term,
  pos: d.pos,
  definition: d.definition,
  zhHant: d.zhHant,
  examples: d.examples,
  etymology: d.etymology,
  mnemonic: d.mnemonic,
  synonyms: d.synonyms,
})

let filling: Promise<{ filled: number; failed: number }> | null = null

/**
 * Auto-fills every pending word, one at a time. Safe to call repeatedly: a run already in
 * progress is reused. Typos are filled for the intended word but keep the term as typed.
 */
export function fillPending(onProgress?: (done: number, total: number) => void) {
  filling ??= (async () => {
    const pending = await db.words.where('status').equals('pending').toArray()
    let filled = 0
    let failed = 0
    for (const [i, w] of pending.entries()) {
      try {
        const d = await define(w.term)
        await updateWord(w.id, { ...toDraft(d), term: w.term }, db)
        filled++
      } catch (e) {
        failed++
        // Stop early on problems that will affect every word.
        if (e instanceof ApiError && /passphrase|offline|key/i.test(e.message)) {
          failed += pending.length - i - 1
          break
        }
      }
      onProgress?.(i + 1, pending.length)
    }
    return { filled, failed }
  })().finally(() => {
    filling = null
  })
  return filling
}

/**
 * Pulls words sent from the iOS share sheet, adds them, and auto-fills them.
 * Returns how many new words were added (0 if no passphrase is set or offline).
 */
export async function syncInbox(): Promise<number> {
  if (!(await getToken())) return 0
  let terms: string[]
  try {
    terms = ((await call('/api/inbox/take', {})) as { terms: string[] }).terms
  } catch {
    return 0
  }
  if (!terms.length) return 0
  const { added } = await addTerms(terms)
  if (added) void fillPending()
  return added
}
