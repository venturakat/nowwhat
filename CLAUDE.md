# Now what? — working on the app

Katya's phone-first, ADHD-friendly daily hub PWA. Public repo github.com/venturakat/nowwhat, deployed to GitHub Pages by GitHub Actions on every push to `main` (~1 min). How the code works: @docs/code.md

## Start of every session
- `git fetch origin && git status && git log --oneline -3`; if behind, `git merge --ff-only origin/main`.
- Several sessions may run at once (Mac and cloud): `git log` before committing; pull before pushing.

## Working
- One feature per session; Katya groups small changes and names the screen (e.g. "Money › Budget › Came in").
- Check: `npx tsc --noEmit -p . && npx vite build --outDir /tmp/nwdist --emptyOutDir` (don't build into the repo's `dist/`). Delete stray `vite.config.ts.timestamp-*.mjs` files.
- If node_modules is missing: `npm ci --no-audit --no-fund`.
- Small tweaks: no Playwright, no screenshots — push and Katya checks on her phone. Quick logic checks: `npx --yes tsx <script.ts>` (script outside the repo).
- After a feature, update `docs/code.md` if the code's structure or behaviour changed. No change-log lines in docs; the commit message is the record (describe the feature with its screen path, e.g. "Money › Budget: …").
- Rolling back: `git revert <sha>`.

## Commit and push
- Add files explicitly — never `git add .` (`Claude outputs/` and backups are local stuff).
- Push to `main` when the check passes and Katya asked for the change; she tests on her phone after the deploy.
- Deploy status: `curl -s "https://api.github.com/repos/venturakat/nowwhat/actions/runs?per_page=1"`. If deploy-pages fails with "Deployment failed, try again later", push an empty commit (`--allow-empty`).

## iCloud offloading
The Mac copy sits in iCloud-synced Documents; macOS may evict files (reads fail with "Resource deadlock avoided", tsc says "File not found"). Fix: open/download the files (Finder › Download Now), or set the GitHub folder to Keep Downloaded.

## Playwright (only for big features / layout work)
- Build, serve with `python3 -m http.server 4173 -d /tmp/nwdist`, run Playwright against it. Keep test scripts outside the repo.
- Seed old-shaped state by writing to IndexedDB (`keyval-store` / `keyval` / key `now-what-state`) then reload. Click `.splash` to skip the loading screen. Mock rate APIs with `page.route` (fulfilled mocks need `access-control-allow-origin: *`; later-registered routes win). Mock open-meteo.com if testing weather.
- Settings gear = `getByLabel('Settings')` (uk `Налаштування`, ru `Настройки`, es `Ajustes`); a context with `locale: 'uk-UA'` / `'ru-RU'` / `'es-AR'` starts the app in that language. Stacked sheets stay mounted — use `.last()` for the top sheet. FormSheet `select` fields render as pill buttons (click by name, not `selectOption`). Playwright mouse drags drive `DragList`.

## Hard rule: public code, private data
The repo is public. No personal data in the code or docs (no salary, clients, meds, subscriptions, account numbers, lesson prices, her ZUS amounts, selfcare prices, recipes, body data, city/coordinates, birthdays, period dates, cleaning lists/schedule). Tax preset amounts = 0. Her data lives only on her phone (IndexedDB) and comes in via Settings › Backup › Restore or is added in the app. USDA personal API keys must not be used (DEMO_KEY only). Private notes go in `CLAUDE.local.md` (git-ignored), never here.

## Her UI preferences
Calm, minimal text; no counts on home blocks; no "≈" signs; British wording; collapsible detail lists closed by default; iOS-like navigation; cards that hug their content; destructive actions need a second tap (armed button = red stroke + red "Delete"); button labels without "…"; tight rows within a group, more air between groups; no duplicated settings (a rate source chosen in Settings › Currencies isn't asked again elsewhere); temperatures in °C; drag-and-drop instead of arrow buttons; nothing hard-coded to her own routine (people set their own days/frequencies; presets generic); reuse existing controls over new screens/buttons (e.g. skip a month = set the fee to 0); direct buttons over "More" pop-up menus; after editing something opened from a screen, land back on that screen. "Overdue" in her wording = not paid/done by the end of the fortnight it belongs to. Things she tried and rejected: flex-fill note field to the keyboard; a separate "Skip a month" sheet; a "Phone language" chip.

## Helper ideas
- Exact text replacements: a short python read-modify-write that fails if the old text isn't found exactly once.
- New i18n keys go into all three dictionaries (`src/i18n/uk.ts`, `ru.ts`, `es.ts`); duplicate keys break tsc. Check that every literal `tr('…')` / `trn` key used in changed files exists in each dictionary.
