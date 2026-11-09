import type { Card as FsrsCard, Rating, State } from 'ts-fsrs'

/** A vocabulary entry. `pending` words were added without details and are not reviewed yet. */
export interface Word {
  id: string
  term: string
  pos: string
  definition: string
  zhHant: string
  examples: string[]
  etymology: string
  mnemonic: string
  synonyms: string[]
  status: 'ready' | 'pending'
  createdAt: number
  updatedAt: number
}

export interface CardRow {
  id: string
  wordId: string
  direction: 'forward'
  fsrs: FsrsCard
  suspended: boolean
  createdAt: number
}

export interface ReviewRow {
  id?: number
  cardId: string
  rating: Rating
  /** Card state *before* this review (State.New means the card was introduced). */
  state: State
  reviewedAt: number
}

export interface Settings {
  newPerDay: number
}

export const DEFAULT_SETTINGS: Settings = { newPerDay: 20 }

export type WordDraft = Omit<Word, 'id' | 'status' | 'createdAt' | 'updatedAt'>

export const emptyDraft = (term = ''): WordDraft => ({
  term,
  pos: '',
  definition: '',
  zhHant: '',
  examples: [],
  etymology: '',
  mnemonic: '',
  synonyms: [],
})
