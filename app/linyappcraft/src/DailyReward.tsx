import { useState, useEffect } from 'react';
import { addCoins } from './quest';
import { sGet, sSet } from './store';
import { C, Panel, Ribbon, CloseBtn, GIcon } from './ui';

const DR_BASE = 'daily_reward_v1';

interface DRSave { lastDate: string; streak: number; }

// 일자별 코인 보상 (7일차 보너스)
const REWARDS = [100, 150, 200, 300, 400, 500, 1000] as const;

function todayStr() { return new Date().toISOString().slice(0, 10); }

function getYesterdayStr() {
  const d = new Date(); d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function calc(): { show: boolean; streak: number; reward: number } {
  const save = sGet<DRSave>(DR_BASE, { lastDate: '', streak: 0 });
  const t = todayStr();
  if (save.lastDate === t) return { show: false, streak: save.streak, reward: REWARDS[(save.streak - 1) % 7] };
  const streak = save.lastDate === getYesterdayStr() ? save.streak + 1 : 1;
  return { show: true, streak, reward: REWARDS[(streak - 1) % 7] };
}

/** 오늘 아직 받지 않은 출석 보상이 있는지(홈 아이콘 배지용) */
export function dailyPending(): boolean { return calc().show; }

function claimReward(streak: number, reward: number) {
  sSet(DR_BASE, { lastDate: todayStr(), streak });
  addCoins(reward);
}

const CSS = `
  @keyframes drPop {
    0%   { opacity:0; transform:scale(0.7) translateY(30px); }
    70%  { transform:scale(1.04) translateY(-4px); }
    100% { opacity:1; transform:scale(1) translateY(0); }
  }
  @keyframes drToday {
    0%,100% { transform:translateY(0) scale(1); }
    50%      { transform:translateY(-4px) scale(1.05); }
  }
`;

export default function DailyReward() {
  const [open, setOpen] = useState(() => calc().show);   // 앱을 켠 날 아직 못 받았으면 자동으로 열려요
  const [, setTick] = useState(0);

  // 홈의 출석 아이콘으로 다시 열기 / 로그인(계정 전환) 시 다시 평가
  useEffect(() => {
    const show = () => { setTick(t => t + 1); setOpen(true); };
    const refresh = () => { setTick(t => t + 1); setOpen(calc().show); };
    window.addEventListener('open-daily-reward', show);
    window.addEventListener('scope-changed', refresh);
    return () => { window.removeEventListener('open-daily-reward', show); window.removeEventListener('scope-changed', refresh); };
  }, []);

  if (!open) return null;

  const { show: pending, streak, reward } = calc();
  const daySlot = (streak - 1) % 7;
  const close = () => setOpen(false);

  // 하루 칸 — 지난 날은 체크, 오늘은 통통 튀는 선물, 앞으로의 날은 보상 코인
  const tile = (i: number) => {
    const isPast = pending ? i < daySlot : i <= daySlot;
    const isToday = pending && i === daySlot;
    const last = i === 6;
    return (
      <div key={i} style={{
        gridColumn: last ? 'span 2' : undefined, position: 'relative', borderRadius: 16, padding: '20px 4px 8px', minHeight: 84,
        background: isToday ? '#FFF0B8' : isPast ? '#DDF3CF' : C.creamDeep,
        border: `3px solid ${isToday ? C.orange : isPast ? '#7CC66B' : C.creamLine}`,
        boxShadow: isToday ? `0 0 0 2px ${C.orangeDark}, 0 0 14px rgba(255,170,40,0.8)` : 'inset 0 -4px 0 rgba(0,0,0,0.06)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
        animation: isToday ? 'drToday 1.3s ease-in-out infinite' : undefined,
      }}>
        <span style={{ position: 'absolute', top: -2, left: '50%', transform: 'translateX(-50%)', padding: '0 10px 2px', borderRadius: '0 0 10px 10px', background: isToday ? C.orange : isPast ? '#58B04A' : '#B9A27A', color: '#fff', fontSize: 12, whiteSpace: 'nowrap' }}>
          {isToday ? '오늘' : `${i + 1}일`}
        </span>
        <GIcon name={isPast ? 'check' : last ? 'gift' : 'coin'} size={last ? 40 : 32} style={isPast ? { background: '#58B04A', borderRadius: '50%', padding: 5, boxSizing: 'content-box', width: 24, height: 24 } : undefined} />
        <span style={{ fontSize: last ? 20 : 16, color: C.brown }}>{REWARDS[i].toLocaleString()}</span>
      </div>
    );
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(14,34,84,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <style>{CSS}</style>
      <Panel maxWidth={348} style={{ padding: '34px 14px 16px', animation: 'drPop 0.45s cubic-bezier(0.34,1.56,0.64,1) both' }}>
        <div style={{ position: 'absolute', top: -26, left: 0, right: 0, display: 'flex', justifyContent: 'center' }}><Ribbon size={22}>출석 체크</Ribbon></div>
        <CloseBtn onClick={close} />
        <div style={{ textAlign: 'center', color: C.brown, marginBottom: 12 }}>
          <div style={{ fontSize: 26, lineHeight: 1.1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <GIcon name="flame" size={30} /> {streak}일 연속 출석!
          </div>
          <div style={{ fontSize: 13, color: C.brownSoft, marginTop: 3 }}>{streak >= 7 ? '완벽한 한 주! 7일째 보너스를 받아요' : '7일 연속 출석하면 1,000코인을 드려요'}</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 7 }}>
          {REWARDS.map((_, i) => tile(i))}
        </div>
        <div style={{ marginTop: 14 }}>
          {pending ? (
            <button className="gbtn green" onClick={() => { claimReward(streak, reward); close(); }} style={{ width: '100%', height: 58, fontSize: 24, letterSpacing: 1 }}>
              보상 받기 · {reward.toLocaleString()}
            </button>
          ) : (
            <button className="gbtn cream" onClick={close} style={{ width: '100%', height: 54, fontSize: 20 }}>오늘은 받았어요 · 내일 또 만나요</button>
          )}
        </div>
      </Panel>
    </div>
  );
}
