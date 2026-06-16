import { sGet, sSet } from './store';

const QUEST_BASE = 'daily_quests_v1';
const COINS_BASE = 'linydory_coins_v1';
const BOOST_BASE = 'linydory_boosters_v1';

export type QuestKey = 'clear1' | 'clear3' | 'combo5' | 'special5' | 'blocks200';
export type Difficulty = '쉬움' | '보통' | '어려움';

export interface QuestSave {
  date: string;
  gamesCleared: number;
  maxCombo: number;
  specialsMade: number;
  blocksCleared: number;
  claimed: Record<QuestKey, boolean>;
}

export interface QuestDef {
  key: QuestKey;
  icon: string;
  label: string;
  difficulty: Difficulty;
  target: number;
  reward: number;                // 난이도가 높을수록 코인 보상이 큼
  metric: (q: QuestSave) => number;
}

// 일일 퀘스트 5종 — 난이도에 따라 코인 지급량 차등
export const QUESTS: QuestDef[] = [
  { key:'clear1',    icon:'🎮', label:'게임 1판 클리어',     difficulty:'쉬움',   target:1,   reward:100,  metric:q=>q.gamesCleared  },
  { key:'clear3',    icon:'🏆', label:'게임 3판 클리어',     difficulty:'보통',   target:3,   reward:300,  metric:q=>q.gamesCleared  },
  { key:'combo5',    icon:'⚡', label:'5x 콤보 달성',        difficulty:'보통',   target:5,   reward:500,  metric:q=>q.maxCombo      },
  { key:'special5',  icon:'💣', label:'특수 블럭 5개 만들기', difficulty:'어려움', target:5,   reward:800,  metric:q=>q.specialsMade  },
  { key:'blocks200', icon:'🧱', label:'블럭 200개 터트리기',  difficulty:'어려움', target:200, reward:1200, metric:q=>q.blocksCleared },
];

const emptyClaimed = (): Record<QuestKey, boolean> =>
  ({ clear1:false, clear3:false, combo5:false, special5:false, blocks200:false });

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function loadQuests(): QuestSave {
  const d = sGet<Partial<QuestSave> | null>(QUEST_BASE, null);
  if (d && d.date === todayStr()) {
    return {
      date: d.date,
      gamesCleared:  d.gamesCleared  ?? 0,
      maxCombo:      d.maxCombo      ?? 0,
      specialsMade:  d.specialsMade  ?? 0,
      blocksCleared: d.blocksCleared ?? 0,
      claimed: { ...emptyClaimed(), ...(d.claimed ?? {}) },
    };
  }
  return { date: todayStr(), gamesCleared:0, maxCombo:0, specialsMade:0, blocksCleared:0, claimed: emptyClaimed() };
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

export function questAddSpecials(n: number): QuestSave {
  const d = loadQuests();
  if (n > 0) { d.specialsMade += n; saveQuests(d); }
  return d;
}

export function questAddBlocks(n: number): QuestSave {
  const d = loadQuests();
  if (n > 0) { d.blocksCleared += n; saveQuests(d); }
  return d;
}

export function questClaim(key: QuestKey): { success: boolean; reward: string } {
  const d = loadQuests();
  if (d.claimed[key]) return { success: false, reward: '' };
  const def = QUESTS.find(q => q.key === key);
  if (!def || def.metric(d) < def.target) return { success: false, reward: '' };
  d.claimed[key] = true;
  saveQuests(d);
  addCoins(def.reward);
  return { success: true, reward: `🪙 +${def.reward}` };
}
