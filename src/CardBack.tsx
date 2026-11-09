import type { Word } from './types'

export function speak(text: string) {
  if (!('speechSynthesis' in window)) return
  speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.lang = 'en-US'
  speechSynthesis.speak(u)
}

export default function CardBack({ word }: { word: Word }) {
  return (
    <div className="back">
      {word.pos && <p className="pos">{word.pos}</p>}
      {word.definition && <p className="definition">{word.definition}</p>}
      {word.zhHant && <p className="zh big">{word.zhHant}</p>}
      {word.examples.length > 0 && (
        <ul className="examples">
          {word.examples.map((ex, i) => (
            <li key={i}>{ex}</li>
          ))}
        </ul>
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
