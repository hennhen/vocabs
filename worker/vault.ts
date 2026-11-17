import { DurableObject } from 'cloudflare:workers'

/** Characters per stored chunk; keeps each value well under the 128 KiB storage limit. */
export const CHUNK = 30_000

export interface SnapshotInfo {
  gen: number
  parts: number
  words: number
  savedAt: number
}
interface Meta extends SnapshotInfo {
  prev: SnapshotInfo | null
}

/**
 * The phone's synced copy of the deck (the same JSON as a backup file).
 * Keeps the latest snapshot and the one before it.
 */
export class Vault extends DurableObject {
  async save(json: string, words: number): Promise<SnapshotInfo> {
    const meta = await this.ctx.storage.get<Meta>('meta')
    if (meta && meta.words > 0 && words === 0) {
      throw new Error(`Refusing to replace ${meta.words} synced words with an empty deck. Restore from cloud first.`)
    }
    const gen = (meta?.gen ?? 0) + 1
    const chunks: string[] = []
    for (let i = 0; i < json.length; i += CHUNK) chunks.push(json.slice(i, i + CHUNK))
    for (let i = 0; i < chunks.length; i += 100) {
      const batch: Record<string, string> = {}
      chunks.slice(i, i + 100).forEach((c, j) => (batch[`g${gen}:${i + j}`] = c))
      await this.ctx.storage.put(batch)
    }
    const info: SnapshotInfo = { gen, parts: chunks.length, words, savedAt: Date.now() }
    const prev = meta ? { gen: meta.gen, parts: meta.parts, words: meta.words, savedAt: meta.savedAt } : null
    // Written last, so a half-finished save never replaces the current snapshot.
    await this.ctx.storage.put('meta', { ...info, prev } satisfies Meta)
    if (meta?.prev) await this.drop(meta.prev)
    return info
  }

  async load(which: 'latest' | 'previous' = 'latest'): Promise<string | null> {
    const meta = await this.ctx.storage.get<Meta>('meta')
    const snap = which === 'latest' ? meta : meta?.prev
    if (!snap) return null
    const keys = Array.from({ length: snap.parts }, (_, i) => `g${snap.gen}:${i}`)
    let out = ''
    for (let i = 0; i < keys.length; i += 100) {
      const got = await this.ctx.storage.get<string>(keys.slice(i, i + 100))
      for (const k of keys.slice(i, i + 100)) out += got.get(k) ?? ''
    }
    return out
  }

  async info(): Promise<{ latest: SnapshotInfo | null; previous: SnapshotInfo | null }> {
    const meta = await this.ctx.storage.get<Meta>('meta')
    if (!meta) return { latest: null, previous: null }
    const { prev, ...latest } = meta
    return { latest, previous: prev }
  }

  private async drop(snap: SnapshotInfo) {
    const keys = Array.from({ length: snap.parts }, (_, i) => `g${snap.gen}:${i}`)
    for (let i = 0; i < keys.length; i += 100) await this.ctx.storage.delete(keys.slice(i, i + 100))
  }
}
