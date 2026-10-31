# now what?

An ADHD-friendly daily hub — a phone web app (PWA) for money, taxes, client work, supplies, home and closet.

- **Today** — what you can spend today, energy check-in, “just these 3” things, log spending, work timer.
- **Money** — budget in two halves (1–14 / 15–end), work timer → invoice → paid → income, taxes (ZUS DRA + RCA + PIT-28) that land in the budget automatically.
- **Supplies** — meds, groceries, cats, home, beauty: “enough until” dates, shopping runs, planned buys flow into the budget.
- **Home** — cleaning in Light / Regular / Extra (picked from your energy), home projects with one next step each.
- **Closet** — wardrobe with photos and wear counts, needs, saved wishes with a 7-day wait, outfits from pairs you choose.

All data stays on the phone (IndexedDB). Settings → “Save backup file” exports a JSON backup; “Restore from backup” loads it. The code contains no personal data: the app starts empty, and your data lives only on your phone and in your backup files.

## Run locally

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build in dist/
```

## Put it on your phone

1. Push this repo to GitHub (branch `main`, public repo).
2. In the repo: **Settings → Pages → Source: GitHub Actions**. The included workflow (`.github/workflows/deploy.yml`) builds and publishes on every push.
3. Open the Pages URL in Safari on the iPhone → Share → **Add to Home Screen**. It opens full-screen and works offline.

Updates: push to `main`; the app updates itself the next time it’s opened.
