import Dexie, { type EntityTable } from 'dexie'
import type { Grade } from 'ts-fsrs'
import { dayStart, newCard, review, State } from './srs'
import { DEFAULT_SETTINGS, type CardRow, type ReviewRow, type Settings, type Word, type WordDraft } from './types'

export class VocabDB extends Dexie {
  words!: EntityTable<Word, 'id'>
  cards!: EntityTable<CardRow, 'id'>
  reviews!: EntityTable<ReviewRow, 'id'>
  meta!: EntityTable<{ key: string; value: unknown }, 'key'>

  constructor(name = 'vocabs') {
    super(name)
    this.version(1).stores({
      words: 'id, &term, status, createdAt',
      cards: 'id, wordId',
      reviews: '++id, cardId, reviewedAt',
      meta: 'key',
    })
  }
}

export const db = new VocabDB()

export const normalizeTerm = (term: string) => term.trim().toLowerCase().replace(/\s+/g, ' ')

const isReady = (d: WordDraft) => Boolean(d.definition.trim() || d.zhHant.trim())

export async function findWord(term: string, d = db) {
  return d.words.where('term').equals(normalizeTerm(term)).first()
}

/** Adds a word plus its forward card. Throws if the term is already in the deck. */
export async function addWord(draft: WordDraft, d = db): Promise<Word> {
  const now = Date.now()
  const word: Word = {
    ...draft,
    term: normalizeTerm(draft.term),
    id: crypto.randomUUID(),
    status: isReady(draft) ? 'ready' : 'pending',
    createdAt: now,
    updatedAt: now,
  }
  if (!word.term) throw new Error('Word is empty')
  await d.transaction('rw', d.words, d.cards, async () => {
    if (await findWord(word.term, d)) throw new Error(`"${word.term}" is already in your deck`)
    await d.words.add(word)
    await d.cards.add({
      id: crypto.randomUUID(),
      wordId: word.id,
      direction: 'forward',
      fsrs: newCard(new Date(now)),
      suspended: false,
      createdAt: now,
    })
  })
  return word
}

/** Adds many bare terms as pending words. Returns how many were new. */
export async function addTerms(terms: string[], d = db): Promise<{ added: number; skipped: number }> {
  let added = 0
  let skipped = 0
  const unique = [...new Set(terms.map(normalizeTerm).filter(Boolean))]
  for (const term of unique) {
    if (await findWord(term, d)) skipped++
    else {
      await addWord({ term, pos: '', definition: '', zhHant: '', examples: [], etymology: '', mnemonic: '', synonyms: [] }, d)
      added++
    }
  }
  return { added, skipped }
}

export async function updateWord(id: string, draft: WordDraft, d = db) {
  const term = normalizeTerm(draft.term)
  const clash = await findWord(term, d)
  if (clash && clash.id !== id) throw new Error(`"${term}" is already in your deck`)
  await d.words.update(id, { ...draft, term, status: isReady(draft) ? 'ready' : 'pending', updatedAt: Date.now() })
}

export async function deleteWord(id: string, d = db) {
  await d.transaction('rw', d.words, d.cards, d.reviews, async () => {
    const cardIds = (await d.cards.where('wordId').equals(id).toArray()).map((c) => c.id)
    await d.reviews.where('cardId').anyOf(cardIds).delete()
    await d.cards.bulkDelete(cardIds)
    await d.words.delete(id)
  })
}

export async function setSuspended(wordId: string, suspended: boolean, d = db) {
  await d.cards.where('wordId').equals(wordId).modify({ suspended })
}

export async function gradeCard(card: CardRow, grade: Grade, now = new Date(), d = db) {
  const { card: next } = review(card.fsrs, grade, now)
  await d.transaction('rw', d.cards, d.reviews, async () => {
    await d.cards.update(card.id, { fsrs: next })
    await d.reviews.add({ cardId: card.id, rating: grade, state: card.fsrs.state, reviewedAt: now.getTime() })
  })
}

export async function introducedToday(now = new Date(), d = db): Promise<number> {
  const logs = await d.reviews.where('reviewedAt').aboveOrEqual(dayStart(now)).toArray()
  return logs.filter((l) => l.state === State.New).length
}

export async function getMeta<T>(key: string, fallback: T, d = db): Promise<T> {
  const row = await d.meta.get(key)
  return row ? (row.value as T) : fallback
}

export const setMeta = (key: string, value: unknown, d = db) => d.meta.put({ key, value })

export const getSettings = (d = db) => getMeta<Settings>('settings', DEFAULT_SETTINGS, d)
export const saveSettings = (s: Settings, d = db) => setMeta('settings', s, d)
