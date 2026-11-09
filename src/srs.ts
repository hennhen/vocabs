import { createEmptyCard, fsrs, Rating, type Card, type Grade } from 'ts-fsrs'

const scheduler = fsrs({ enable_fuzz: true })

export const newCard = (now = new Date()): Card => createEmptyCard(now)

export const review = (card: Card, grade: Grade, now = new Date()): Card =>
  scheduler.next(card, now, grade).card

export { Rating }
