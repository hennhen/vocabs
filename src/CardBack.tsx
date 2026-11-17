import { useState } from 'react'
import { examplesFor, highlight } from './examples'
import type { Word } from './types'

export { speak } from './audio'

/**
 * The answer side of a card. Shows two examples at a time; `turn` picks which pair
 * (the review screen passes the number of reviews, so each review shows different ones).
 */
export default function CardBack({ word, turn = 0 }: { word: Word; turn?: number }) {
  const [extra, setExtra] = useState(0)
  const shown = examplesFor(word.examples, turn + extra)
  const n = word.examples.length

  return (
    <div className="back">
      {word.pos && <p className="pos">{word.pos}</p>}
      {word.definition && <p className="definition">{word.definition}</p>}
      {word.zhHant && <p className="zh big">{word.zhHant}</p>}
      {n > 0 && (
        <section className="examples-block">
          <div className="examples-head">
            <span>Examples</span>
            {n > 2 && (
              <button
                type="button"
                className="rotate"
                aria-label="Show other examples"
                onClick={(e) => {
                  e.stopPropagation()
                  setExtra((x) => x + 1)
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
