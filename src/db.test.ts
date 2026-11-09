import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { createBackup, parseBackup, restoreBackup } from './backup'
import { addTerms, addWord, deleteWord, gradeCard, introducedToday, updateWord, VocabDB } from './db'
import { Rating } from './srs'
import { emptyDraft } from './types'

let d: VocabDB
beforeEach(async () => {
  d = new VocabDB(`test-${Math.random()}`)
  await d.open()
})

describe('words', () => {
  it('adds a word with a card, and rejects duplicates regardless of case', async () => {
    const w = await addWord({ ...emptyDraft(' Ubiquitous '), zhHant: '無處不在' }, d)
    expect(w.term).toBe('ubiquitous')
    expect(w.status).toBe('ready')
    expect(await d.cards.count()).toBe(1)
    await expect(addWord(emptyDraft('UBIQUITOUS'), d)).rejects.toThrow(/already/)
  })

  it('adds pasted terms as pending and becomes ready once filled in', async () => {
    expect(await addTerms(['laconic', 'Laconic', 'ephemeral', ''], d)).toEqual({ added: 2, skipped: 0 })
    const w = (await d.words.where('term').equals('laconic').first())!
    expect(w.status).toBe('pending')
    await updateWord(w.id, { ...emptyDraft('laconic'), definition: 'using few words' }, d)
    expect((await d.words.get(w.id))!.status).toBe('ready')
  })

  it('deletes a word with its cards and reviews', async () => {
    const w = await addWord({ ...emptyDraft('terse'), definition: 'brief' }, d)
    await gradeCard((await d.cards.toArray())[0], Rating.Good, new Date(), d)
    await deleteWord(w.id, d)
    expect([await d.words.count(), await d.cards.count(), await d.reviews.count()]).toEqual([0, 0, 0])
  })

  it('counts cards introduced today', async () => {
    await addWord({ ...emptyDraft('a'), definition: 'x' }, d)
    const [c] = await d.cards.toArray()
    await gradeCard(c, Rating.Again, new Date(), d)
    await gradeCard((await d.cards.get(c.id))!, Rating.Good, new Date(), d)
    expect(await introducedToday(new Date(), d)).toBe(1)
  })
})

describe('backup', () => {
  it('round-trips through JSON, keeping dates', async () => {
    await addWord({ ...emptyDraft('sanguine'), definition: 'optimistic', zhHant: '樂觀的' }, d)
    await gradeCard((await d.cards.toArray())[0], Rating.Good, new Date(), d)
    const text = JSON.stringify(await createBackup(d))

    const other = new VocabDB(`restore-${Math.random()}`)
    await addWord({ ...emptyDraft('stale'), definition: 'old' }, other)
    await restoreBackup(parseBackup(text), other)

    expect((await other.words.toArray()).map((w) => w.term)).toEqual(['sanguine'])
    const card = (await other.cards.toArray())[0]
    expect(card.fsrs.due).toBeInstanceOf(Date)
    expect(card.fsrs.last_review).toBeInstanceOf(Date)
    expect(await other.reviews.count()).toBe(1)
  })

  it('rejects files that are not backups', () => {
    expect(() => parseBackup('{"hello":1}')).toThrow(/backup/)
  })
})
