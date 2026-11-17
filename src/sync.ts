import { getToken } from './api'
import { createBackup, parseBackup, restoreBackup } from './backup'
import { db, getMeta, setMeta } from './db'

/*
 * Cloud sync: the phone is the source of truth and uploads its whole deck (the backup format)
 * to the server a few seconds after any change. The server keeps the latest and previous copy.
 */

export class SyncError extends Error {}

async function authed(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getToken()
  if (!token) throw new SyncError('Set your passphrase first')
  let res: Response
  try {
    res = await fetch(path, { ...init, headers: { ...init.headers, authorization: `Bearer ${token}` } })
  } catch {
    throw new SyncError('Offline')
  }
  if (!res.ok) {
    const msg = ((await res.json().catch(() => ({}))) as { error?: string }).error
    throw new SyncError(msg ?? `Server error ${res.status}`)
  }
  return res
}

let timer: ReturnType<typeof setTimeout> | undefined
let dirty = false
let running: Promise<number | null> | null = null
const listeners = new Set<() => void>()
export const onSyncChange = (l: () => void) => (listeners.add(l), () => void listeners.delete(l))

/** Uploads the deck now. Returns the number of words synced, or null if there was nothing to do. */
export function syncNow(): Promise<number | null> {
  running ??= (async () => {
    dirty = false
    const backup = await createBackup()
    const synced = await getMeta<number | null>('lastSyncAt', null)
    // A fresh install with no words shouldn't upload anything (and the server would refuse it).
    if (!synced && backup.words.length === 0) return null
    await authed('/api/sync', { method: 'PUT', body: JSON.stringify(backup), headers: { 'content-type': 'application/json' } })
    await setMeta('lastSyncAt', Date.now())
    listeners.forEach((l) => l())
    return backup.words.length
  })().finally(() => {
    running = null
  })
  return running
}

export function scheduleSync(delayMs = 4000) {
  dirty = true
  clearTimeout(timer)
  timer = setTimeout(() => syncNow().catch(() => (dirty = true)), delayMs)
}

/** Watches the deck for changes and syncs shortly after. Call once at startup. */
export function startAutoSync() {
  for (const table of [db.words, db.cards, db.reviews]) {
    table.hook('creating', () => void scheduleSync())
    table.hook('updating', () => void scheduleSync())
    table.hook('deleting', () => void scheduleSync())
  }
  // On launch, make sure the cloud copy is current (also does the very first upload).
  scheduleSync(3000)
  // Leaving the app: push pending changes right away.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && dirty) {
      clearTimeout(timer)
      syncNow().catch(() => (dirty = true))
    }
  })
}

export async function cloudInfo(): Promise<{ words: number; savedAt: number } | null> {
  const r = (await (await authed('/api/sync/info')).json()) as { latest: { words: number; savedAt: number } | null }
  return r.latest
}

/** Replaces everything on this phone with the cloud copy. Returns the number of words restored. */
export async function restoreFromCloud(): Promise<number> {
  const backup = parseBackup(await (await authed('/api/sync')).text())
  await restoreBackup(backup)
  await setMeta('lastSyncAt', Date.now())
  listeners.forEach((l) => l())
  return backup.words.length
}
