import { useEffect, useState } from 'react'
import Add from './screens/Add'
import Review from './screens/Review'
import Settings from './screens/Settings'
import Words from './screens/Words'

type Tab = 'review' | 'add' | 'words' | 'settings'
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'review', label: 'Review', icon: '🃏' },
  { id: 'add', label: 'Add', icon: '＋' },
  { id: 'words', label: 'Words', icon: '📖' },
  { id: 'settings', label: 'Settings', icon: '⚙︎' },
]

const tabFromHash = (): Tab => {
  const t = location.hash.replace(/^#\/?/, '').split('?')[0] as Tab
  return TABS.some((x) => x.id === t) ? t : 'review'
}

export default function App() {
  const [tab, setTab] = useState<Tab>(tabFromHash)

  useEffect(() => {
    const onHash = () => setTab(tabFromHash())
    addEventListener('hashchange', onHash)
    // Ask iOS to keep our data even under storage pressure.
    navigator.storage?.persist?.().catch(() => {})
    return () => removeEventListener('hashchange', onHash)
  }, [])

  const goTo = (t: Tab) => {
    location.hash = `/${t}`
  }

  return (
    <div className="app">
      <main>
        {tab === 'review' && <Review goTo={goTo} />}
        {tab === 'add' && <Add />}
        {tab === 'words' && <Words />}
        {tab === 'settings' && <Settings />}
      </main>
      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => goTo(t.id)}>
            <span className="tab-icon">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  )
}
