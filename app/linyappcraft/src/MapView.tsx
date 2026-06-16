import { useEffect, useRef } from 'react';

const ZONES = [
  { name: '숲 입구',   emoji: '🌿', from: 0  },
  { name: '깊은 숲',   emoji: '🌳', from: 10 },
  { name: '산악 지대', emoji: '⛰️', from: 20 },
  { name: '설원',      emoji: '❄️', from: 30 },
  { name: '화산 지대', emoji: '🌋', from: 40 },
  { name: '드래곤 성', emoji: '🐉', from: 50 },
  { name: '무한 심연', emoji: '🌀', from: 60 },
  { name: '신의 영역', emoji: '⚡', from: 70 },
];

const ZONE_SIZE = 10;

function isBoss(n: number) { return n > 0 && n % ZONE_SIZE === 0; }

function nodeLabel(n: number, stage: number) {
  if (n === stage) return '🦔';
  if (isBoss(n)) return n < stage ? '★' : '👾';
  return String(n + 1);
}

function nodeCls(n: number, stage: number) {
  if (n < stage) return 'mn-done';
  if (n === stage) return 'mn-cur';
  return 'mn-lock';
}

interface Props { stage: number; onClose: () => void }

export default function MapView({ stage, onClose }: Props) {
  const curRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTimeout(() => curRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80);
  }, []);

  return (
    <div className="mv">
      <div className="mv-bar">
        <span className="mv-title">🗺 WORLD MAP</span>
        <span className="mv-sub">STAGE {stage + 1}</span>
        <button className="mv-x" onClick={onClose}>✕</button>
      </div>

      <div className="mv-scroll">
        {ZONES.map((z, zi) => {
          const unlocked = stage >= z.from;
          const isCurZone = stage >= z.from && stage < z.from + ZONE_SIZE;
          const cleared = Math.max(0, Math.min(stage - z.from, ZONE_SIZE));

          return (
            <div key={zi} className={`mz${isCurZone ? ' mz-active' : ''}${!unlocked ? ' mz-locked' : ''}`}>
              {/* Zone Header */}
              <div className="mz-head">
                <span className="mz-ico">{unlocked ? z.emoji : '🔒'}</span>
                <span className="mz-name">{z.name}</span>
                {unlocked && (
                  <>
                    <div className="mz-pbar">
                      <div className="mz-pfill" style={{ width: `${(cleared / ZONE_SIZE) * 100}%` }} />
                    </div>
                    <span className="mz-pct">{cleared}/{ZONE_SIZE}</span>
                  </>
                )}
              </div>

              {/* Stage path: snake (row1 L→R, row2 R←L) */}
              {unlocked && (
                <div className="mz-path">
                  {/* Row 1: stages z.from+0 … z.from+4 (LTR) */}
                  <div className="mp-row">
                    {[0, 1, 2, 3, 4].flatMap(i => {
                      const n = z.from + i;
                      const done = n + 1 <= stage;
                      return [
                        <div
                          key={`n${n}`}
                          ref={n === stage ? curRef : null}
                          className={`mn ${nodeCls(n, stage)}${isBoss(n) ? ' mn-boss' : ''}`}
                        >
                          {nodeLabel(n, stage)}
                        </div>,
                        ...(i < 4
                          ? [<div key={`l${n}`} className={`mp-h${done ? ' mp-on' : ''}`} />]
                          : []),
                      ];
                    })}
                  </div>

                  {/* Vertical connector — right side */}
                  <div className="mp-vc-r">
                    <div className={`mp-v${z.from + 5 <= stage ? ' mp-on' : ''}`} />
                  </div>

                  {/* Row 2: stages z.from+5 … z.from+9 (RTL, DOM order 5→9, flex-direction:row-reverse) */}
                  <div className="mp-row mp-rtl">
                    {[5, 6, 7, 8, 9].flatMap(i => {
                      const n = z.from + i;
                      const done = n + 1 <= stage;
                      return [
                        <div
                          key={`n${n}`}
                          ref={n === stage ? curRef : null}
                          className={`mn ${nodeCls(n, stage)}${isBoss(n) ? ' mn-boss' : ''}`}
                        >
                          {nodeLabel(n, stage)}
                        </div>,
                        ...(i < 9
                          ? [<div key={`l${n}`} className={`mp-h${done ? ' mp-on' : ''}`} />]
                          : []),
                      ];
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* Beyond known map */}
        {stage >= 80 && (
          <div className="mz mz-active">
            <div className="mz-head">
              <span className="mz-ico">❓</span>
              <span className="mz-name">미지의 영역</span>
              <span className="mz-pct">∞</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
