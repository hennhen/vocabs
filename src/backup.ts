import { db, getMeta, setMeta, type VocabDB } from './db'
import type { CardRow, ReviewRow, Settings, Word } from './types'

export interface Backup {
  app: 'vocabs'
  version: 1
  exportedAt: string
  settings: Settings | null
  words: Word[]
  cards: CardRow[]
  reviews: ReviewRow[]
}

export async function createBackup(d: VocabDB = db): Promise<Backup> {
  return {
    app: 'vocabs',
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: await getMeta<Settings | null>('settings', null, d),
    words: await d.words.toArray(),
    cards: await d.cards.toArray(),
    reviews: await d.reviews.toArray(),
  }
}

const toDate = (v: unknown) => (v == null ? v : new Date(v as string))

/** Parses a backup file's text, turning JSON date strings back into Dates. */
export function parseBackup(text: string): Backup {
  const data = JSON.parse(text)
  if (data?.app !== 'vocabs' || data.version !== 1 || !Array.isArray(data.words) || !Array.isArray(data.cards)) {
    throw new Error("This doesn't look like a Vocabs backup file")
  }
  for (const c of data.cards as CardRow[]) {
    c.fsrs.due = toDate(c.fsrs.due) as Date
    if (c.fsrs.last_review) c.fsrs.last_review = toDate(c.fsrs.last_review) as Date
  }
  data.reviews ??= []
  return data as Backup
}

/** Replaces everything on this device with the backup's contents. */
export async function restoreBackup(b: Backup, d: VocabDB = db) {
  await d.transaction('rw', [d.words, d.cards, d.reviews, d.meta], async () => {
    await Promise.all([d.words.clear(), d.cards.clear(), d.reviews.clear()])
    await d.words.bulkAdd(b.words)
    await d.cards.bulkAdd(b.cards)
    await d.reviews.bulkAdd(b.reviews)
    if (b.settings) await setMeta('settings', b.settings, d)
  })
}

/** Exports via the iOS share sheet (Save to Files / iCloud Drive), falling back to a download. */
export async function exportBackup(): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const backup = await createBackup()
  const name = `vocabs-backup-${backup.exportedAt.slice(0, 10)}.json`
  const file = new File([JSON.stringify(backup)], name, { type: 'application/json' })
  let result: 'shared' | 'downloaded'
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name })
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled'
      throw e
    }
    result = 'shared'
  } else {
    const url = URL.createObjectURL(file)
    const a = Object.assign(document.createElement('a'), { href: url, download: name })
    a.click()
    URL.revokeObjectURL(url)
    result = 'downloaded'
  }
  await setMeta('lastBackupAt', Date.now())
  return result
}

export const BACKUP_REMINDER_DAYS = 7
