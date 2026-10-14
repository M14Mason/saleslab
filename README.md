# SalesLab: Sell Me a Pen

Voice-only sales practice. You sell a pen to Vince "The Wolf" Marchetti, an original AI buyer character (not a real person), then Claude coaches you.

## How it works
| Piece | Tool | Cost |
|---|---|---|
| Your voice to text | Browser speech recognition | Free |
| Wolf's reply | Claude (Haiku) via `/api/converse` | Claude API |
| Wolf's voice | Kokoro, open-source, runs on your device | Free |
| Coaching report | Claude (Sonnet) via `/api/coach`, cached | Claude API |
| Login + database | Supabase free tier | Free |
| Hosting + backend | Vercel free (Hobby) tier | Free |

## Setup on Windows (PowerShell)
1. Install Node.js LTS from nodejs.org and Git from git-scm.com.
2. Unzip the project, then:
   ```powershell
   cd $HOME\Projects\saleslab
   npm install
   copy .env.example .env
   ```
3. **Supabase:** create a free project at supabase.com. SQL Editor > paste `supabase/migrations/001_init.sql` > Run. Settings > API: copy the URL, anon key, and service_role key into `.env`.
4. **Anthropic:** console.anthropic.com > API Keys (account holder must be 18+). Paste into `.env`. Set a monthly spend limit under Billing.
5. Run locally (needs both):
   ```powershell
   npm i -g vercel
   vercel dev
   ```
   Open http://localhost:3000 in Chrome or Edge.

## Deploy (free)
1. Push to a GitHub repo: `git init`, `git add .`, `git commit -m "init"`, then create the repo on github.com and push.
2. vercel.com > Add New Project > import the repo. Framework: Vite.
3. Add every variable from `.env.example` in Vercel > Settings > Environment Variables. Deploy.
4. In Supabase > Authentication > URL Configuration, set Site URL to your `*.vercel.app` address.

## iPhone install
Open the Vercel URL in Safari > Share > Add to Home Screen. Mic needs Siri enabled (Settings > Siri) for speech recognition.

## Environment variables
- `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`: server only. Never prefix with `VITE_`.
- `BUYER_MODEL`, `COACH_MODEL`: swap models without code changes.
- `DAILY_TURN_LIMIT`: Wolf replies per user per 24h (default 300). Protects your key if someone finds the site.
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`: public, safe in the browser (Row Level Security protects data).

## Tests
`npm test` runs unit + mocked API tests (no network, no charges). `npm run build` type-checks and builds. `npm i -D playwright && npx playwright install chromium && npm run e2e` runs the full browser test (fake mic, mocked backend) after a build.

## Known limits
- iPhone speech recognition is less reliable than Chrome on Windows, and can fail inside the home-screen app. A typing fallback appears if voice input fails.
- First call downloads the voice model (~80 MB, cached after). Slow phones fall back to the built-in system voice.
- Phones stop the mic when locked or switched away. Unfinished calls can be resumed for 2 hours.
