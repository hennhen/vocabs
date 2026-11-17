import { fetchMoreExamples } from './api'
import { appendExamples, db, MAX_EXAMPLES } from './db'

/** Which examples to show: a different pair each `turn` (e.g. each review), cycling through all of them. */
export function examplesFor(examples: string[], turn: number, count = 2): string[] {
  if (examples.length <= count) return examples
  const start = (((turn * count) % examples.length) + examples.length) % examples.length
  return Array.from({ length: count }, (_, i) => examples[(start + i) % examples.length])
}

/** True once the next turn would start repeating examples, and there's room for more. */
export const needsMoreExamples = (n: number, turn: number, count = 2) =>
  n < MAX_EXAMPLES && (turn + 1) * count >= n

const inflight = new Set<string>()

/** Fetches 3 more examples for a word and saves them. Returns how many were added. */
export async function addMoreExamples(wordId: string): Promise<number> {
  if (inflight.has(wordId)) return 0
  inflight.add(wordId)
  try {
    const w = await db.words.get(wordId)
    if (!w) return 0
    return await appendExamples(wordId, await fetchMoreExamples(w))
  } finally {
    inflight.delete(wordId)
  }
}

/** Splits a sentence so the studied word (and simple inflections like -s, -ed, -ing) can be bolded. */
export function highlight(sentence: string, term: string): { text: string; hit: boolean }[] {
  const stem = term.trim().replace(/e$/, '')
  if (stem.length < 3) return [{ text: sentence, hit: false }]
  const esc = stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`\\b(${esc}\\p{L}*)`, 'giu')
  const out: { text: string; hit: boolean }[] = []
  let last = 0
  for (const m of sentence.matchAll(re)) {
    if (m.index! > last) out.push({ text: sentence.slice(last, m.index), hit: false })
    out.push({ text: m[0], hit: true })
    last = m.index! + m[0].length
  }
  if (last < sentence.length) out.push({ text: sentence.slice(last), hit: false })
  return out
}
