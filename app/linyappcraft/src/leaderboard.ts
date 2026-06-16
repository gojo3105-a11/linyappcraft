// 주간 랭킹 — 백엔드 없이 로컬 최고기록 + 주차 시드 기반 가상 경쟁자로 구성한다.
// (실서비스라면 서버 랭킹 API로 교체)
import { sGet, sSet } from './store';

const LB_BASE = 'linydory_weekly_v1';

// ISO 주차 키 (예: 2026-W25) — 매주 자동 초기화 기준
export function weekKey(d = new Date()): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(
    ((date.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7
  );
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

interface WeeklySave { week: string; best: number; }

export function loadWeeklyBest(): number {
  const d = sGet<WeeklySave | null>(LB_BASE, null);
  return d && d.week === weekKey() ? d.best : 0;
}

// 이번 주 최고 점수 갱신 후 best 반환
export function submitScore(score: number): number {
  const wk = weekKey();
  const d = sGet<WeeklySave | null>(LB_BASE, null);
  const best = d && d.week === wk ? Math.max(d.best, score) : score;
  sSet(LB_BASE, { week: wk, best });
  return best;
}

const NAMES = ['도리킹', '리니짱', '솔방울러버', '가시고슴도치', '콤보마스터', '퍼즐여신', '폭탄해커', '별셋수집가', '삼콤보장인', '무지개도리'];

// mulberry32 — 시드 기반 난수(같은 주 동안 동일한 경쟁자 점수 유지)
function seeded(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface LBEntry { rank: number; name: string; score: number; me?: boolean; }

export function getLeaderboard(myScore: number): LBEntry[] {
  const wk = weekKey();
  let h = 0; for (let i = 0; i < wk.length; i++) h = (h * 31 + wk.charCodeAt(i)) | 0;
  const rnd = seeded(h);
  const base = Math.max(9000, myScore * 1.35);
  const bots = NAMES.map((name, i) => ({
    name,
    score: Math.max(500, Math.floor(base * (0.45 + rnd() * 0.95) - i * 130)),
    me: false,
  }));
  const list = [...bots, { name: '나', score: myScore, me: true }];
  list.sort((a, b) => b.score - a.score);
  return list.map((e, i) => ({ ...e, rank: i + 1 }));
}
