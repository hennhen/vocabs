import { describe, expect, it } from 'vitest'
import { buildQueue, dayStart, formatInterval, newCard, Rating, review, State } from './srs'
import { DEFAULT_SETTINGS, type CardRow, type Word } from './types'

const now = new Date('2026-03-10T12:00:00')

const word = (id: string, status: Word['status'] = 'ready'): Word => ({
  id, term: id, pos: '', definition: 'd', zhHant: '', examples: [], etymology: '', mnemonic: '',
  synonyms: [], status, createdAt: 0, updatedAt: 0,
})
const card = (id: string, fsrs = newCard(now), createdAt = 0): CardRow => ({
  id, wordId: id, direction: 'forward', fsrs, suspended: false, createdAt,
})
const due = (offsetMs: number, state = State.Review) => ({ ...newCard(now), state, due: new Date(now.getTime() + offsetMs) })

describe('scheduling', () => {
  it('schedules a Good review later than an Again review', () => {
    const c = newCard(now)
    expect(review(c, Rating.Good, now).card.due.getTime()).toBeGreaterThan(review(c, Rating.Again, now).card.due.getTime())
  })
})

describe('buildQueue', () => {
  const base = { settings: DEFAULT_SETTINGS, introducedToday: 0, extraNew: 0, now }

  it('puts due reviews first, oldest due first, and skips future ones', () => {
    const cards = [card('a', due(-1000)), card('b', due(-5000)), card('c', due(86_400_000))]
    const q = buildQueue({ ...base, cards, words: new Map(cards.map((c) => [c.id, word(c.id)])) })
    expect(q.reviews.map((c) => c.id)).toEqual(['b', 'a'])
    expect(q.nextDue?.getTime()).toBe(now.getTime() + 86_400_000)
  })

  it('shows learning cards a little early but not review cards', () => {
    const cards = [card('l', due(60_000, State.Learning)), card('r', due(60_000, State.Review)), card('l2', due(10 * 60_000, State.Learning))]
    const q = buildQueue({ ...base, cards, words: new Map(cards.map((c) => [c.id, word(c.id)])) })
    expect(q.reviews.map((c) => c.id)).toEqual(['l'])
  })

  it('limits new cards per day, in the order they were added, and allows extra', () => {
    const cards = Array.from({ length: 30 }, (_, i) => card(`n${i}`, newCard(now), i))
    const words = new Map(cards.map((c) => [c.id, word(c.id)]))
    const q = buildQueue({ ...base, cards, words, introducedToday: 15 })
    expect(q.fresh.map((c) => c.id)).toEqual(['n0', 'n1', 'n2', 'n3', 'n4'])
    expect(q.newWaiting).toBe(25)
    expect(buildQueue({ ...base, cards, words, introducedToday: 15, extraNew: 10 }).fresh).toHaveLength(15)
  })

  it('skips pending and suspended words', () => {
    const cards = [card('p'), { ...card('s'), suspended: true }, card('ok')]
    const words = new Map([['p', word('p', 'pending')], ['s', word('s')], ['ok', word('ok')]])
    expect(buildQueue({ ...base, cards, words }).fresh.map((c) => c.id)).toEqual(['ok'])
  })

  it('pauses new cards when the review backlog is huge', () => {
    const cards = [...Array.from({ length: 201 }, (_, i) => card(`r${i}`, due(-1000))), card('n')]
    const q = buildQueue({ ...base, cards, words: new Map(cards.map((c) => [c.id, word(c.id)])) })
    expect(q.backlogPaused).toBe(true)
    expect(q.fresh).toHaveLength(0)
  })
})

describe('helpers', () => {
  it('starts the study day at 4am', () => {
    expect(new Date(dayStart(new Date('2026-03-10T02:00:00'))).toString()).toBe(new Date('2026-03-09T04:00:00').toString())
    expect(new Date(dayStart(new Date('2026-03-10T09:00:00'))).toString()).toBe(new Date('2026-03-10T04:00:00').toString())
  })
  it('formats intervals', () => {
    expect(formatInterval(now, new Date(now.getTime() + 10 * 60_000))).toBe('10m')
    expect(formatInterval(now, new Date(now.getTime() + 3 * 86_400_000))).toBe('3d')
  })
})
