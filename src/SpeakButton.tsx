import { useSyncExternalStore } from 'react'
import { getSpeakState, speak, subscribeSpeak } from './audio'

const LABELS = { idle: 'Pronounce', loading: 'Loading pronunciation', playing: 'Playing', error: 'Couldn’t play' }

/** 🔊 button that shows when it's loading, playing, or failed. */
export default function SpeakButton({ term }: { term: string }) {
  const s = useSyncExternalStore(subscribeSpeak, getSpeakState)
  const status = s.term === term.trim().toLowerCase() ? s.status : 'idle'
  return (
    <button
      type="button"
      className={`speak ${status}`}
      aria-label={LABELS[status]}
      aria-busy={status === 'loading'}
      onClick={(e) => {
        e.stopPropagation()
        speak(term)
      }}
    >
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M11 5 6 9H3v6h3l5 4V5z" fill="currentColor" />
        {status === 'error' ? (
          <path d="m16 9 5 6m0-6-5 6" />
        ) : (
          <>
            <path className="w1" d="M15.5 8.5a5 5 0 0 1 0 7" />
            <path className="w2" d="M18.5 5.5a9 9 0 0 1 0 13" />
          </>
        )}
      </svg>
    </button>
  )
}
