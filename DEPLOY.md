# Deploying Vocabs (free, about 10 minutes, once)

One Cloudflare Worker serves both the app and the `/api` auto-fill endpoint, so there's no CORS
or second service. Cloudflare rebuilds and redeploys on every push to the connected branch.

## 1. Anthropic API key
1. Go to console.anthropic.com → **API keys** → create a key (e.g. "vocabs").
2. Under **Limits/Billing**, set a monthly spend limit (e.g. $5). One word costs roughly $0.005.

## 2. Connect the repo in Cloudflare
1. dash.cloudflare.com → **Workers & Pages** → **Create** → **Import a repository** → GitHub,
   and give Cloudflare access to `hennhen/vocabs`.
2. Project name: **`vocabs`** (it must match `name` in `wrangler.jsonc`).
3. Branch: `main` (or the branch you want to deploy from).
4. Build command: `npm run build`
5. Deploy command: `npx wrangler deploy`
6. Save and deploy. The first build takes about a minute.

## 3. Add the two secrets
Worker **vocabs** → **Settings** → **Variables and Secrets** → add, both as type **Secret**:
- `ANTHROPIC_API_KEY`: the key from step 1
- `APP_TOKEN`: a passphrase you make up (long and random; you only type it once on your phone)

Pronunciations use Workers AI (`@cf/deepgram/aura-2-en`) through the `ai` binding in
`wrangler.jsonc`. There's nothing to set up in the dashboard. Each word is generated once and then
cached on the server and on the phone.

## 4. Install on the iPhone
1. Open `https://vocabs.<your-subdomain>.workers.dev` in **Safari**.
2. Share → **Add to Home Screen**.
3. Open Vocabs from the Home Screen → **Settings** → enter the passphrase → **Save**. It should
   say "Connected ✓".
4. Add a word and tap ✨ Auto-fill. That's the first real Claude call.

## Local development
```bash
npm run dev          # UI only, hot reload
npm run dev:worker   # full app + API on :8787 (put APP_TOKEN and ANTHROPIC_API_KEY in .dev.vars;
                     # pronunciation uses Workers AI, which needs `npx wrangler login` locally)
```
