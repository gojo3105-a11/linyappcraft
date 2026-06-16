import { useState, useEffect } from 'react';
import { addCoins } from './quest';
import { sGet, sSet } from './store';

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

function claimReward(streak: number, reward: number) {
  sSet(DR_BASE, { lastDate: todayStr(), streak });
  addCoins(reward);
}

const CSS = `
  @keyframes drBounce {
    0%,100% { transform: translateY(0); }
    50%      { transform: translateY(-6px); }
  }
  @keyframes drPop {
    0%   { opacity:0; transform:scale(0.7) translateY(30px); }
    70%  { transform:scale(1.05) translateY(-4px); }
    100% { opacity:1; transform:scale(1) translateY(0); }
  }
  @keyframes drShine {
    0%,100% { opacity:0.6; }
    50%      { opacity:1; }
  }
`;

export default function DailyReward() {
  const [closed, setClosed] = useState(false);
  const [, setTick] = useState(0);

  // 로그인(계정 전환)으로 저장소 스코프가 바뀌면 다시 평가
  useEffect(() => {
    const refresh = () => { setClosed(false); setTick(t => t + 1); };
    window.addEventListener('scope-changed', refresh);
    return () => window.removeEventListener('scope-changed', refresh);
  }, []);

  const { show, streak, reward } = calc();
  const daySlot = (streak - 1) % 7;

  if (!show || closed) return null;

  const streakEmoji = streak >= 7 ? '🔥🔥🔥' : streak >= 3 ? '🔥🔥' : '🔥';

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '20px',
    }}>
      <style>{CSS}</style>
      <div style={{
        width: '100%', maxWidth: 360,
        background: 'linear-gradient(160deg,#1a0535 0%,#0d1a3a 60%,#0a0d1a 100%)',
        borderRadius: 28, overflow: 'hidden',
        border: '2px solid rgba(255,180,0,0.45)',
        boxShadow: '0 0 60px rgba(255,140,0,0.3), 0 20px 60px rgba(0,0,0,0.8)',
        animation: 'drPop 0.45s cubic-bezier(0.34,1.56,0.64,1) both',
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 20px 14px',
          background: 'linear-gradient(135deg,rgba(255,140,0,0.15),rgba(180,0,255,0.1))',
          borderBottom: '1px solid rgba(255,180,0,0.2)',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'rgba(255,220,100,0.8)', letterSpacing: 2, marginBottom: 4 }}>📅 출석 체크</div>
          <div style={{ fontSize: 32, fontWeight: 900, color: '#FFD700', lineHeight: 1.1 }}>
            {streakEmoji} {streak}일 연속!
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 4 }}>
            {streak >= 7 ? '완벽한 한 주 달성! 🎉' : `7일 연속 출석 시 특별 보상`}
          </div>
        </div>

        {/* 7-day grid */}
        <div style={{ padding: '16px 16px 12px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
            {REWARDS.map((_, i) => {
              const isPast = i < daySlot;
              const isToday = i === daySlot;
              return (
                <div key={i} style={{
                  borderRadius: 10, padding: '6px 2px',
                  background: isToday
                    ? 'linear-gradient(135deg,#FF8C00,#FFD700)'
                    : isPast
                    ? 'rgba(255,180,0,0.12)'
                    : 'rgba(255,255,255,0.05)',
                  border: isToday
                    ? '2px solid #FFE566'
                    : isPast
                    ? '1px solid rgba(255,180,0,0.3)'
                    : '1px solid rgba(255,255,255,0.1)',
                  boxShadow: isToday ? '0 0 16px rgba(255,180,0,0.6)' : 'none',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                  position: 'relative',
                  animation: isToday ? 'drShine 1.5s ease infinite' : 'none',
                }}>
                  <span style={{ fontSize: 8, fontWeight: 800, color: isToday ? 'white' : 'rgba(255,255,255,0.4)' }}>
                    {i + 1}일
                  </span>
                  <span style={{ fontSize: isPast ? 14 : 11, lineHeight: 1 }}>
                    {isPast ? '✅' : isToday ? '🎁' : i === 6 ? '👑' : '📦'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Today's reward */}
        <div style={{
          margin: '0 16px 16px',
          padding: '14px',
          background: 'rgba(255,180,0,0.08)',
          borderRadius: 16, border: '1px solid rgba(255,180,0,0.25)',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', marginBottom: 4, letterSpacing: 1 }}>오늘의 보상</div>
          <div style={{
            fontSize: 22, fontWeight: 900, color: '#FFD700',
            textShadow: '0 0 20px rgba(255,200,0,0.8)',
            animation: 'drBounce 1.5s ease infinite',
          }}>
            🪙 ×{reward.toLocaleString()}
          </div>
        </div>

        {/* Collect button */}
        <div style={{ padding: '0 16px 20px' }}>
          <button
            onClick={() => { claimReward(streak, reward); setClosed(true); }}
            style={{
              width: '100%', padding: '15px',
              borderRadius: 999, border: 'none', cursor: 'pointer',
              background: 'linear-gradient(135deg,#FF8C00 0%,#FFD700 50%,#FF8C00 100%)',
              backgroundSize: '200% 100%',
              color: '#3D1C00', fontWeight: 900, fontSize: 18, letterSpacing: 1,
              boxShadow: '0 6px 0 #8B4500, 0 10px 30px rgba(255,140,0,0.5)',
              transition: 'transform 0.1s, box-shadow 0.1s',
            }}
            onTouchStart={e => { e.currentTarget.style.transform = 'scale(0.97)'; e.currentTarget.style.boxShadow = '0 3px 0 #8B4500, 0 6px 20px rgba(255,140,0,0.4)'; }}
            onTouchEnd={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 6px 0 #8B4500, 0 10px 30px rgba(255,140,0,0.5)'; }}
          >
            🎁 보상 수령하기
          </button>
        </div>
      </div>
    </div>
  );
}
