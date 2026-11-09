import { DurableObject } from 'cloudflare:workers'

const MAX = 500

/** Words sent from the iOS share sheet, waiting for the app to pick them up. */
export class Inbox extends DurableObject {
  async add(term: string): Promise<{ added: boolean; waiting: number }> {
    const terms = (await this.ctx.storage.get<string[]>('terms')) ?? []
    if (terms.includes(term)) return { added: false, waiting: terms.length }
    if (terms.length >= MAX) throw new Error('Inbox is full; open Vocabs to empty it')
    terms.push(term)
    await this.ctx.storage.put('terms', terms)
    return { added: true, waiting: terms.length }
  }

  /** Returns every waiting word and empties the inbox (atomic: a Durable Object runs one call at a time). */
  async take(): Promise<string[]> {
    const terms = (await this.ctx.storage.get<string[]>('terms')) ?? []
    if (terms.length) await this.ctx.storage.delete('terms')
    return terms
  }
}
