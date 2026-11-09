import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { fillPending } from '../api'
import CardBack, { speak } from '../CardBack'
import { db, deleteWord, setSuspended, updateWord } from '../db'
import { formatInterval, State } from '../srs'
import type { CardRow, Word } from '../types'
import WordForm from '../WordForm'

type Mode = { kind: 'list' } | { kind: 'view'; id: string } | { kind: 'edit'; id: string }

function statusOf(w: Word, c: CardRow | undefined, now: Date): string {
  if (w.status === 'pending') return 'needs details'
  if (!c) return ''
  if (c.suspended) return 'paused'
  if (c.fsrs.state === State.New) return 'new'
  return c.fsrs.due <= now ? 'due' : `in ${formatInterval(now, c.fsrs.due)}`
}

export default function Words() {
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState<Mode>({ kind: 'list' })
  const [fillMsg, setFillMsg] = useState('')
  const data = useLiveQuery(async () => {
    const [words, cards] = await Promise.all([db.words.orderBy('createdAt').reverse().toArray(), db.cards.toArray()])
    return { words, cards: new Map(cards.map((c) => [c.wordId, c])) }
  }, [])
  if (!data) return null

  const now = new Date()
  const q = query.trim().toLowerCase()
  const shown = q
    ? data.words.filter((w) => w.term.includes(q) || w.zhHant.includes(q) || w.definition.toLowerCase().includes(q))
    : data.words
  // If the open word was deleted, `word` is undefined and the list is shown.
  const word = mode.kind !== 'list' ? data.words.find((w) => w.id === mode.id) : undefined

  if (mode.kind === 'edit' && word) {
    const card = data.cards.get(word.id)
    return (
      <section>
        <button className="link" onClick={() => setMode({ kind: 'view', id: word.id })}>
          ‹ Cancel
        </button>
        <h2>Edit “{word.term}”</h2>
        <WordForm
          initial={word}
          submitLabel="Save"
          onSubmit={async (d) => {
            await updateWord(word.id, d)
            setMode({ kind: 'view', id: word.id })
          }}
        >
          <div className="row">
            {card && (
              <button type="button" onClick={() => setSuspended(word.id, !card.suspended)}>
                {card.suspended ? 'Resume reviews' : 'Pause reviews'}
              </button>
            )}
            <button
              type="button"
              className="danger"
              onClick={async () => {
                if (confirm(`Delete “${word.term}” and its review history?`)) {
                  await deleteWord(word.id)
                  setMode({ kind: 'list' })
                }
              }}
            >
              Delete
            </button>
          </div>
        </WordForm>
      </section>
    )
  }

  if (mode.kind === 'view' && word) {
    const card = data.cards.get(word.id)
    const i = shown.findIndex((w) => w.id === word.id)
    const prev = i > 0 ? shown[i - 1] : undefined
    const next = i >= 0 && i < shown.length - 1 ? shown[i + 1] : undefined
    const status = statusOf(word, card, now)
    return (
      <section>
        <div className="viewer-nav">
          <button className="link" onClick={() => setMode({ kind: 'list' })}>
            ‹ All words
          </button>
          <div className="arrows">
            <button aria-label="Previous word" disabled={!prev} onClick={() => prev && setMode({ kind: 'view', id: prev.id })}>
              ‹
            </button>
            <button aria-label="Next word" disabled={!next} onClick={() => next && setMode({ kind: 'view', id: next.id })}>
              ›
            </button>
          </div>
        </div>
        <div className="card view">
          <div className="front">
            <h2 className="term">{word.term}</h2>
            <button className="icon" aria-label="Pronounce" onClick={() => speak(word.term)}>
              🔊
            </button>
          </div>
          {word.status === 'pending' ? (
            <p className="hint">No details yet. Tap Edit, then ✨ Auto-fill.</p>
          ) : (
            <CardBack word={word} />
          )}
        </div>
        <p className="card-status">
          {status === 'due' ? 'Due for review now' : status.startsWith('in ') ? `Next review ${status}` : status}
          {card && card.fsrs.reps > 0 && ` · reviewed ${card.fsrs.reps}×`}
        </p>
        <button className="primary wide" onClick={() => setMode({ kind: 'edit', id: word.id })}>
          Edit
        </button>
      </section>
    )
  }

  const pending = data.words.filter((w) => w.status === 'pending').length
  return (
    <section>
      <h2>Words ({data.words.length})</h2>
      {(pending > 0 || fillMsg) && (
        <div className="row fillbar">
          {pending > 0 && (
            <button
              onClick={async () => {
                const r = await fillPending((done, total) => setFillMsg(`Filling in… ${done}/${total}`))
                setFillMsg(`Filled in ${r.filled}.${r.failed ? ` ${r.failed} failed; check Settings → Auto-fill.` : ''}`)
              }}
            >
              ✨ Fill in {pending} word{pending === 1 ? '' : 's'}
            </button>
          )}
          {fillMsg && <span className="hint">{fillMsg}</span>}
        </div>
      )}
      <input
        type="search"
        className="search"
        placeholder="Search English, 中文, or definitions"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <ul className="wordlist">
        {shown.map((w) => {
          const status = statusOf(w, data.cards.get(w.id), now)
          return (
            <li key={w.id}>
              <button onClick={() => setMode({ kind: 'view', id: w.id })}>
                <span className="term">{w.term}</span>
                <span className="zh">{w.zhHant}</span>
                <span className={`badge ${w.status === 'pending' ? 'warn' : ''}`}>{status}</span>
                <span className="chev">›</span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
