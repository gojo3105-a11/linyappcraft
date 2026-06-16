const QUEST_KEY = 'daily_quests_v1';
const COINS_KEY = 'linydory_coins_v1';

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
  try {
    const d = JSON.parse(localStorage.getItem(QUEST_KEY) ?? 'null') as QuestSave | null;
    if (d?.date === todayStr()) return d;
  } catch {}
  return { date: todayStr(), gamesCleared: 0, maxCombo: 0, claimed: { game: false, combo: false } };
}

function saveQuests(d: QuestSave) {
  localStorage.setItem(QUEST_KEY, JSON.stringify(d));
}

// ── 코인 지갑 ─────────────────────────────────────────
export function loadCoins(): number {
  try { return JSON.parse(localStorage.getItem(COINS_KEY) ?? '0') || 0; }
  catch { return 0; }
}

export function addCoins(n: number): number {
  const next = loadCoins() + n;
  localStorage.setItem(COINS_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event('coins-updated'));
  return next;
}

export function spendCoins(n: number): boolean {
  const cur = loadCoins();
  if (cur < n) return false;
  localStorage.setItem(COINS_KEY, JSON.stringify(cur - n));
  window.dispatchEvent(new Event('coins-updated'));
  return true;
}

// ── 부스터(블럭 제거 아이템) 인벤토리 ──────────────────
const BOOST_KEY = 'linydory_boosters_v1';
export type BoosterKind = 'hammer' | 'bomb' | 'shuffle';

export function loadBoosters(): Record<BoosterKind, number> {
  try {
    const d = JSON.parse(localStorage.getItem(BOOST_KEY) ?? 'null');
    if (d) return { hammer: d.hammer ?? 0, bomb: d.bomb ?? 0, shuffle: d.shuffle ?? 0 };
  } catch {}
  return { hammer: 0, bomb: 0, shuffle: 0 };
}

export function saveBoosters(b: Record<BoosterKind, number>) {
  localStorage.setItem(BOOST_KEY, JSON.stringify(b));
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
