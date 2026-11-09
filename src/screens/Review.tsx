import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useState } from 'react'
import { BACKUP_REMINDER_DAYS } from '../backup'
import { preloadAudio } from '../audio'
import CardBack, { speak } from '../CardBack'
import { db, getMeta, getSettings, gradeCard, introducedToday } from '../db'
import { buildQueue, formatInterval, GRADES, preview } from '../srs'
import type { Grade } from 'ts-fsrs'

export default function Review({ goTo }: { goTo: (tab: 'add' | 'settings') => void }) {
  const [now, setNow] = useState(() => new Date())
  const [revealed, setRevealed] = useState(false)
  const [extraNew, setExtraNew] = useState(0)

  // Re-check every 30s so learning cards come back when they're due.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(t)
  }, [])

  const data = useLiveQuery(async () => {
    const [cards, words, settings, introduced, lastBackupAt] = await Promise.all([
      db.cards.toArray(),
      db.words.toArray(),
      getSettings(),
      introducedToday(now),
      getMeta<number | null>('lastBackupAt', null),
    ])
    return { cards, words: new Map(words.map((w) => [w.id, w])), settings, introduced, lastBackupAt }
  }, [now])

  const queue = useMemo(
    () =>
      data &&
      buildQueue({
        cards: data.cards,
        words: data.words,
        settings: data.settings,
        introducedToday: data.introduced,
        extraNew,
        now,
      }),
    [data, extraNew, now],
  )

  const current = queue && (queue.reviews[0] ?? queue.fresh[0])
  const word = current ? data?.words.get(current.wordId) : undefined
  useEffect(() => {
    if (word) preloadAudio(word.term)
  }, [word?.term])

  if (!data || !queue) return null
  const pending = [...data.words.values()].filter((w) => w.status === 'pending').length
  const backupDue =
    data.words.size > 0 &&
    (!data.lastBackupAt || Date.now() - data.lastBackupAt > BACKUP_REMINDER_DAYS * 86_400_000)

  const grade = async (g: Grade) => {
    if (!current) return
    const at = new Date()
    await gradeCard(current, g, at)
    setRevealed(false)
    setNow(at)
  }

  const banner = backupDue && (
    <button className="banner" onClick={() => goTo('settings')}>
      {data.lastBackupAt ? `No backup in ${BACKUP_REMINDER_DAYS}+ days.` : 'You haven’t backed up yet.'} Tap to back up.
    </button>
  )

  if (data.words.size === 0) {
    return (
      <section className="empty">
        <h2>No words yet</h2>
        <p>Add a word you came across and it’ll show up here for review.</p>
        <button className="primary" onClick={() => goTo('add')}>
          Add your first word
        </button>
      </section>
    )
  }

  if (!current || !word) {
    return (
      <section className="empty">
        {banner}
        <h2>All done for now 🎉</h2>
        {queue.nextDue && <p>Next review in {formatInterval(now, queue.nextDue)}.</p>}
        {queue.backlogPaused && <p>New cards are paused until your review backlog is under control.</p>}
        {queue.newWaiting > 0 && (
          <>
            <p>
              {queue.newWaiting} new word{queue.newWaiting === 1 ? '' : 's'} waiting. You’ve hit today’s limit of{' '}
              {data.settings.newPerDay}. Keeping new words steady stops future reviews from piling up.
            </p>
            <button onClick={() => setExtraNew((n) => n + 10)}>Study 10 more new words</button>
          </>
        )}
        {pending > 0 && (
          <p className="hint">
            {pending} word{pending === 1 ? '' : 's'} still need details before they can be reviewed (see Words).
          </p>
        )}
      </section>
    )
  }

  const intervals = revealed ? preview(current.fsrs, new Date()) : null
  const isNew = !queue.reviews[0]

  return (
    <section className="review">
      {banner}
      <p className="counts">
        <span>{queue.reviews.length} to review</span>
        <span>{queue.fresh.length} new</span>
      </p>
      <div className="card" onClick={() => !revealed && setRevealed(true)}>
        {isNew && <span className="badge new">new</span>}
        <div className="front">
          <h2 className="term">{word.term}</h2>
          <button
            className="icon"
            aria-label="Pronounce"
            onClick={(e) => {
              e.stopPropagation()
              speak(word.term)
            }}
          >
            🔊
          </button>
        </div>
        {revealed ? <CardBack word={word} /> : <p className="hint">Think of the meaning, then tap to flip</p>}
      </div>
      {revealed && intervals ? (
        <div className="grades">
          {GRADES.map(({ grade: g, label }) => (
            <button key={g} className={`grade g${g}`} onClick={() => grade(g)}>
              <span>{label}</span>
              <small>{formatInterval(new Date(), intervals[g])}</small>
            </button>
          ))}
        </div>
      ) : (
        <button className="primary reveal" onClick={() => setRevealed(true)}>
          Show answer
        </button>
      )}
    </section>
  )
}
