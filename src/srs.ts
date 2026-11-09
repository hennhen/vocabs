import { createEmptyCard, fsrs, Rating, State, type Card, type Grade } from 'ts-fsrs'
import type { CardRow, Settings, Word } from './types'

const scheduler = fsrs({ enable_fuzz: true })

export const newCard = (now = new Date()): Card => createEmptyCard(now)

export const review = (card: Card, grade: Grade, now = new Date()) => scheduler.next(card, now, grade)

/** When each grade would schedule the card next, for the button labels. */
export const preview = (card: Card, now = new Date()): Record<Grade, Date> => {
  const p = scheduler.repeat(card, now)
  return {
    [Rating.Again]: p[Rating.Again].card.due,
    [Rating.Hard]: p[Rating.Hard].card.due,
    [Rating.Good]: p[Rating.Good].card.due,
    [Rating.Easy]: p[Rating.Easy].card.due,
  } as Record<Grade, Date>
}

export const GRADES: { grade: Grade; label: string }[] = [
  { grade: Rating.Again, label: 'Again' },
  { grade: Rating.Hard, label: 'Hard' },
  { grade: Rating.Good, label: 'Good' },
  { grade: Rating.Easy, label: 'Easy' },
]

/** Learning cards due within this window (e.g. "Again" in 1m) are shown now instead of making you wait. */
export const LEARN_AHEAD_MS = 2 * 60 * 1000
/** Above this many due reviews, new cards pause so the backlog can't snowball. */
export const BACKLOG_PAUSE = 200

/** The study day starts at 4am local time, so a late-night session counts as "today". */
export const dayStart = (now: Date): number => {
  const d = new Date(now)
  if (d.getHours() < 4) d.setDate(d.getDate() - 1)
  d.setHours(4, 0, 0, 0)
  return d.getTime()
}

export interface QueueInput {
  cards: CardRow[]
  words: Map<string, Word>
  settings: Settings
  introducedToday: number
  extraNew: number
  now: Date
}

export interface Queue {
  reviews: CardRow[]
  fresh: CardRow[]
  /** New cards that exist but are held back by the daily limit or the backlog pause. */
  newWaiting: number
  backlogPaused: boolean
  nextDue: Date | null
}

export function buildQueue({ cards, words, settings, introducedToday, extraNew, now }: QueueInput): Queue {
  const t = now.getTime()
  const active = cards.filter((c) => !c.suspended && words.get(c.wordId)?.status === 'ready')

  const reviews = active
    .filter((c) => {
      if (c.fsrs.state === State.New) return false
      const due = c.fsrs.due.getTime()
      const learning = c.fsrs.state === State.Learning || c.fsrs.state === State.Relearning
      return due <= t || (learning && due <= t + LEARN_AHEAD_MS)
    })
    .sort((a, b) => a.fsrs.due.getTime() - b.fsrs.due.getTime())

  const newCards = active
    .filter((c) => c.fsrs.state === State.New)
    .sort((a, b) => a.createdAt - b.createdAt)

  const backlogPaused = reviews.length > BACKLOG_PAUSE && extraNew === 0
  const allowance = backlogPaused ? 0 : Math.max(0, settings.newPerDay - introducedToday) + extraNew
  const fresh = newCards.slice(0, allowance)

  const upcoming = active
    .filter((c) => c.fsrs.state !== State.New && c.fsrs.due.getTime() > t)
    .map((c) => c.fsrs.due.getTime())
  const nextDue = upcoming.length ? new Date(Math.min(...upcoming)) : null

  return { reviews, fresh, newWaiting: newCards.length - fresh.length, backlogPaused, nextDue }
}

/** Short human interval, e.g. "10m", "3d", "2mo". */
export function formatInterval(from: Date, to: Date): string {
  const mins = Math.max(1, Math.round((to.getTime() - from.getTime()) / 60000))
  if (mins < 60) return `${mins}m`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days}d`
  const months = Math.round(days / 30)
  if (months < 12) return `${months}mo`
  return `${(days / 365).toFixed(1)}y`
}

export { Rating, State }
