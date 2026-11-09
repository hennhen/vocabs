import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db, deleteWord, setSuspended, updateWord } from '../db'
import { formatInterval, State } from '../srs'
import WordForm from '../WordForm'

export default function Words() {
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const data = useLiveQuery(async () => {
    const [words, cards] = await Promise.all([db.words.orderBy('createdAt').reverse().toArray(), db.cards.toArray()])
    return { words, cards: new Map(cards.map((c) => [c.wordId, c])) }
  }, [])
  if (!data) return null

  const q = query.trim().toLowerCase()
  const shown = q
    ? data.words.filter((w) => w.term.includes(q) || w.zhHant.includes(q) || w.definition.toLowerCase().includes(q))
    : data.words
  const word = editing && data.words.find((w) => w.id === editing)

  if (word) {
    const card = data.cards.get(word.id)
    return (
      <section>
        <button className="link" onClick={() => setEditing(null)}>
          ‹ Back
        </button>
        <h2>Edit “{word.term}”</h2>
        <WordForm
          initial={word}
          submitLabel="Save"
          onSubmit={async (d) => {
            await updateWord(word.id, d)
            setEditing(null)
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
                  setEditing(null)
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

  const now = new Date()
  return (
    <section>
      <h2>Words ({data.words.length})</h2>
      <input
        type="search"
        className="search"
        placeholder="Search English, 中文, or definitions"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <ul className="wordlist">
        {shown.map((w) => {
          const c = data.cards.get(w.id)
          let status = ''
          if (w.status === 'pending') status = 'needs details'
          else if (c?.suspended) status = 'paused'
          else if (c?.fsrs.state === State.New) status = 'new'
          else if (c) status = c.fsrs.due <= now ? 'due' : `in ${formatInterval(now, c.fsrs.due)}`
          return (
            <li key={w.id}>
              <button onClick={() => setEditing(w.id)}>
                <span className="term">{w.term}</span>
                <span className="zh">{w.zhHant}</span>
                <span className={`badge ${w.status === 'pending' ? 'warn' : ''}`}>{status}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
