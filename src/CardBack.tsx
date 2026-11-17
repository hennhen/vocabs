import { useState } from 'react'
import { addMoreExamples, examplesFor, highlight } from './examples'
import { MAX_EXAMPLES } from './db'
import type { Word } from './types'

export { speak } from './audio'

/**
 * The answer side of a card. Shows two examples at a time; `turn` picks which pair
 * (the review screen passes the number of reviews, so each review shows different ones).
 */
export default function CardBack({ word, turn = 0 }: { word: Word; turn?: number }) {
  const [extra, setExtra] = useState(0)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const shown = examplesFor(word.examples, turn + extra)
  const n = word.examples.length

  const more = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setBusy(true)
    setNote('')
    try {
      const added = await addMoreExamples(word.id)
      if (added) {
        // Jump to the new ones (they're appended at the end).
        setExtra(Math.floor((n + added - 2) / 2) - turn)
        setNote(`Added ${added} new example${added === 1 ? '' : 's'}`)
      } else setNote('No new examples this time')
    } catch (err) {
      setNote((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="back">
      {word.pos && <p className="pos">{word.pos}</p>}
      {word.definition && <p className="definition">{word.definition}</p>}
      {word.zhHant && <p className="zh big">{word.zhHant}</p>}
      {n > 0 && (
        <ul className="examples">
          {shown.map((ex) => (
            <li key={ex}>
              {highlight(ex, word.term).map((part, i) => (part.hit ? <b key={i}>{part.text}</b> : part.text))}
            </li>
          ))}
        </ul>
      )}
      <div className="example-tools">
        {n > 2 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setExtra((x) => x + 1)
            }}
          >
            ↻ Other examples
          </button>
        )}
        {n < MAX_EXAMPLES && (
          <button type="button" onClick={more} disabled={busy}>
            {busy ? 'Writing…' : '✨ More examples'}
          </button>
        )}
        {n > 0 && <span className="hint">{n} total</span>}
      </div>
      {note && <p className="hint">{note}</p>}
      {word.etymology && (
        <p className="detail">
          <b>Roots</b> {word.etymology}
        </p>
      )}
      {word.mnemonic && (
        <p className="detail">
          <b>Hook</b> {word.mnemonic}
        </p>
      )}
      {word.synonyms.length > 0 && (
        <p className="detail">
          <b>Similar</b> {word.synonyms.join(', ')}
        </p>
      )}
    </div>
  )
}
