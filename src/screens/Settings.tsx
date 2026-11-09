import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState } from 'react'
import { getToken, ping, setToken } from '../api'
import { exportBackup, parseBackup, restoreBackup } from '../backup'
import { db, getMeta, getSettings, saveSettings } from '../db'

export default function Settings() {
  const [message, setMessage] = useState('')
  const [persisted, setPersisted] = useState<boolean | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [token, setTokenInput] = useState<string | null>(null)
  const [tokenMsg, setTokenMsg] = useState('')
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
      <h2>Backup</h2>
      <p className="hint">
        Your words live on this phone. Save a backup to iCloud Drive or Files now and then, so you can restore them
        if the app is deleted or you get a new phone.
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

      <h2>Auto-fill</h2>
      <p className="hint">
        The passphrase you set as <code>APP_TOKEN</code> in Cloudflare. It stops strangers from using your Claude
        credit.
      </p>
      <div className="row">
        <input
          type="password"
          className="grow"
          autoComplete="off"
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
            } catch (e) {
              setTokenMsg((e as Error).message)
            }
          }}
        >
          Save
        </button>
      </div>
      {tokenMsg && <p className={`hint ${tokenMsg.startsWith('Connected') ? 'ok' : 'warn'}`}>{tokenMsg}</p>}

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
    </section>
  )
}
