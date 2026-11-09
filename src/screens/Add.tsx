import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { fillPending } from '../api'
import { addTerms, addWord, db } from '../db'
import { emptyDraft } from '../types'
import WordForm from '../WordForm'

export default function Add() {
  const [formKey, setFormKey] = useState(0)
  const [message, setMessage] = useState('')
  const [paste, setPaste] = useState('')
  const existing = useLiveQuery(async () => new Set((await db.words.toArray()).map((w) => w.term)), [])

  const addList = async () => {
    const terms = paste.split(/[\n,;]+/)
    const { added, skipped } = await addTerms(terms)
    setPaste('')
    const base = `Added ${added} word${added === 1 ? '' : 's'}${skipped ? `, skipped ${skipped} already in your deck` : ''}.`
    setMessage(base)
    if (!added) return
    const { filled, failed } = await fillPending((done, total) => setMessage(`${base} Filling in details… ${done}/${total}`))
    setMessage(`${base} Filled in ${filled}.${failed ? ` ${failed} couldn’t be filled yet; retry from Words.` : ''}`)
  }

  return (
    <section>
      <h2>Add a word</h2>
      <p className="hint">Type a word, then pick a suggestion or tap ✨ Auto-fill. Everything stays editable.</p>
      {message && <p className="hint ok">{message}</p>}
      <WordForm
        key={formKey}
        initial={emptyDraft(new URLSearchParams(location.hash.split('?')[1]).get('word') ?? '')}
        submitLabel="Add word"
        existing={existing}
        autoFocus
        autoFillOnPick
        onSubmit={async (d) => {
          const w = await addWord(d)
          setMessage(
            w.status === 'ready'
              ? `Added “${w.term}”.`
              : `Added “${w.term}”. Add a definition or Chinese to start reviewing it.`,
          )
          setFormKey((k) => k + 1)
        }}
      />

      <h2>Paste a list</h2>
      <p className="hint">One word per line, or separated by commas. Claude fills in the details in the background.</p>
      <textarea
        className="paste"
        value={paste}
        onChange={(e) => setPaste(e.target.value)}
        rows={5}
        autoCapitalize="none"
        placeholder={'ephemeral\nlaconic\nperfunctory'}
      />
      <button onClick={addList} disabled={!paste.trim()}>
        Add all
      </button>
    </section>
  )
}
