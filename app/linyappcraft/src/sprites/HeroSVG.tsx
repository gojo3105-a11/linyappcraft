import { useEffect, useState } from 'react';

const WALK = [
  { dy: 0,  tilt: 0    },
  { dy: -3, tilt: -1.8 },
  { dy: -5, tilt: 0    },
  { dy: -3, tilt: 1.8  },
];

export function HeroSVG({ size = 100, animate = true }: { size?: number; animate?: boolean }) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (!animate) return;
    const t = setInterval(() => setFrame(f => (f + 1) % 4), 150);
    return () => clearInterval(t);
  }, [animate]);
  const { dy, tilt } = WALK[frame];

  return (
    <svg
      width={size} height={Math.round(size * 1.18)}
      viewBox="0 0 100 118"
      style={{
        transform: `translateY(${dy}px) rotate(${tilt}deg)`,
        transition: 'transform 0.14s cubic-bezier(0.34,1.56,0.64,1)',
        willChange: 'transform',
        overflow: 'visible',
      }}
    >
      <defs>
        {/* 광원: 좌상단 11시 방향 */}
        <radialGradient id="hf" cx="34%" cy="26%" r="72%">
          <stop offset="0%"   stopColor="#FFFCF0"/>
          <stop offset="35%"  stopColor="#F7E5B5"/>
          <stop offset="68%"  stopColor="#D4AA60"/>
          <stop offset="88%"  stopColor="#A07030"/>
          <stop offset="100%" stopColor="#6A4418"/>
        </radialGradient>
        <radialGradient id="hb" cx="30%" cy="22%" r="76%">
          <stop offset="0%"   stopColor="#B87040"/>
          <stop offset="50%"  stopColor="#7A4015"/>
          <stop offset="85%"  stopColor="#3D1A06"/>
          <stop offset="100%" stopColor="#1E0902"/>
        </radialGradient>
        <radialGradient id="hsp" cx="25%" cy="15%" r="80%">
          <stop offset="0%"   stopColor="#8A5020"/>
          <stop offset="50%"  stopColor="#4A2008"/>
          <stop offset="100%" stopColor="#1A0804"/>
        </radialGradient>
        <radialGradient id="hey" cx="30%" cy="25%" r="72%">
          <stop offset="0%"   stopColor="#7799FF"/>
          <stop offset="38%"  stopColor="#2244CC"/>
          <stop offset="65%"  stopColor="#0A1A60"/>
          <stop offset="100%" stopColor="#000418"/>
        </radialGradient>
        <radialGradient id="hear" cx="38%" cy="32%" r="62%">
          <stop offset="0%"   stopColor="#FFB8CC"/>
          <stop offset="55%"  stopColor="#E06090"/>
          <stop offset="100%" stopColor="#A02858"/>
        </radialGradient>
        <radialGradient id="hrib" cx="36%" cy="28%" r="68%">
          <stop offset="0%"   stopColor="#FFA0CC"/>
          <stop offset="55%"  stopColor="#EE1188"/>
          <stop offset="100%" stopColor="#880044"/>
        </radialGradient>
        <radialGradient id="hblush" cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="#FF7090" stopOpacity="0.72"/>
          <stop offset="100%" stopColor="#FF7090" stopOpacity="0"/>
        </radialGradient>

        {/* 전체 외부 시안 글로우 (SC 느낌) */}
        <filter id="hglow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="0" stdDeviation="3.5" floodColor="#00C8FF" floodOpacity="0.55"/>
          <feDropShadow dx="1" dy="5" stdDeviation="5"   floodColor="#001844" floodOpacity="0.7"/>
        </filter>
        {/* 눈 글로우 */}
        <filter id="eyeglow">
          <feDropShadow dx="0" dy="0" stdDeviation="2.5" floodColor="#4499FF" floodOpacity="0.8"/>
        </filter>
        {/* 리본 글로우 */}
        <filter id="ribglow">
          <feDropShadow dx="0" dy="0" stdDeviation="2" floodColor="#FF44AA" floodOpacity="0.7"/>
        </filter>

        {/* AO(앰비언트 오클루전) — 몸통-머리 접합부 */}
        <radialGradient id="hao" cx="50%" cy="100%" r="55%">
          <stop offset="0%"   stopColor="rgba(0,0,0,0.55)"/>
          <stop offset="100%" stopColor="rgba(0,0,0,0)"/>
        </radialGradient>
      </defs>

      <g filter="url(#hglow)">

        {/* ── 가시 (깊이순) ── */}
        {[
          { pts:'22,17 31,40 42,34', lx:23,ly:17,lx2:35,ly2:25 },
          { pts:'38,8  47,34 55,29', lx:39,ly:8, lx2:48,ly2:18 },
          { pts:'51,5  57,29 64,28', lx:52,ly:5, lx2:58,ly2:17 },
          { pts:'64,8  59,28 69,34', lx:65,ly:8, lx2:66,ly2:18 },
          { pts:'78,17 61,34 70,40', lx:79,ly:17,lx2:68,ly2:25 },
        ].map((s,i) => (
          <g key={i}>
            <polygon points={s.pts} fill="url(#hsp)"/>
            {/* 가시 밝은 면 하이라이트 */}
            <line x1={s.lx} y1={s.ly} x2={s.lx2} y2={s.ly2}
              stroke="rgba(220,150,70,0.45)" strokeWidth="1.2" strokeLinecap="round"/>
            {/* 가시 림 라이트 (시안) */}
            <polygon points={s.pts} fill="none"
              stroke="rgba(0,200,255,0.12)" strokeWidth="0.8"/>
          </g>
        ))}

        {/* ── 몸통 ── */}
        <ellipse cx="50" cy="92" rx="30" ry="20" fill="url(#hb)"/>
        {/* 몸통 AO — 머리와의 접합 */}
        <ellipse cx="50" cy="77" rx="26" ry="10" fill="url(#hao)"/>
        {/* 몸통 하이라이트 */}
        <ellipse cx="41" cy="83" rx="14" ry="7.5" fill="white" opacity="0.14"/>
        {/* 림 라이트 (오른쪽 하단 — 반사광) */}
        <ellipse cx="65" cy="96" rx="10" ry="6" fill="rgba(0,200,255,0.08)"/>
        {/* 배 */}
        <ellipse cx="50" cy="94" rx="20" ry="13" fill="#CC9850"/>
        <ellipse cx="44" cy="88" rx="9"  ry="5"  fill="rgba(255,235,170,0.3)"/>

        {/* ── 발 ── */}
        <ellipse cx="34" cy="107" rx="12" ry="7.5" fill="#7A3A10"/>
        <ellipse cx="34" cy="107" rx="9"  ry="5.5" fill="url(#hf)"/>
        <ellipse cx="31" cy="104" rx="4" ry="2.5"  fill="rgba(255,250,230,0.35)"/>
        <ellipse cx="66" cy="107" rx="12" ry="7.5" fill="#7A3A10"/>
        <ellipse cx="66" cy="107" rx="9"  ry="5.5" fill="url(#hf)"/>
        <ellipse cx="63" cy="104" rx="4" ry="2.5"  fill="rgba(255,250,230,0.35)"/>
        {/* 발 AO */}
        {[34,66].map(cx => <ellipse key={cx} cx={cx} cy="112" rx="8" ry="2.5" fill="rgba(0,0,0,0.4)"/>)}

        {/* ── 머리 ── */}
        <ellipse cx="50" cy="55" rx="33" ry="31" fill="url(#hf)"/>
        {/* 머리 1차 하이라이트 (확산) */}
        <ellipse cx="41" cy="41" rx="16" ry="12" fill="white" opacity="0.18"/>
        {/* 머리 2차 하이라이트 (스페큘러) */}
        <ellipse cx="38" cy="37" rx="6"  ry="4"  fill="white" opacity="0.35"/>
        {/* 림 라이트 (오른쪽 — 파란 반사광) */}
        <ellipse cx="76" cy="60" rx="5"  ry="14" fill="rgba(0,200,255,0.07)"/>

        {/* ── 귀 ── */}
        <ellipse cx="23" cy="31" rx="13" ry="12" fill="#8B4818"/>
        <ellipse cx="23" cy="31" rx="13" ry="12" fill="rgba(0,0,0,0)" stroke="rgba(0,200,255,0.1)" strokeWidth="1"/>
        <ellipse cx="23" cy="32" rx="8"  ry="7"  fill="url(#hear)"/>
        <ellipse cx="21" cy="29" rx="3"  ry="2"  fill="rgba(255,230,240,0.6)"/>

        <ellipse cx="77" cy="31" rx="13" ry="12" fill="#8B4818"/>
        <ellipse cx="77" cy="32" rx="8"  ry="7"  fill="url(#hear)"/>
        <ellipse cx="75" cy="29" rx="3"  ry="2"  fill="rgba(255,230,240,0.6)"/>

        {/* ── 눈 왼 ── */}
        <ellipse cx="37" cy="51" rx="11" ry="12" fill="white"/>
        {/* 흰자 내부 그림자 */}
        <ellipse cx="38" cy="55" rx="9.5" ry="7.5" fill="rgba(180,210,255,0.22)"/>
        {/* 홍채 */}
        <circle cx="38" cy="52" r="8.5" fill="url(#hey)" filter="url(#eyeglow)"/>
        {/* 동공 */}
        <circle cx="38" cy="53" r="5.5" fill="#00020E"/>
        {/* 주 하이라이트 */}
        <ellipse cx="41" cy="47" rx="3.5" ry="2.8" fill="rgba(255,255,255,0.96)"/>
        {/* 보조 하이라이트 */}
        <circle cx="35" cy="56" r="1.6" fill="rgba(255,255,255,0.45)"/>
        {/* 홍채 색 광 */}
        <ellipse cx="39" cy="54" rx="3.8" ry="3" fill="rgba(80,150,255,0.25)"/>

        {/* ── 눈 오른 ── */}
        <ellipse cx="63" cy="51" rx="11" ry="12" fill="white"/>
        <ellipse cx="62" cy="55" rx="9.5" ry="7.5" fill="rgba(180,210,255,0.22)"/>
        <circle cx="62" cy="52" r="8.5" fill="url(#hey)" filter="url(#eyeglow)"/>
        <circle cx="62" cy="53" r="5.5" fill="#00020E"/>
        <ellipse cx="65" cy="47" rx="3.5" ry="2.8" fill="rgba(255,255,255,0.96)"/>
        <circle cx="59" cy="56" r="1.6" fill="rgba(255,255,255,0.45)"/>
        <ellipse cx="63" cy="54" rx="3.8" ry="3" fill="rgba(80,150,255,0.25)"/>

        {/* ── 볼 홍조 ── */}
        <ellipse cx="24" cy="64" rx="11" ry="6.5" fill="url(#hblush)"/>
        <ellipse cx="76" cy="64" rx="11" ry="6.5" fill="url(#hblush)"/>

        {/* ── 코 ── */}
        <ellipse cx="50" cy="64" rx="5.5" ry="4.5" fill="#A01848"/>
        <ellipse cx="50" cy="63" rx="3.5" ry="2.5" fill="#E05080"/>
        <ellipse cx="49" cy="62" rx="1.6" ry="1"   fill="rgba(255,210,230,0.8)"/>

        {/* ── 입 ── */}
        <path d="M 43 71 Q 50 79 57 71"
          stroke="#A01848" strokeWidth="2.5" fill="none" strokeLinecap="round"/>

        {/* ── 리본 ── */}
        <path d="M 8 28 C 6 19,17 14,24 23 C 22 33,10 37,8 28 Z"
          fill="url(#hrib)" filter="url(#ribglow)"/>
        <path d="M 8 28 C 6 19,17 14,24 23"
          fill="rgba(255,200,230,0.4)"/>
        <path d="M 25 23 C 33 16,44 20,42 31 C 36 37,25 34,25 23 Z"
          fill="#CC0677"/>
        <circle cx="25" cy="27" r="6" fill="#CC0677"/>
        <circle cx="25" cy="27" r="3.5" fill="#FF88CC"/>
        <ellipse cx="23" cy="25" rx="1.8" ry="1.2" fill="rgba(255,240,248,0.85)"/>
      </g>
    </svg>
  );
}
