import { sGet, sSet } from './store';

const QUEST_BASE = 'daily_quests_v1';
const COINS_BASE = 'linydory_coins_v1';
const BOOST_BASE = 'linydory_boosters_v1';
const LIVES_BASE = 'linydory_lives_v1';

// ── 하트(플레이 가능 횟수) ─────────────────────────────
export const LIVES_MAX = 15;
const LIVES_REGEN_MS = 10 * 60 * 1000; // 10분당 1개 자동 충전
interface LivesSave { lives: number; ts: number }

function readLives(): LivesSave {
  const d = sGet<LivesSave | null>(LIVES_BASE, null);
  if (!d || typeof d.lives !== 'number') return { lives: LIVES_MAX, ts: Date.now() };
  if (d.lives >= LIVES_MAX) return { lives: LIVES_MAX, ts: Date.now() };
  const gained = Math.floor((Date.now() - d.ts) / LIVES_REGEN_MS);
  if (gained <= 0) return d;
  const lives = Math.min(LIVES_MAX, d.lives + gained);
  const ts = lives >= LIVES_MAX ? Date.now() : d.ts + gained * LIVES_REGEN_MS;
  const next = { lives, ts };
  sSet(LIVES_BASE, next);
  return next;
}

export function loadLives(): number { return readLives().lives; }

// 다음 1개 충전까지 남은 ms (가득 차면 0)
export function nextLifeMs(): number {
  const st = readLives();
  if (st.lives >= LIVES_MAX) return 0;
  return Math.max(0, st.ts + LIVES_REGEN_MS - Date.now());
}

export function spendLife(): boolean {
  const st = readLives();
  if (st.lives <= 0) return false;
  const wasFull = st.lives >= LIVES_MAX;
  sSet(LIVES_BASE, { lives: st.lives - 1, ts: wasFull ? Date.now() : st.ts });
  window.dispatchEvent(new Event('lives-updated'));
  return true;
}

export function addLives(n: number): number {
  const st = readLives();
  const lives = Math.min(LIVES_MAX, st.lives + n);
  sSet(LIVES_BASE, { lives, ts: st.ts });
  window.dispatchEvent(new Event('lives-updated'));
  return lives;
}

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
  hearts: number;                // 완료 보상: 하트 개수(난이도에 따라 차등)
  metric: (q: QuestSave) => number;
}

// 난이도별 하트 보상: 쉬움 1, 보통 2, 어려움 3
const HEARTS_BY_DIFF: Record<Difficulty, number> = { '쉬움': 1, '보통': 2, '어려움': 3 };

// 일일 퀘스트 5종 — 완료 시 난이도에 따라 하트 지급
export const QUESTS: QuestDef[] = [
  { key:'clear1',    icon:'🎮', label:'게임 1판 클리어',     difficulty:'쉬움',   target:1,   hearts:HEARTS_BY_DIFF['쉬움'],   metric:q=>q.gamesCleared  },
  { key:'clear3',    icon:'🏆', label:'게임 3판 클리어',     difficulty:'보통',   target:3,   hearts:HEARTS_BY_DIFF['보통'],   metric:q=>q.gamesCleared  },
  { key:'combo5',    icon:'⚡', label:'5x 콤보 달성',        difficulty:'보통',   target:5,   hearts:HEARTS_BY_DIFF['보통'],   metric:q=>q.maxCombo      },
  { key:'special5',  icon:'💣', label:'특수 블럭 5개 만들기', difficulty:'어려움', target:5,   hearts:HEARTS_BY_DIFF['어려움'], metric:q=>q.specialsMade  },
  { key:'blocks200', icon:'🧱', label:'블럭 200개 터트리기',  difficulty:'어려움', target:200, hearts:HEARTS_BY_DIFF['어려움'], metric:q=>q.blocksCleared },
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
  addLives(def.hearts);            // 난이도에 따른 하트 지급
  return { success: true, reward: `💗 +${def.hearts}` };
}
