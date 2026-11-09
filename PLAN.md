# Vocabs: plan

An iPhone-first web app (PWA) for building **advanced English vocabulary**, with
**Traditional Chinese (繁體)** as a bridge to my first language. Flashcards and
spaced repetition. No Apple developer fee, no Mac required.

## Decisions so far

| Topic | Decision | Why |
|---|---|---|
| Platform | PWA, added to the iPhone Home Screen | Free, no 7-day re-signing, works offline, buildable and testable from Claude Code on the phone |
| Stack | Vite + React + TypeScript, `vite-plugin-pwa` | Small, fast, good offline/service-worker support |
| Storage | IndexedDB on the phone (Dexie) + `navigator.storage.persist()` | Data stays on the device |
| Backups | One-tap **Export** of a JSON backup (iOS share sheet → iCloud Drive / Files), **Import** to restore, and a reminder if no backup in 7 days | "I want things to be saved" without running a backend |
| Scheduling | FSRS (`ts-fsrs`), the algorithm Anki uses now | More efficient than SM-2; grades Again / Hard / Good / Easy |
| Auto-fill | Claude API, called through a tiny **Cloudflare Worker** | Best Chinese and etymology quality; the API key stays server-side |
| Hosting | Cloudflare Pages (free), auto-deploys from this repo | Works with a private repo; the Worker lives in the same account |
| Chinese | Traditional characters; pinyin/zhuyin as a toggle (decide later) | |

## How to make words stick (design principles)

1. **Active recall:** see the word, try to recall it, *then* flip.
2. **Both directions:** word → meaning (recognise) and definition/Chinese → word (produce).
3. **Spaced repetition:** FSRS schedules each card; about 10 new words a day, reviews first.
4. **Depth, not just definitions:** a good example sentence, roots/etymology, and the Chinese
   equivalent as a second hook (e.g. *ubiquitous* → 無處不在, *ubi-* "everywhere").
5. **My own context:** keep the sentence where I found the word and optionally write my own.
6. **Low-friction capture:** adding a word I just met has to take seconds.

## Features

### MVP (v0.1)
- **Add word:** type a word, then auto-fill: part of speech, concise definition, Traditional
  Chinese translation, 1–2 example sentences, etymology/roots, a short memory hook, and
  synonyms with nuance. Every field is editable before saving. Optional "where I saw it" note.
- **Paste a list:** bulk-add many words, auto-filled in the background.
- **Review:** an FSRS queue of due cards: front → tap to flip → Again/Hard/Good/Easy.
  Swipe gestures. Text-to-speech pronunciation (Web Speech API, free and on-device).
- **Word list:** search, edit, delete, suspend.
- **Backup:** export/import JSON; "last backup" indicator.
- **Offline:** review works with no network; auto-fill queues until online.

### v0.2
- **Word of the day:** the Worker asks Claude for an advanced word that isn't already in my list,
  at my level; I accept or skip.
- **Reverse cards** (Chinese/definition → English word, typed answer).
- **iOS Shortcut** for the share sheet: select a word in Safari/Books → Share → "Add to Vocabs".
  It opens `…/#/add?word=…&context=…`. (iOS Safari doesn't support the Web Share Target API, so a
  Shortcut is the workaround.)
- Stats: streak, cards due, retention.

### Later / maybe
- "Use it in a sentence" prompt, with Claude giving feedback.
- Cloze cards built from my own context sentence.
- Sync across devices (would mean adding a backend; deliberately skipped for now).

## Architecture

```
iPhone (Home Screen PWA)                      Cloudflare
┌──────────────────────────────┐   HTTPS    ┌──────────────────────────────┐
│ React UI                     │ ─────────▶ │ Worker /api/define           │
│ Dexie (IndexedDB): words,    │  + app     │   checks APP_TOKEN           │
│   cards, review log          │  token     │   calls Claude API with      │
│ ts-fsrs scheduler            │ ◀───────── │   structured JSON output     │
│ Service worker (offline)     │   JSON     │   secret: ANTHROPIC_API_KEY  │
└──────────────────────────────┘            └──────────────────────────────┘
```

- The Worker URL is public, so it requires an `APP_TOKEN` passphrase (entered once in the app's
  Settings) and has a simple rate limit. Set a monthly spend limit in the Anthropic console too.
- Cost: one auto-fill is a few hundred tokens. With a small/cheap model that's well under a
  cent per word.

### Data model (draft)
- `Word { id, term, pos, definition, zhHant, examples[], etymology, mnemonic, synonyms[],
  context?, source?, createdAt, updatedAt }`
- `Card { id, wordId, direction: 'forward'|'reverse', fsrs: ts-fsrs Card fields, suspended }`
- `ReviewLog { id, cardId, grade, reviewedAt, ... }`
- Backup file = `{ version, exportedAt, words, cards, reviewLogs }`

## Repo layout
- `src/`: the PWA (`srs.ts` already wraps ts-fsrs, with a test)
- `worker/`: the Cloudflare Worker (to be added)

## Milestones
1. ✅ Skeleton: Vite + React + PWA + ts-fsrs, tests and build passing
2. Local data layer (Dexie) + manual add + review screen + export/import
3. Worker + Claude auto-fill + paste-a-list
4. Deploy to Cloudflare Pages + Worker; install on the iPhone
5. v0.2 features

## Open questions
- Pinyin, zhuyin (ㄅㄆㄇ), or neither under the Traditional characters?
- Card front: word only, or word + the context sentence where I found it?
- Which Claude model for auto-fill (cheapest vs. best quality)?
- Daily new-card limit (default 10)?
