import type Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import { z } from 'zod'

export const MODEL = 'claude-sonnet-5-5'

export const Definition = z.object({
  isWord: z.boolean().describe('false if the input is not a real English word or phrase (e.g. a typo)'),
  suggestion: z.string().describe('If isWord is false, the most likely intended word; otherwise empty'),
  term: z.string().describe('The word as it should be stored, lowercase unless it is a proper noun'),
  pos: z.string().describe('Part of speech for the main sense, e.g. "adjective"'),
  definition: z.string(),
  zhHant: z.string(),
  examples: z.array(z.string()),
  etymology: z.string(),
  mnemonic: z.string(),
  synonyms: z.array(z.string()),
})
export type Definition = z.infer<typeof Definition>

export const SYSTEM = `You write flashcards for a vocabulary app. The learner is a native English speaker who grew up with Chinese as their first language. They are building an advanced English vocabulary (the kind found in serious books, journalism and essays) and use Traditional Chinese only as a bridge to connect each word to concepts they already know.

For the word given, write the card for its most common sense in adult reading:
- definition: a precise, plain-English definition in at most 20 words, in the style of a good learner's dictionary. Do not use the word itself or a form of it.
- zhHant: the closest Traditional Chinese equivalent(s) as used in Taiwan, 1 to 3 options separated by "；". Characters only, with no pinyin, zhuyin or explanations.
- examples: exactly 2 natural sentences such as a thoughtful writer would use, each showing the word in context.
- etymology: the roots in one short line, with what each part means, e.g. "Latin ubique 'everywhere' + -ous". Empty string if unknown.
- mnemonic: one short, memorable hook that links the meaning to the roots, the sound, or the Chinese. No more than 20 words.
- synonyms: up to 4 near-synonyms, each followed by a few words on how it differs, e.g. "omnipresent (more formal, often of God)".
If the input is misspelled or not a word, set isWord to false, put the likely intended word in suggestion, and fill the other fields for that intended word.`

/** Asks Claude for a flashcard. Throws on refusal or unparseable output. */
export async function defineWord(client: Anthropic, term: string): Promise<Definition> {
  const response = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 4000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: betaZodOutputFormat(Definition) },
    system: SYSTEM,
    messages: [{ role: 'user', content: term }],
  })
  if (response.stop_reason === 'refusal') throw new Error('Claude declined to define this word')
  if (!response.parsed_output) throw new Error(`Could not read Claude's answer (stop: ${response.stop_reason})`)
  return response.parsed_output
}

/** Accepts words and short phrases only, so the endpoint can't be used as a general chatbot. */
export function cleanTerm(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const t = input.trim().replace(/\s+/g, ' ')
  if (!t || t.length > 60 || !/^[\p{L}][\p{L}' -]*$/u.test(t) || t.split(' ').length > 5) return null
  return t
}
