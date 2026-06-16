import { sGet, sSet } from './store';

const QUEST_BASE = 'daily_quests_v1';
const COINS_BASE = 'linydory_coins_v1';
const BOOST_BASE = 'linydory_boosters_v1';

export interface QuestSave {
  date: string;
  gamesCleared: number;
  maxCombo: number;
  claimed: { game: boolean; combo: boolean };
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function loadQuests(): QuestSave {
  const d = sGet<QuestSave | null>(QUEST_BASE, null);
  if (d && d.date === todayStr()) return d;
  return { date: todayStr(), gamesCleared: 0, maxCombo: 0, claimed: { game: false, combo: false } };
}

function saveQuests(d: QuestSave) {
  sSet(QUEST_BASE, d);
}

// ── 코인 지갑 ─────────────────────────────────────────
export function loadCoins(): number {
  return sGet<number>(COINS_BASE, 0) || 0;
}

export function addCoins(n: number): number {
  const next = loadCoins() + n;
  sSet(COINS_BASE, next);
  window.dispatchEvent(new Event('coins-updated'));
  return next;
}

export function spendCoins(n: number): boolean {
  const cur = loadCoins();
  if (cur < n) return false;
  sSet(COINS_BASE, cur - n);
  window.dispatchEvent(new Event('coins-updated'));
  return true;
}

// ── 부스터(블럭 제거 아이템) 인벤토리 ──────────────────
export type BoosterKind = 'hammer' | 'bomb' | 'shuffle';

export function loadBoosters(): Record<BoosterKind, number> {
  const d = sGet<Partial<Record<BoosterKind, number>>>(BOOST_BASE, {});
  return { hammer: d.hammer ?? 0, bomb: d.bomb ?? 0, shuffle: d.shuffle ?? 0 };
}

export function saveBoosters(b: Record<BoosterKind, number>) {
  sSet(BOOST_BASE, b);
}

// ── 퀘스트 진행 ───────────────────────────────────────
export function questAddGameCleared(): QuestSave {
  const d = loadQuests();
  d.gamesCleared++;
  saveQuests(d);
  return d;
}

export function questUpdateMaxCombo(combo: number): QuestSave {
  const d = loadQuests();
  if (combo > d.maxCombo) { d.maxCombo = combo; saveQuests(d); }
  return d;
}

const QUEST_REWARD = { game: 300, combo: 500 } as const;

export function questClaim(type: 'game' | 'combo'): { success: boolean; reward: string } {
  const d = loadQuests();
  if (d.claimed[type]) return { success: false, reward: '' };
  const met = type === 'game' ? d.gamesCleared >= 3 : d.maxCombo >= 5;
  if (!met) return { success: false, reward: '' };
  d.claimed[type] = true;
  saveQuests(d);
  addCoins(QUEST_REWARD[type]);
  return { success: true, reward: `🪙 +${QUEST_REWARD[type]}` };
}
