const QUEST_KEY = 'daily_quests_v1';
const HH_KEY = 'hedgehog_v2';

export interface QuestSave {
  date: string;
  gamesCleared: number;
  maxCombo: number;
  kills: number;
  claimed: { game: boolean; combo: boolean; kill: boolean };
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function loadQuests(): QuestSave {
  try {
    const d = JSON.parse(localStorage.getItem(QUEST_KEY) ?? 'null') as QuestSave | null;
    if (d?.date === todayStr()) return d;
  } catch {}
  return { date: todayStr(), gamesCleared: 0, maxCombo: 0, kills: 0, claimed: { game: false, combo: false, kill: false } };
}

function saveQuests(d: QuestSave) {
  localStorage.setItem(QUEST_KEY, JSON.stringify(d));
}

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

export function questAddKill(): QuestSave {
  const d = loadQuests();
  d.kills++;
  saveQuests(d);
  return d;
}

export function questClaim(type: 'game' | 'combo' | 'kill'): { success: boolean; reward: string } {
  const d = loadQuests();
  if (d.claimed[type]) return { success: false, reward: '' };
  const met = type === 'game' ? d.gamesCleared >= 3 : type === 'combo' ? d.maxCombo >= 5 : d.kills >= 30;
  if (!met) return { success: false, reward: '' };
  d.claimed[type] = true;
  try {
    const hh = JSON.parse(localStorage.getItem(HH_KEY) ?? '{}');
    if (type === 'game')  { hh.lamp    = (hh.lamp    ?? 80)   + 50;   }
    if (type === 'combo') { hh.diamond = (hh.diamond ?? 500)  + 100;  }
    if (type === 'kill')  { hh.gold    = (hh.gold    ?? 2000) + 1000; }
    localStorage.setItem(HH_KEY, JSON.stringify(hh));
  } catch {}
  saveQuests(d);
  const label = type === 'game' ? '🌰 +50' : type === 'combo' ? '💎 +100' : '💰 +1000';
  return { success: true, reward: label };
}
