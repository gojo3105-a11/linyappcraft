# 리니와도리의 가시소동 (LinyDory) Game Project

This is a match-3 puzzle game built with React + TypeScript + Vite.

## Key files
- `src/LinyDoryGame.tsx` — main game component (match-3, shop, settings, boosters, bottom nav)
- `src/App.tsx` — renders LinyDoryGame + DailyReward, resolves Toss account scope on mount
- `src/DailyReward.tsx` — daily login streak reward popup
- `src/quest.ts` — coins wallet, boosters inventory, daily quests
- `src/store.ts` — account-scoped localStorage wrapper (keys suffixed by Toss anonymous key)
- `src/toss.ts` — Apps in Toss SDK wrapper (appLogin / getAnonymousKey) with browser fallback
- `src/index.css` — minimal global styles
- `granite.config.ts` — brand color #1976D2

## Notes
- Storage is scoped per account via `store.ts` (`base::scope`). Scope = Toss anonymous key hash, or `guest` outside the Toss app.
- Payment is simulated (shop "충전·결제" tab). Real Toss IAP (`IAP.createOneTimePurchaseOrder`) requires console product registration + server grant + running inside the Toss app.

## Reference docs (load only when needed)
- `docs/skills/apps-in-toss.md` — Apps in Toss platform guide
- `docs/skills/tds-mobile.md` — TDS Mobile component reference
