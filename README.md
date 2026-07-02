# MyPetStore Ad Studio 🐾

AI-powered ad generator for mypetstore.shop — inspired by Zeely.

## What it does
- Enter any product name, price & description
- Choose platform (Facebook, Instagram, TikTok, Google)
- Choose format (Static Ad, Video Script, Carousel, Story/Reel)
- Choose copywriting framework (AIDA, PAS, Before-After-Bridge, FAB)
- Claude AI writes 3 scroll-stopping ad variations in seconds
- Copy the copy → paste into Meta Ads Manager or TikTok Ads

---

## Deploy to Netlify (2 minutes)

### Option A — Drag & Drop (fastest)
1. Install dependencies and build:
   ```
   npm install
   npm run build
   ```
2. Go to https://app.netlify.com/drop
3. Drag the `dist/` folder into the browser
4. Done — you get a live URL instantly

### Option B — GitHub + Netlify (auto-deploys)
1. Push this folder to a GitHub repo
2. Go to https://app.netlify.com → "Add new site" → "Import from Git"
3. Set build command: `npm run build`
4. Set publish directory: `dist`
5. Deploy — Netlify auto-rebuilds on every push

---

## Run locally
```
npm install
npm run dev
```
Open http://localhost:5173

---

## Tech stack
- React 18 (currently deployed as a build-free `dist/index.html` + `dist/app.jsx` that transpiles JSX in-browser via Babel Standalone, loaded from a CDN — no `npm run build` required to deploy; `src/App.jsx` is kept in sync for when a proper Vite build is set up)
- Anthropic Claude API (claude-sonnet-5) via a Netlify serverless function at `/api/generate`
- Set the `ANTHROPIC_API_KEY` environment variable in Netlify's site settings (Site configuration → Environment variables) — required for ad generation to work
- Netlify for hosting (free tier works great)

---

## Share to Social (easiest — manual, no setup)

The "Share to Social" panel on the results screen opens Facebook, X, LinkedIn, or Pinterest's own share dialog in a new tab, using the platform you're already logged into in your browser. There's nothing to configure — no developer app, no OAuth, no API keys.

- **X and Pinterest** pre-fill your ad headline + hook as the post text.
- **Facebook and LinkedIn** only pre-fill the product link (both platforms dropped support for pre-filled captions years ago) — click "Copy All Copy" on the ad card first, then paste it into the caption box that opens.

This is fully manual (you click "Post" yourself on each platform) but has zero setup and zero permission issues.

We tried two automated alternatives first — a Zapier webhook, and a direct Meta Marketing API integration (OAuth connect + paused draft campaign creation) — but both ran into the same blocker: Zapier's Facebook Pages action and Meta's Marketing API both require your Facebook Page to be properly linked to your account via Meta Business Suite (Business Portfolio/Page permissions), which we couldn't get working. Both were removed in favor of this simpler share-link approach. If you resolve that Facebook Business Suite linkage on your own later, either automated approach could be rebuilt.

---

## Generate Video (free, in-browser — Video Script format only)

On the results screen for a "Video Script" ad, "Generate Video" renders the script as an animated text-overlay video — hook, then each script line/stage-direction, then the CTA, faded in/out over a branded background — entirely in your browser using the Canvas and MediaRecorder APIs. No external API, no cost, no account needed.

This is **kinetic typography, not a filmed ad** — there's no real footage, actors, or product shots, just animated captions timed to a rough reading pace (~2.5 words/second). Output is a downloadable `.webm` video (720×1280, vertical). Requires a modern Chromium or Firefox browser — Safari's support for `canvas.captureStream()` + `MediaRecorder` together is inconsistent, so this may not work there.

If you want real AI-generated video with actual visuals (not just text), that's a separate, paid integration (e.g. Runway, Google Veo) — let us know if you want to pursue that instead/as well.
