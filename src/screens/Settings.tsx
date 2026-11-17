import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState } from 'react'
import { getToken, ping, setToken } from '../api'
import { forceUpdate, soundCheck } from '../audio'
import { cloudInfo, onSyncChange, restoreFromCloud, syncNow } from '../sync'
import { exportBackup, parseBackup, restoreBackup } from '../backup'
import { db, getMeta, getSettings, saveSettings } from '../db'

export default function Settings() {
  const [message, setMessage] = useState('')
  const [persisted, setPersisted] = useState<boolean | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [token, setTokenInput] = useState<string | null>(null)
  const [tokenMsg, setTokenMsg] = useState('')
  const [showToken, setShowToken] = useState(false)
  const [checkLog, setCheckLog] = useState<string[]>([])
  const [cloud, setCloud] = useState<{ words: number; savedAt: number } | null | undefined>(undefined)
  const [cloudMsg, setCloudMsg] = useState('')
  const refreshCloud = () => cloudInfo().then(setCloud, () => setCloud(undefined))
  useEffect(() => {
    refreshCloud()
    return onSyncChange(refreshCloud)
  }, [])
  useEffect(() => {
    getToken().then(setTokenInput)
  }, [])
  const data = useLiveQuery(async () => ({
    settings: await getSettings(),
    lastBackupAt: await getMeta<number | null>('lastBackupAt', null),
    count: await db.words.count(),
  }))

  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted, () => setPersisted(null))
  }, [])

  if (!data) return null

  const doExport = async () => {
    try {
      const r = await exportBackup()
      if (r !== 'cancelled') setMessage('Backup saved.')
    } catch (e) {
      setMessage(`Backup failed: ${(e as Error).message}`)
    }
  }

  const doImport = async (file: File) => {
    try {
      const backup = parseBackup(await file.text())
      const ok = confirm(
        `Restore ${backup.words.length} words from ${backup.exportedAt.slice(0, 10)}? This replaces everything currently on this device (${data.count} words).`,
      )
      if (!ok) return
      await restoreBackup(backup)
      setMessage(`Restored ${backup.words.length} words.`)
    } catch (e) {
      setMessage(`Restore failed: ${(e as Error).message}`)
    }
  }

  return (
    <section>
      <h2>Cloud sync</h2>
      <p className="hint">
        Your words, cards and review history are copied to your Cloudflare server a few seconds after any change.
        The server keeps the latest copy and the one before it.
      </p>
      <p>
        {cloud === undefined
          ? 'Cloud copy: can’t check (offline or no passphrase)'
          : cloud
            ? `Cloud copy: ${cloud.words} words, saved ${new Date(cloud.savedAt).toLocaleString()}`
            : 'Cloud copy: nothing synced yet'}
      </p>
      {cloudMsg && <p className="hint">{cloudMsg}</p>}
      <div className="row">
        <button
          onClick={async () => {
            setCloudMsg('Syncing…')
            try {
              const n = await syncNow()
              setCloudMsg(n === null ? 'Nothing to sync yet.' : `Synced ${n} words ✓`)
            } catch (e) {
              setCloudMsg(`Sync failed: ${(e as Error).message}`)
            }
          }}
        >
          Sync now
        </button>
        <button
          onClick={async () => {
            if (!cloud) return setCloudMsg('There’s no cloud copy to restore.')
            if (!confirm(`Replace everything on this phone (${data.count} words) with the cloud copy (${cloud.words} words)?`)) return
            try {
              setCloudMsg(`Restored ${await restoreFromCloud()} words ✓`)
            } catch (e) {
              setCloudMsg(`Restore failed: ${(e as Error).message}`)
            }
          }}
        >
          Restore from cloud
        </button>
      </div>

      <h2>Backup file</h2>
      <p className="hint">
        An extra copy you keep yourself: save a file to iCloud Drive or Files, and restore from it anytime.
      </p>
      <p>
        Last backup:{' '}
        <b>{data.lastBackupAt ? new Date(data.lastBackupAt).toLocaleString() : 'never'}</b>
      </p>
      {message && <p className="hint ok">{message}</p>}
      <div className="row">
        <button className="primary" onClick={doExport}>
          Back up now
        </button>
        <button onClick={() => fileRef.current?.click()}>Restore…</button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) doImport(f)
            e.target.value = ''
          }}
        />
      </div>
      {persisted === false && (
        <p className="hint">
          Tip: add this app to your Home Screen (Share → Add to Home Screen) so iOS keeps its data.
        </p>
      )}

      <h2>Passphrase</h2>
      <p className="hint">
        The <code>APP_TOKEN</code> you set in Cloudflare. It keeps strangers from using your Claude credit or reading
        your words. You only enter it once; the app remembers it. Use Show or Copy when you need it for the Share
        Shortcut.
      </p>
      <div className="row">
        <input
          type={showToken ? 'text' : 'password'}
          className="grow"
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="Passphrase"
          value={token ?? ''}
          onChange={(e) => setTokenInput(e.target.value)}
        />
        <button
          onClick={async () => {
            await setToken(token ?? '')
            setTokenMsg('Checking…')
            try {
              await ping()
              setTokenMsg('Connected ✓')
              refreshCloud()
            } catch (e) {
              setTokenMsg((e as Error).message)
            }
          }}
        >
          Save
        </button>
      </div>
      <div className="row token-tools">
        <button type="button" onClick={() => setShowToken((v) => !v)} disabled={!token}>
          {showToken ? 'Hide' : 'Show'}
        </button>
        <button
          type="button"
          disabled={!token}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(token ?? '')
              setTokenMsg('Copied ✓')
            } catch {
              setShowToken(true)
              setTokenMsg('Couldn’t copy. It’s shown above; select it and copy.')
            }
          }}
        >
          Copy
        </button>
      </div>
      {tokenMsg && <p className={`hint ${/^(Connected|Copied)/.test(tokenMsg) ? 'ok' : 'warn'}`}>{tokenMsg}</p>}

      <h2>Learning</h2>
      <label className="field">
        <span>New words per day</span>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={200}
          value={data.settings.newPerDay}
          onChange={(e) => {
            const n = Math.max(1, Math.min(200, Number(e.target.value) || 1))
            saveSettings({ ...data.settings, newPerDay: n })
          }}
        />
      </label>
      <p className="hint">
        Every new word comes back several times over the next weeks. About 20 a day keeps reviews to roughly 10–20
        minutes. When you want more, use “Study more” on the review screen.
      </p>

      <h2>Sound &amp; version</h2>
      <p className="hint">
        Tap Test sound with your ringer off. It plays a beep, then the word “hello” from the server, and shows what
        happened at each step.
      </p>
      <div className="row">
        <button
          onClick={() => {
            setCheckLog([`App version: ${__APP_VERSION__}`])
            soundCheck((line) => setCheckLog((l) => [...l, line]))
          }}
        >
          🔊 Test sound
        </button>
        <button onClick={forceUpdate}>Force update</button>
      </div>
      {checkLog.length > 0 && (
        <ul className="checklog">
          {checkLog.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      )}
      <p className="hint version">
        Version {__APP_VERSION__}
        <br />
        Recorded pronunciations: Wiktionary contributors via Wikimedia Commons (CC BY-SA), served by dictionaryapi.dev.
      </p>
    </section>
  )
}
