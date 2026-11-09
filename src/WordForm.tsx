import { useEffect, useState } from 'react'
import { define, toDraft } from './api'
import { loadWords, suggest } from './autocomplete'
import type { WordDraft } from './types'

interface Props {
  initial: WordDraft
  submitLabel: string
  onSubmit: (d: WordDraft) => Promise<void>
  /** Terms already in the deck, so suggestions can mark them. */
  existing?: Set<string>
  autoFocus?: boolean
  /** Auto-fill as soon as an autocomplete suggestion is picked. */
  autoFillOnPick?: boolean
  children?: React.ReactNode
}

const lines = (s: string) => s.split('\n').map((l) => l.trim()).filter(Boolean)
const commas = (s: string) => s.split(/[,，、]/).map((l) => l.trim()).filter(Boolean)

export default function WordForm({ initial, submitLabel, onSubmit, existing, autoFocus, autoFillOnPick, children }: Props) {
  const [term, setTerm] = useState(initial.term)
  const [pos, setPos] = useState(initial.pos)
  const [definition, setDefinition] = useState(initial.definition)
  const [zhHant, setZhHant] = useState(initial.zhHant)
  const [examples, setExamples] = useState(initial.examples.join('\n'))
  const [etymology, setEtymology] = useState(initial.etymology)
  const [mnemonic, setMnemonic] = useState(initial.mnemonic)
  const [synonyms, setSynonyms] = useState(initial.synonyms.join(', '))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [list, setList] = useState<string[] | null>(null)
  const [showSuggest, setShowSuggest] = useState(false)
  const [filling, setFilling] = useState(false)
  const [didYouMean, setDidYouMean] = useState('')

  useEffect(() => {
    loadWords().then(setList, () => setList([]))
  }, [])

  const suggestions = list && showSuggest ? suggest(list, term) : []

  const autoFill = async (word = term) => {
    if (!word.trim()) return
    setError('')
    setDidYouMean('')
    setFilling(true)
    try {
      const d = await define(word)
      const draft = toDraft(d)
      if (!d.isWord && d.suggestion) setDidYouMean(d.suggestion)
      else setTerm(draft.term || word)
      setPos(draft.pos)
      setDefinition(draft.definition)
      setZhHant(draft.zhHant)
      setExamples(draft.examples.join('\n'))
      setEtymology(draft.etymology)
      setMnemonic(draft.mnemonic)
      setSynonyms(draft.synonyms.join(', '))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setFilling(false)
    }
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await onSubmit({
        term,
        pos: pos.trim(),
        definition: definition.trim(),
        zhHant: zhHant.trim(),
        examples: lines(examples),
        etymology: etymology.trim(),
        mnemonic: mnemonic.trim(),
        synonyms: commas(synonyms),
      })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <label className="field">
        <span>Word</span>
        <div className="autocomplete">
          <div className="term-row">
          <input
            value={term}
            onChange={(e) => {
              setTerm(e.target.value)
              setShowSuggest(true)
            }}
            onBlur={() => setTimeout(() => setShowSuggest(false), 150)}
            autoFocus={autoFocus}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="next"
            placeholder="e.g. ubiquitous"
            required
          />
          <button
            type="button"
            className="fill"
            disabled={filling || !term.trim()}
            onClick={() => {
              setShowSuggest(false)
              autoFill()
            }}
          >
            {filling ? 'Filling…' : '✨ Auto-fill'}
          </button>
          </div>
          {suggestions.length > 0 && (
            <ul className="suggestions" role="listbox">
              {suggestions.map((s) => (
                <li key={s}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setTerm(s)
                      setShowSuggest(false)
                      if (autoFillOnPick) autoFill(s)
                    }}
                  >
                    {s}
                    {existing?.has(s) && <span className="badge">in deck</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </label>
      {didYouMean && (
        <p className="hint warn">
          Not a word I know. Did you mean{' '}
          <button
            type="button"
            className="link"
            onClick={() => {
              setTerm(didYouMean)
              setDidYouMean('')
            }}
          >
            {didYouMean}
          </button>
          ? (Details below are for that word.)
        </p>
      )}
      {existing?.has(term.trim().toLowerCase()) && submitLabel === 'Add word' && (
        <p className="hint warn">Already in your deck.</p>
      )}
      <label className="field">
        <span>Definition</span>
        <textarea value={definition} onChange={(e) => setDefinition(e.target.value)} rows={2} />
      </label>
      <label className="field">
        <span>繁體中文</span>
        <input className="zh" value={zhHant} onChange={(e) => setZhHant(e.target.value)} placeholder="無處不在" />
      </label>
      <label className="field">
        <span>Part of speech</span>
        <input value={pos} onChange={(e) => setPos(e.target.value)} placeholder="adjective" autoCapitalize="none" />
      </label>
      <label className="field">
        <span>Examples (one per line)</span>
        <textarea value={examples} onChange={(e) => setExamples(e.target.value)} rows={2} />
      </label>
      <label className="field">
        <span>Roots / etymology</span>
        <input value={etymology} onChange={(e) => setEtymology(e.target.value)} placeholder="Latin ubique, 'everywhere'" />
      </label>
      <label className="field">
        <span>Memory hook</span>
        <input value={mnemonic} onChange={(e) => setMnemonic(e.target.value)} />
      </label>
      <label className="field">
        <span>Synonyms (comma-separated)</span>
        <input value={synonyms} onChange={(e) => setSynonyms(e.target.value)} autoCapitalize="none" />
      </label>
      {error && <p className="hint warn">{error}</p>}
      <button className="primary" disabled={busy}>
        {submitLabel}
      </button>
      {children}
    </form>
  )
}
