import { useEffect, useState } from 'react'
import { MAX_EXAMPLES } from './db'
import { addMoreExamples, examplesFor, highlight, needsMoreExamples } from './examples'
import type { Word } from './types'

export { speak } from './audio'

/**
 * The answer side of a card. Shows two examples at a time; `turn` picks which pair
 * (the review screen passes the number of reviews, so each review shows different ones).
 */
export default function CardBack({
  word,
  turn = 0,
  prefetch = false,
}: {
  word: Word
  turn?: number
  /** Fetch new examples in the background as soon as this card is shown, if it's running low (review). */
  prefetch?: boolean
}) {
  const [extra, setExtra] = useState(0)
  const [busy, setBusy] = useState(false)
  const n = word.examples.length
  const pos = turn + extra
  const shown = examplesFor(word.examples, pos)
  const canGrow = n < MAX_EXAMPLES && Boolean(word.definition)

  useEffect(() => {
    if (prefetch && canGrow && needsMoreExamples(n, turn)) addMoreExamples(word.id).catch(() => {})
    // Only when the card is first shown.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [word.id])

  /** Next pair; once every example has been seen, ask Claude for fresh ones first. */
  const next = async () => {
    if (canGrow && needsMoreExamples(n, pos)) {
      setBusy(true)
      try {
        const added = await addMoreExamples(word.id)
        if (added) {
          // Show the new ones, which were added after the existing n.
          setExtra(Math.ceil(n / 2) - turn)
          return
        }
      } catch {
        // Offline or failed: just keep rotating through what we have.
      } finally {
        setBusy(false)
      }
    }
    setExtra((x) => x + 1)
  }

  return (
    <div className="back">
      {word.pos && <p className="pos">{word.pos}</p>}
      {word.definition && <p className="definition">{word.definition}</p>}
      {word.zhHant && <p className="zh big">{word.zhHant}</p>}
      {n > 0 && (
        <section className="examples-block">
          <div className="examples-head">
            <span>Examples</span>
            {(n > 2 || canGrow) && (
              <button
                type="button"
                className={`rotate ${busy ? 'busy' : ''}`}
                aria-label={busy ? 'Getting new examples' : 'Show other examples'}
                disabled={busy}
                onClick={(e) => {
                  e.stopPropagation()
                  next()
                }}
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M20 11a8 8 0 1 0-2.3 5.7" />
                  <path d="M20 4v7h-7" />
                </svg>
              </button>
            )}
          </div>
          <ul className="examples">
            {shown.map((ex) => (
              <li key={ex}>
                {highlight(ex, word.term).map((part, i) => (part.hit ? <b key={i}>{part.text}</b> : part.text))}
              </li>
            ))}
          </ul>
        </section>
      )}
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
