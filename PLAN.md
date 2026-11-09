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
| Hosting | One Cloudflare Worker (free) serves the built app *and* `/api`; auto-deploys from this repo | One service, same origin (no CORS), works with a private repo. See DEPLOY.md |
| Chinese | Traditional characters only, no pinyin/zhuyin | It's there for correlation, not to learn pronunciation |
| Card front | The word only | Pure recall; the context of where I found it isn't stored |
| Auto-fill model | Claude Sonnet 5.5 (`claude-sonnet-5-5`) with structured JSON output | Good quality; about $0.005 per word |
| Autocomplete | Offline bundled English word list, prefix search as I type | Instant, works offline, no API cost per keystroke |

## How to make words stick (design principles)

1. **Active recall:** see the word, try to recall it, *then* flip.
2. **Both directions:** word → meaning (recognise) and definition/Chinese → word (produce).
3. **Spaced repetition:** FSRS schedules each card; due reviews come first, then new cards.
   **Daily new-card limit: 20** (adjustable), with a "Study 10 more" button. Adding words is never
   limited; the limit only controls how many *start* reviewing each day. Each new card brings
   several future reviews, so steady intake keeps reviews to roughly 10–20 min/day and avoids
   the review pile-ups that make people quit. If more than 200 reviews are due, new cards pause
   until the backlog clears. The study day rolls over at 4am. A "learning" card is shown at most
   2 minutes early, so the short in-session gaps actually happen.
4. **Depth, not just definitions:** a good example sentence, roots/etymology, and the Chinese
   equivalent as a second hook (e.g. *ubiquitous* → 無處不在, *ubi-* "everywhere").
5. **My own sentence (optional):** writing one later helps the word stick.
6. **Low-friction capture:** adding a word I just met has to take seconds.

## Features

### MVP (v0.1)
- **Autocomplete while typing:** suggestions from a bundled, frequency-ranked English word list
  (lazy-loaded, offline). Words already in my deck are marked so I don't add duplicates. Picking a
  suggestion triggers auto-fill.
- **Add word:** type a word, then auto-fill: part of speech, concise definition, Traditional
  Chinese translation, 1–2 example sentences, etymology/roots, a short memory hook, and
  synonyms with nuance. Every field is editable before saving.
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
- Cost: Sonnet 5.5 is $2 / $10 per million input/output tokens. One auto-fill is about 300 in and
  500 out, so roughly $0.005 per word (about $1 per 200 words). Run it at low effort to keep thinking short.

### Data model (draft)
- `Word { id, term, pos, definition, zhHant, examples[], etymology, mnemonic, synonyms[],
  createdAt, updatedAt }`
- `Card { id, wordId, direction: 'forward'|'reverse', fsrs: ts-fsrs Card fields, suspended }`
- `ReviewLog { id, cardId, grade, reviewedAt, ... }`
- Backup file = `{ version, exportedAt, words, cards, reviewLogs }`

## Repo layout
- `src/`: the PWA. `srs.ts` (scheduling + daily queue), `db.ts` (IndexedDB), `backup.ts`,
  `autocomplete.ts`, `screens/`
- `public/words.txt`: ~67k English words ranked by frequency, for autocomplete. Regenerate with
  `scripts/build-wordlist.mjs` (sources: SUBTLEX-US frequencies, ISC; `word-list`, MIT)
- `worker/`: the Cloudflare Worker. `define.ts` holds the Claude prompt and output schema; `index.ts` handles
  routing, the passphrase check and input validation

## Milestones
1. ✅ Skeleton: Vite + React + PWA + ts-fsrs, tests and build passing
2. ✅ Local data layer (Dexie), add with autocomplete, paste a list, review screen, word list/edit,
   export/import backups, Settings
3. ✅ Worker + Claude auto-fill (on picking a suggestion or ✨ button), did-you-mean for typos,
   background fill for pasted lists, passphrase in Settings
4. ✅ Deployed on Cloudflare; installed on the iPhone; auto-fill is working live
5. ✅ Word list opens full cards (‹ › to browse, then Edit); edit fields grow to fit; share-sheet
   capture through an iOS Shortcut and a server inbox (Durable Object). See SHORTCUT.md
6. Remaining v0.2: word of the day, reverse cards, stats

## Open questions
- None right now.
