import { describe, expect, it } from 'vitest'
import { newCard, Rating, review } from './srs'

describe('srs', () => {
  it('schedules a Good review later than an Again review', () => {
    const now = new Date('2026-01-01T00:00:00Z')
    const card = newCard(now)
    const good = review(card, Rating.Good, now)
    const again = review(card, Rating.Again, now)
    expect(good.due.getTime()).toBeGreaterThan(again.due.getTime())
  })
})
