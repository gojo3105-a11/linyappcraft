# 리니와도리의 가시소동 (LinyDory) Game Project

This is a match-3 puzzle game built with React + TypeScript + Vite.

## Key files
- `src/LinyDoryGame.tsx` — main game component (match-3, shop, settings, boosters, bottom nav)
- `src/App.tsx` — renders LinyDoryGame + DailyReward, restores saved login/scope on mount (`auth.initAccount`)
- `src/DailyReward.tsx` — daily login streak reward popup
- `src/quest.ts` — coins wallet, boosters inventory, daily quests
- `src/store.ts` — account-scoped localStorage wrapper (keys suffixed by account scope)
- `src/auth.ts` — login: guest (fully working) + Google/Kakao (scaffolded; activate via VITE_GOOGLE_CLIENT_ID / VITE_KAKAO_JS_KEY)
- `src/platform.ts` — device bridge (Capacitor native back/exit on APK, no-op on web)
- `src/billing.ts` — purchase shim (simulated; wire real store billing here)
- `src/index.css` — minimal global styles
- `capacitor.config.ts` — Android APK config (appId `com.linydory.game`)

## Notes
- Stage rules: each stage has collection targets (`genTargets` — block colors, plus crates if present). Clearing = all targets collected within moves; stars = 1 + score tiers (`goal[0]`/`goal[1]`). Next stage unlocks at 1★. Win streak (`linydory_streak_v1`) places up to 3 specials at start; pre-game boosters (row/col/bomb/allClear) are placed as specials and consumed. Star chest every 30★ on home.
- Screens (`phase`): splash → `main` (Anipang-style home: MAIN.png art, top pills, left/right event rails, big STAGE button) → `worlds` (world grid) → `map` (stage path) → `play`/`end`. Bottom nav: 상점/홈/월드맵/설정.
- Stages/worlds are infinite: `levelDef(i)` / `worldOf(w)` generate on demand (no fixed LEVELS array); progress array grows as stages are cleared (`curStageOf`). Generators guarantee jelly only on matchable cells and crates next to matchable cells (`matchableMask`).
- Storage is scoped per account via `store.ts` (`base::scope`). Scope = `guest` (default) or `google:<id>` / `kakao:<id>` after login.
- Build: plain Vite. `npm run build` → `dist/`. Web (GitHub Pages) build uses base `/linyappcraft/` (set by `GITHUB_ACTIONS`); APK build uses base `/` (set by `CAP=1`).
- APK: Capacitor. CI workflow `.github/workflows/build-apk.yml` runs `cap add android` + `gradlew assembleDebug` and uploads the debug APK artifact. The `android/` folder is generated in CI, not tracked. A signed release APK needs your own keystore.
- Login (`auth.ts`): guest works with no keys. Google/Kakao are scaffolded — set `VITE_GOOGLE_CLIENT_ID` / `VITE_KAKAO_JS_KEY` and implement the TODO OAuth flow to activate.
- Payment: `billing.ts#purchase` is a shim that always falls back to the simulated `pay` modal (no external store billing yet).
- Back button: `platform.ts#onBackEvent` uses Capacitor hardware back on APK (no-op on web); `LinyDoryGame` closes overlays → pause → map → main → `closeApp()` step by step.

## Reference docs (load only when needed)
- `docs/skills/apps-in-toss.md` — Apps in Toss platform guide
- `docs/skills/tds-mobile.md` — TDS Mobile component reference
