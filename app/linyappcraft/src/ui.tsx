// 게임 UI 키트 — 색 토큰, 패널·리본, 직접 그린 스티커풍 SVG 아이콘.
// 모든 화면이 같은 색·같은 외곽선(진한 남색)·같은 둥근 모서리를 쓰도록 한곳에 모았어요.
import type { CSSProperties, ReactNode } from 'react';

export const C = {
  ink: '#1F3B73',        // 아이콘·외곽선
  cream: '#FFF5DE',      // 패널 바탕
  creamDeep: '#F4DFB4',  // 패널 안쪽 오목한 칸
  creamLine: '#E3C98F',
  rim: '#4C8FE0',        // 패널 테두리(밝은 파랑)
  rimDark: '#2A63B8',
  brown: '#5B3F22',      // 크림 바탕 위 글자
  brownSoft: '#8E6E47',
  red: '#E85A47', redDark: '#B13A2B',
  green: '#58C94A', greenDark: '#2B8B25',
  orange: '#FFA63A', orangeDark: '#C2660C',
  gold: '#FFC83A', goldDark: '#C98A0E',
};

/** 크림색 패널 + 파란 테두리(레퍼런스 팝업 스타일) */
export function Panel({ children, style, maxWidth = 340 }: { children: ReactNode; style?: CSSProperties; maxWidth?: number }) {
  return (
    <div style={{
      position: 'relative', width: '100%', maxWidth, background: C.cream, borderRadius: 28,
      border: `6px solid ${C.rim}`,
      boxShadow: `0 0 0 3px ${C.rimDark}, 0 8px 0 3px ${C.rimDark}, 0 22px 40px rgba(0,0,0,0.5), inset 0 0 0 3px #fff`,
      ...style,
    }}>{children}</div>
  );
}

/** 접힌 꼬리가 있는 빨간 리본 제목 */
export function Ribbon({ children, size = 22, style }: { children: ReactNode; size?: number; style?: CSSProperties }) {
  const tail = (side: 'left' | 'right'): CSSProperties => ({
    position: 'absolute', top: 9, [side]: -24, width: 44, height: '100%', background: C.redDark, zIndex: 0,
    clipPath: side === 'left' ? 'polygon(0 0,100% 0,100% 100%,0 100%,26% 50%)' : 'polygon(0 0,100% 0,100% 100%,74% 50%,0 100%)',
  } as CSSProperties);
  return (
    <div style={{ position: 'relative', display: 'inline-block', ...style }}>
      <span aria-hidden style={tail('left')} /><span aria-hidden style={tail('right')} />
      <div style={{
        position: 'relative', zIndex: 1, padding: `6px ${size + 14}px 8px`, borderRadius: 10, color: '#fff', fontSize: size, lineHeight: 1.1, letterSpacing: 1,
        background: `linear-gradient(180deg, #F4725F 0%, #F4725F 50%, ${C.red} 52%, ${C.red} 100%)`,
        boxShadow: `0 4px 0 ${C.redDark}, inset 0 2px 0 rgba(255,255,255,0.45)`, textShadow: `0 2px 0 ${C.redDark}`, whiteSpace: 'nowrap',
      }}>{children}</div>
    </div>
  );
}

/** 파란 동그라미 닫기 버튼 */
export function CloseBtn({ onClick, style }: { onClick: () => void; style?: CSSProperties }) {
  return (
    <button onClick={onClick} aria-label="닫기" className="gbtn blue" style={{ position: 'absolute', top: -14, right: -10, width: 40, height: 40, padding: 0, borderRadius: '50%', zIndex: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', ...style }}>
      <GIcon name="close" size={20} />
    </button>
  );
}

/** 원형 받침 — 아이콘을 담는 둥근 틀(작은 아이콘용). 외곽선 대신 흰 베벨 + 부드러운 그림자 */
export function Medal({ hue, children, size = 62 }: { hue: string; children: ReactNode; size?: number }) {
  return (
    <span style={{
      position: 'relative', width: size, height: size, flexShrink: 0, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: `radial-gradient(circle at 50% 22%, #ffffff 0%, ${hue} 72%)`, border: '3px solid rgba(255,255,255,0.95)',
      boxShadow: '0 5px 8px rgba(10,30,90,0.35), inset 0 -4px 6px rgba(0,0,0,0.12)',
    }}>{children}</span>
  );
}

export type GIconName =
  | 'calendar' | 'slot' | 'gift' | 'tag' | 'clip' | 'flame' | 'shop' | 'home' | 'map' | 'gear'
  | 'coin' | 'plus' | 'star' | 'close' | 'check' | 'lock' | 'bolt' | 'crate' | 'jelly' | 'acorn' | 'question'
  | 'hammer' | 'bomb' | 'rowclear' | 'colclear' | 'allclear' | 'shuffle' | 'rock';

// ── 기하 도우미 ───────────────────────────────────────────────
const f2 = (n: number) => Number(n.toFixed(2));
const polar = (cx: number, cy: number, r: number, a: number): [number, number] => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
const starPts = (cx: number, cy: number, ro: number, ri: number): [number, number][] =>
  Array.from({ length: 10 }, (_, i) => polar(cx, cy, i % 2 ? ri : ro, -Math.PI / 2 + i * Math.PI / 5));
const pts = (p: [number, number][]) => p.map(([x, y]) => `${f2(x)},${f2(y)}`).join(' ');
function gearPath(cx: number, cy: number, teeth: number, ro: number, ri: number) {
  const step = (2 * Math.PI) / teeth; let d = '';
  for (let i = 0; i < teeth; i++) {
    const a = i * step - Math.PI / 2;
    const q = [polar(cx, cy, ri, a - step * 0.27), polar(cx, cy, ro, a - step * 0.15), polar(cx, cy, ro, a + step * 0.15), polar(cx, cy, ri, a + step * 0.27)];
    d += `${i ? 'L' : 'M'}${f2(q[0][0])} ${f2(q[0][1])}L${f2(q[1][0])} ${f2(q[1][1])}L${f2(q[2][0])} ${f2(q[2][1])}L${f2(q[3][0])} ${f2(q[3][1])}`;
    const nx = polar(cx, cy, ri, a + step - step * 0.27);
    d += `A${ri} ${ri} 0 0 1 ${f2(nx[0])} ${f2(nx[1])}`;
  }
  return d + 'Z';
}
const sector = (cx: number, cy: number, r: number, a0: number, a1: number) => {
  const p0 = polar(cx, cy, r, a0), p1 = polar(cx, cy, r, a1);
  return `M${cx} ${cy}L${f2(p0[0])} ${f2(p0[1])}A${r} ${r} 0 0 1 ${f2(p1[0])} ${f2(p1[1])}Z`;
};

/** 모든 아이콘이 공유하는 그라데이션·그림자 정의 — 앱 최상단에 한 번만 두면 돼요 */
export function GIconDefs() {
  const lin = (id: string, stops: [number, string][], x2 = 0, y2 = 1) => (
    <linearGradient key={id} id={id} x1="0" y1="0" x2={x2} y2={y2}>{stops.map(([o, c], i) => <stop key={i} offset={o} stopColor={c} />)}</linearGradient>
  );
  return (
    <svg width="0" height="0" style={{ position: 'absolute', pointerEvents: 'none' }} aria-hidden focusable="false">
      <defs>
        {lin('gi-gold',  [[0, '#FFF3A6'], [0.38, '#FFD233'], [1, '#E08A00']])}
        {lin('gi-goldD', [[0, '#F2B21A'], [1, '#A8630A']])}
        {lin('gi-red',   [[0, '#FF9A86'], [0.45, '#EE4A35'], [1, '#B0261A']])}
        {lin('gi-blue',  [[0, '#8AD0FF'], [0.5, '#3A8EF0'], [1, '#1B4FB4']])}
        {lin('gi-green', [[0, '#B4F08A'], [0.5, '#4DBF3A'], [1, '#2A8426']])}
        {lin('gi-purple',[[0, '#D3BCFF'], [0.5, '#8F5EF2'], [1, '#5430B2']])}
        {lin('gi-pink',  [[0, '#FFC2DA'], [0.5, '#F2619E'], [1, '#B3306A']])}
        {lin('gi-orange',[[0, '#FFD08A'], [0.5, '#FF9026'], [1, '#CC5608']])}
        {lin('gi-wood',  [[0, '#E2AE72'], [0.5, '#B67A3C'], [1, '#7C4A22']])}
        {lin('gi-woodL', [[0, '#F0C48C'], [1, '#C58A4A']])}
        {lin('gi-steel', [[0, '#F4F7FC'], [0.45, '#BCC7DC'], [1, '#7B88A6']])}
        {lin('gi-cream', [[0, '#FFFFFF'], [1, '#EFE3C8']])}
        {lin('gi-parch', [[0, '#FFF8E2'], [1, '#EBD8A6']])}
        {lin('gi-navy',  [[0, '#6C7DB0'], [0.5, '#2E3B66'], [1, '#141C3A']])}
        {lin('gi-glass', [[0, '#CFEBFF'], [1, '#7DB8F0']])}
        {lin('gi-rock',  [[0, '#CBD2DE'], [0.55, '#8F9AB0'], [1, '#5C6781']])}
        {lin('gi-brick', [[0, '#D9856B'], [1, '#9C4A38']])}
        {lin('gi-hi',    [[0, '#FFFFFF'], [1, '#FFFFFF']], 0, 1)}
        <linearGradient id="gi-hiFade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity="0.85" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></linearGradient>
        <radialGradient id="gi-sphere" cx="35%" cy="28%" r="75%"><stop offset="0" stopColor="#fff" stopOpacity="0.9" /><stop offset="0.35" stopColor="#fff" stopOpacity="0" /></radialGradient>
        <radialGradient id="gi-ball" cx="38%" cy="30%" r="80%"><stop offset="0" stopColor="#7F90C6" /><stop offset="0.55" stopColor="#2E3B66" /><stop offset="1" stopColor="#111833" /></radialGradient>
        <radialGradient id="gi-ruby" cx="38%" cy="30%" r="80%"><stop offset="0" stopColor="#FFB3A4" /><stop offset="0.5" stopColor="#EE4A35" /><stop offset="1" stopColor="#9C1D12" /></radialGradient>
        <filter id="gi-sh" x="-25%" y="-20%" width="150%" height="160%"><feDropShadow dx="0" dy="2.4" stdDeviation="1.7" floodColor="#0A1A4A" floodOpacity="0.5" /></filter>
        <filter id="gi-sh2" x="-25%" y="-20%" width="150%" height="160%"><feDropShadow dx="0" dy="1.2" stdDeviation="0.9" floodColor="#0A1A4A" floodOpacity="0.45" /></filter>
      </defs>
    </svg>
  );
}

const u = (id: string) => `url(#gi-${id})`;
// 얇은 어두운 테두리(외곽선 대신 같은 색의 어두운 톤)
const rim = (c: string, w = 1.2) => ({ stroke: c, strokeWidth: w, strokeLinejoin: 'round' as const });

/** 게임용 렌더링 아이콘 — 위에서 아래로 번지는 그라데이션, 베벨, 반사광, 부드러운 그림자 (왼쪽 위 광원) */
export function GIcon({ name, size = 40, style, bare = false }: { name: GIconName; size?: number | string; style?: CSSProperties; bare?: boolean }) {
  const body = (() => {
    switch (name) {
      case 'coin': return (<g filter="url(#gi-sh)">
        <circle cx="32" cy="32" r="27" fill={u('goldD')} />
        <circle cx="32" cy="32" r="23.5" fill={u('gold')} />
        <circle cx="32" cy="32" r="19.5" fill="none" stroke="#C47A00" strokeOpacity="0.55" strokeWidth="1.4" />
        <polygon points={pts(starPts(32.8, 33.4, 11.5, 4.9))} fill="#B86C00" opacity="0.55" />
        <polygon points={pts(starPts(32, 32.4, 11.5, 4.9))} fill="#FFF4B0" stroke="#D68A00" strokeWidth="0.9" strokeLinejoin="round" />
        <path d="M12.5 25a21 21 0 0 1 15-12.5" stroke="#fff" strokeOpacity="0.85" strokeWidth="3" fill="none" strokeLinecap="round" />
      </g>);
      case 'star': {
        const o = starPts(32, 33, 28, 12);
        return (<g filter="url(#gi-sh)">
          <polygon points={pts(o)} fill={u('goldD')} stroke="#B87400" strokeWidth="1.2" strokeLinejoin="round" />
          {Array.from({ length: 5 }, (_, i) => (<g key={i}>
            <polygon points={pts([[32, 33], o[i * 2], o[(i * 2 + 1) % 10]])} fill="#FFE57A" />
            <polygon points={pts([[32, 33], o[(i * 2 + 1) % 10], o[(i * 2 + 2) % 10]])} fill="#F5B31C" />
          </g>))}
          <polygon points={pts(o)} fill="none" stroke="#C98400" strokeWidth="1.3" strokeLinejoin="round" />
          <ellipse cx="23" cy="22" rx="3.2" ry="2" fill="#fff" opacity="0.8" transform="rotate(-35 23 22)" />
        </g>);
      }
      case 'gear': return (<g filter="url(#gi-sh)">
        <path d={gearPath(32, 32, 8, 28, 21.5)} fill={u('gold')} stroke="#B87400" strokeWidth="1.3" strokeLinejoin="round" />
        <circle cx="32" cy="32" r="14.5" fill={u('goldD')} />
        <circle cx="32" cy="32" r="12" fill={u('gold')} stroke="#C47A00" strokeOpacity="0.6" strokeWidth="1" />
        <circle cx="32" cy="32" r="6.2" fill="#6B4300" />
        <circle cx="32" cy="32.8" r="5" fill="#2E1D00" opacity="0.7" />
        <path d="M12.5 24a21 21 0 0 1 11-10.5" stroke="#fff" strokeOpacity="0.85" strokeWidth="2.6" fill="none" strokeLinecap="round" />
      </g>);
      case 'home': return (<g filter="url(#gi-sh)">
        <rect x="40" y="9" width="8" height="15" rx="1.2" fill={u('brick')} />
        <rect x="39" y="8" width="10" height="4" rx="1.2" fill="#B7604A" />
        <rect x="13" y="28" width="38" height="27" rx="3" fill={u('cream')} {...rim('#C9B48A')} />
        <path d="M13 28h38v5H13z" fill="#000" opacity="0.06" />
        <path d="M5.5 32 32 9l26.5 23z" fill={u('red')} {...rim('#8E2217')} />
        <path d="M32 9 5.5 32H32z" fill="#fff" opacity="0.18" />
        <path d="M10 31.5 32 12.5M16 31.5 32 17.5M22 31.5 32 22.5" stroke="#8E2217" strokeOpacity="0.28" strokeWidth="1" fill="none" />
        <rect x="27" y="38" width="10" height="17" rx="5" ry="5" fill={u('wood')} {...rim('#5C3416')} />
        <circle cx="34.5" cy="47" r="1.2" fill="#FFE27A" />
        <rect x="16.5" y="36" width="7" height="7" rx="1.2" fill={u('glass')} {...rim('#4A78B8')} /><path d="M20 36v7M16.5 39.5h7" stroke="#fff" strokeOpacity="0.8" strokeWidth="0.9" />
        <rect x="40.5" y="36" width="7" height="7" rx="1.2" fill={u('glass')} {...rim('#4A78B8')} /><path d="M44 36v7M40.5 39.5h7" stroke="#fff" strokeOpacity="0.8" strokeWidth="0.9" />
      </g>);
      case 'shop': {
        const stripes = Array.from({ length: 5 }, (_, i) => {
          const tx0 = 12 + i * 8, bx0 = 6 + i * 10.4;
          return <path key={i} d={`M${tx0} 12H${tx0 + 8}L${f2(bx0 + 10.4)} 29A5.2 5.2 0 0 1 ${f2(bx0)} 29Z`} fill={i % 2 ? u('cream') : u('red')} />;
        });
        return (<g filter="url(#gi-sh)">
          <rect x="11" y="28" width="42" height="27" rx="2.5" fill={u('parch')} {...rim('#B89A62')} />
          <rect x="25" y="36" width="14" height="19" rx="2" fill={u('wood')} {...rim('#5C3416')} />
          <rect x="27" y="38" width="10" height="9" rx="1" fill={u('glass')} opacity="0.9" />
          <rect x="14.5" y="34" width="8" height="11" rx="1.4" fill={u('glass')} {...rim('#4A78B8')} />
          <rect x="41.5" y="34" width="8" height="11" rx="1.4" fill={u('glass')} {...rim('#4A78B8')} />
          {stripes}
          <path d="M12 12h40l6 17H6z" fill="none" stroke="#8E2217" strokeOpacity="0.55" strokeWidth="1.2" strokeLinejoin="round" />
          <path d="M12 12h40" stroke="#fff" strokeOpacity="0.7" strokeWidth="2.2" strokeLinecap="round" />
        </g>);
      }
      case 'map': return (<g filter="url(#gi-sh)">
        <path d="M5 14 21 9v43L5 57z" fill={u('green')} />
        <path d="M21 9 43 15v43L21 52z" fill="#CFF2B0" />
        <path d="M43 15 59 10v43L43 58z" fill={u('green')} />
        <path d="M21 9v43M43 15v43" stroke="#2A8426" strokeOpacity="0.45" strokeWidth="1.2" />
        <path d="M5 14 21 9 43 15 59 10v43L43 58 21 52 5 57z" fill="none" stroke="#2A7A24" strokeWidth="1.3" strokeLinejoin="round" />
        <path d="M11 47c6-10 14 1 21-9s14-8 17-14" stroke="#fff" strokeWidth="2.4" strokeDasharray="1 5" strokeLinecap="round" fill="none" />
        <ellipse cx="43" cy="39" rx="5" ry="1.8" fill="#0A1A4A" opacity="0.28" />
        <path d="M43 17a8 8 0 0 1 8 8c0 6-8 16-8 16s-8-10-8-16a8 8 0 0 1 8-8z" fill={u('red')} stroke="#8E2217" strokeWidth="1.1" />
        <circle cx="43" cy="25" r="3.2" fill="#fff" />
        <path d="M38.5 21.5a6 6 0 0 1 4-3" stroke="#fff" strokeOpacity="0.8" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      </g>);
      case 'flame': return (<g filter="url(#gi-sh)">
        <path d="M32 4c2 11 16 17 16 34a16 16 0 0 1-32 0c0-8 4-12 8-17 0 6 3 9 6 9-1-9-1-17 2-26z" fill={u('orange')} stroke="#B8420A" strokeWidth="1.2" strokeLinejoin="round" />
        <path d="M32 24c8 7 12 12 12 19a12 12 0 0 1-24 0c0-6 5-10 12-19z" fill={u('gold')} />
        <path d="M32 38c4 4 6 7 6 10a6 6 0 0 1-12 0c0-3 2-6 6-10z" fill="#FFF8D2" />
        <path d="M22 28c-3 4-4 8-3 12" stroke="#fff" strokeOpacity="0.55" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      </g>);
      case 'tag': return (<g filter="url(#gi-sh)">
        <path d="M9 31 31 9h20a6 6 0 0 1 6 6v20L35 57a6 6 0 0 1-8.5 0L9 39.5A6 6 0 0 1 9 31z" fill={u('blue')} stroke="#1B4FB4" strokeWidth="1.3" strokeLinejoin="round" />
        <path d="M13 33 33 13h18a3 3 0 0 1 3 3v8L30 48 13 38z" fill="#fff" opacity="0.16" />
        <path d="M46 15c9-6 14 3 8 8" stroke="#F2E4BC" strokeWidth="2.4" fill="none" strokeLinecap="round" />
        <circle cx="47" cy="22" r="5" fill="#0F2A66" /><circle cx="47" cy="22" r="5" fill="none" stroke={u('steel')} strokeWidth="2" />
        <circle cx="26" cy="31" r="4.4" fill="#fff" /><circle cx="38" cy="43" r="4.4" fill="#fff" />
        <path d="M41 28 23 46" stroke="#fff" strokeWidth="4.2" strokeLinecap="round" />
        <circle cx="26" cy="31" r="1.8" fill="#2F86E8" /><circle cx="38" cy="43" r="1.8" fill="#2F86E8" />
      </g>);
      case 'clip': return (<g filter="url(#gi-sh)">
        <rect x="14" y="10" width="36" height="44" rx="2.5" fill={u('parch')} stroke="#B89A62" strokeWidth="1.2" />
        <rect x="9" y="5" width="46" height="11" rx="5.5" fill={u('woodL')} stroke="#8A5A28" strokeWidth="1.2" />
        <rect x="9" y="48" width="46" height="11" rx="5.5" fill={u('woodL')} stroke="#8A5A28" strokeWidth="1.2" />
        <path d="M13 8.5h38" stroke="#fff" strokeOpacity="0.55" strokeWidth="1.8" strokeLinecap="round" />
        {[24, 33, 42].map((y, i) => (<g key={i}>
          <path d={`M19 ${y}l3 3 5-6`} stroke="#3FAE35" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="31" y={y - 2} width={i === 1 ? 11 : 14} height="3.6" rx="1.8" fill="#B79F78" opacity="0.8" />
        </g>))}
        <circle cx="45" cy="47" r="6" fill={u('red')} stroke="#8E2217" strokeWidth="1" />
        <path d="M41 51 38 60l5-2 2 4 2-9z" fill="#C93A28" />
        <circle cx="45" cy="47" r="3" fill="none" stroke="#FFB3A4" strokeWidth="1" />
      </g>);
      case 'slot': {
        const cols = ['gi-red', 'gi-gold', 'gi-green', 'gi-blue', 'gi-purple', 'gi-orange'];
        return (<g filter="url(#gi-sh)">
          <circle cx="32" cy="34" r="27" fill={u('goldD')} />
          <circle cx="32" cy="34" r="24" fill="#2B2E55" />
          {cols.map((c, i) => <path key={i} d={sector(32, 34, 22, -Math.PI / 2 + i * Math.PI / 3, -Math.PI / 2 + (i + 1) * Math.PI / 3)} fill={u(c.slice(3))} stroke="#fff" strokeOpacity="0.9" strokeWidth="1" />)}
          {cols.map((_, i) => { const p = polar(32, 34, 25.5, -Math.PI / 2 + i * Math.PI / 3); return <circle key={i} cx={f2(p[0])} cy={f2(p[1])} r="1.6" fill="#fff" />; })}
          <circle cx="32" cy="34" r="7" fill={u('gold')} stroke="#B87400" strokeWidth="1" /><circle cx="32" cy="34" r="3" fill="#B86C00" />
          <path d="M32 3 25.5 13h13z" fill={u('red')} stroke="#8E2217" strokeWidth="1" strokeLinejoin="round" />
          <path d="M10 28a24 24 0 0 1 14-14" stroke="#fff" strokeOpacity="0.7" strokeWidth="3" fill="none" strokeLinecap="round" />
        </g>);
      }
      case 'gift': return (<g filter="url(#gi-sh)">
        <path d="M8 31V26a24 13 0 0 1 48 0v5z" fill={u('woodL')} stroke="#8A5A28" strokeWidth="1.3" strokeLinejoin="round" />
        <rect x="8" y="30" width="48" height="26" rx="3.5" fill={u('wood')} stroke="#5C3416" strokeWidth="1.3" />
        <path d="M8 40h48M8 48h48" stroke="#4E2C12" strokeOpacity="0.35" strokeWidth="1" />
        <rect x="15" y="14" width="7" height="42" rx="1.5" fill={u('steel')} stroke="#66728E" strokeWidth="1" />
        <rect x="42" y="14" width="7" height="42" rx="1.5" fill={u('steel')} stroke="#66728E" strokeWidth="1" />
        {[20, 50].map(y => [18.5, 45.5].map(x => <circle key={`${x}${y}`} cx={x} cy={y} r="1.3" fill="#5A6684" />))}
        <rect x="26" y="28" width="12" height="14" rx="2.5" fill={u('gold')} stroke="#B87400" strokeWidth="1.1" />
        <circle cx="32" cy="34" r="2.2" fill="#5C3A00" /><path d="M32 35v4" stroke="#5C3A00" strokeWidth="2" strokeLinecap="round" />
        <path d="M13 22a24 12 0 0 1 12-6" stroke="#fff" strokeOpacity="0.65" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      </g>);
      case 'calendar': return (<g filter="url(#gi-sh)">
        <rect x="8" y="11" width="48" height="45" rx="6" fill={u('cream')} stroke="#C9B48A" strokeWidth="1.2" />
        <path d="M8 17a6 6 0 0 1 6-6h36a6 6 0 0 1 6 6v8H8z" fill={u('red')} stroke="#8E2217" strokeWidth="1.1" />
        <rect x="19" y="5" width="6" height="13" rx="3" fill={u('steel')} stroke="#66728E" strokeWidth="1" />
        <rect x="39" y="5" width="6" height="13" rx="3" fill={u('steel')} stroke="#66728E" strokeWidth="1" />
        {[0, 1, 2].map(r => [0, 1, 2, 3].map(c => <rect key={`${r}${c}`} x={14 + c * 10.5} y={30 + r * 8} width="7" height="5" rx="1.4" fill="#C9D3E4" opacity={r === 2 && c > 1 ? 0.45 : 0.9} />))}
        <path d="M18 43l7 7 17-20" stroke="#fff" strokeWidth="9" fill="none" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
        <path d="M18 43l7 7 17-20" stroke={u('green')} strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M11 20h40" stroke="#fff" strokeOpacity="0.45" strokeWidth="1.6" strokeLinecap="round" />
      </g>);
      case 'plus': return (<g filter="url(#gi-sh2)">
        <circle cx="32" cy="32" r="27" fill={u('blue')} stroke="#1B4FB4" strokeWidth="1.2" />
        <path d="M32 18v28M18 32h28" stroke="#fff" strokeWidth="8" strokeLinecap="round" />
        <path d="M12 24a22 22 0 0 1 14-12" stroke="#fff" strokeOpacity="0.6" strokeWidth="3" fill="none" strokeLinecap="round" />
      </g>);
      case 'close': return (<path d="M16 16l32 32M48 16 16 48" stroke="#fff" strokeWidth="9" strokeLinecap="round" style={{ filter: 'drop-shadow(0 1.5px 1px rgba(10,30,100,0.45))' }} />);
      case 'check': return (<path d="M13 34l13 13 26-30" stroke="#fff" strokeWidth="9" fill="none" strokeLinecap="round" strokeLinejoin="round" style={{ filter: 'drop-shadow(0 1.5px 1px rgba(10,60,10,0.4))' }} />);
      case 'lock': return (<g filter="url(#gi-sh)">
        <path d="M20 30V22a12 12 0 0 1 24 0v8" stroke="#6B7692" strokeWidth="7" fill="none" strokeLinecap="round" />
        <path d="M20 30V22a12 12 0 0 1 24 0v8" stroke={u('steel')} strokeWidth="4.4" fill="none" strokeLinecap="round" />
        <rect x="12" y="29" width="40" height="29" rx="6" fill={u('gold')} stroke="#B87400" strokeWidth="1.3" />
        <rect x="12" y="29" width="40" height="9" rx="5" fill="#fff" opacity="0.28" />
        <circle cx="32" cy="42.5" r="4.4" fill="#5C3A00" /><path d="M32 44v8" stroke="#5C3A00" strokeWidth="3.4" strokeLinecap="round" />
      </g>);
      case 'bolt': return (<g filter="url(#gi-sh)">
        <path d="M38 3 13 36h14l-5 25L51 26H36z" fill={u('gold')} stroke="#C47A00" strokeWidth="1.4" strokeLinejoin="round" />
        <path d="M37 6 19 31h9" stroke="#fff" strokeOpacity="0.8" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </g>);
      case 'crate': return (<g filter="url(#gi-sh)">
        <rect x="6" y="9" width="52" height="47" rx="4" fill={u('wood')} stroke="#5C3416" strokeWidth="1.4" />
        <path d="M6 24h52M6 40h52" stroke="#4E2C12" strokeOpacity="0.45" strokeWidth="1.4" />
        <path d="M10 13h44" stroke="#fff" strokeOpacity="0.35" strokeWidth="2" strokeLinecap="round" />
        <path d="M11 54 53 12M11 12l42 42" stroke="#5C3416" strokeOpacity="0.35" strokeWidth="5" />
        <path d="M11 54 53 12M11 12l42 42" stroke={u('woodL')} strokeWidth="3" />
        {[[6, 9], [58, 9], [6, 56], [58, 56]].map(([x, y], i) => <path key={i} d={`M${x} ${y}h${x < 30 ? 9 : -9}M${x} ${y}v${y < 30 ? 9 : -9}`} stroke={u('steel')} strokeWidth="5" strokeLinecap="round" />)}
      </g>);
      case 'jelly': return (<g filter="url(#gi-sh)">
        <rect x="7" y="9" width="50" height="48" rx="17" fill={u('pink')} stroke="#B3306A" strokeWidth="1.3" />
        <rect x="11" y="13" width="42" height="26" rx="13" fill="url(#gi-hiFade)" opacity="0.55" />
        <ellipse cx="22" cy="21" rx="7" ry="3.6" fill="#fff" opacity="0.85" transform="rotate(-24 22 21)" />
        <circle cx="45" cy="44" r="2.6" fill="#fff" opacity="0.45" /><circle cx="39" cy="48" r="1.5" fill="#fff" opacity="0.4" />
      </g>);
      case 'acorn': return (<g filter="url(#gi-sh)">
        <path d="M13 29h38c0 17-8 29-19 29S13 46 13 29z" fill={u('orange')} stroke="#A8530A" strokeWidth="1.3" strokeLinejoin="round" />
        <path d="M11 30c-1-12 8-19 21-19s22 7 21 19z" fill={u('wood')} stroke="#5C3416" strokeWidth="1.3" strokeLinejoin="round" />
        <path d="M17 29 22 16M26 29 29 13M36 29 35 13M45 29 41 17M14 22l36 0M13 26l38 0" stroke="#4E2C12" strokeOpacity="0.4" strokeWidth="1" />
        <path d="M32 11V5" stroke="#5C3416" strokeWidth="4" strokeLinecap="round" />
        <path d="M19 36c0 8 3 13 8 16" stroke="#fff" strokeOpacity="0.65" strokeWidth="3" fill="none" strokeLinecap="round" />
      </g>);
      case 'rock': return (<g filter="url(#gi-sh)">
        <path d="M6 44C3 34 8 24 17 20c3-8 15-11 22-5 8 1 13 9 11 17 5 3 5 11-1 13H12c-4 0-6-1-6-1z" fill={u('rock')} stroke="#4F5A74" strokeWidth="1.3" strokeLinejoin="round" />
        <path d="M17 20c8-1 15 2 18 8L23 38 11 33z" fill="#fff" opacity="0.25" />
        <path d="M35 28 50 32 46 45H30z" fill="#1A2340" opacity="0.18" />
        <path d="M26 40l3-6 5 4M44 21l3 6" stroke="#4F5A74" strokeWidth="1.4" fill="none" strokeLinecap="round" />
      </g>);
      case 'question': return (<g filter="url(#gi-sh2)">
        <circle cx="32" cy="32" r="27" fill={u('blue')} stroke="#1B4FB4" strokeWidth="1.2" />
        <path d="M22 26a10 10 0 1 1 15 8.5c-3.2 2-5 3.6-5 7.5" stroke="#fff" strokeWidth="6.5" fill="none" strokeLinecap="round" />
        <circle cx="32" cy="52" r="3.8" fill="#fff" />
        <path d="M12 24a22 22 0 0 1 14-12" stroke="#fff" strokeOpacity="0.55" strokeWidth="3" fill="none" strokeLinecap="round" />
      </g>);
      case 'hammer': return (<g filter="url(#gi-sh)">
        <path d="M12 56 36 32" stroke="#5C3416" strokeWidth="11" strokeLinecap="round" />
        <path d="M12 56 36 32" stroke={u('wood')} strokeWidth="8" strokeLinecap="round" />
        <path d="M11 53 33 31" stroke="#fff" strokeOpacity="0.4" strokeWidth="2" strokeLinecap="round" />
        <g transform="rotate(45 40 22)">
          <rect x="22" y="11" width="36" height="22" rx="5" fill={u('red')} stroke="#8E2217" strokeWidth="1.3" />
          <rect x="22" y="11" width="36" height="8" rx="4" fill="#fff" opacity="0.35" />
          <rect x="22" y="11" width="7" height="22" rx="3" fill={u('gold')} stroke="#B87400" strokeWidth="1" />
          <rect x="51" y="11" width="7" height="22" rx="3" fill={u('gold')} stroke="#B87400" strokeWidth="1" />
        </g>
      </g>);
      case 'bomb': return (<g filter="url(#gi-sh)">
        <circle cx="29" cy="37" r="22" fill="url(#gi-ball)" />
        <ellipse cx="21" cy="26" rx="8" ry="5" fill="#fff" opacity="0.5" transform="rotate(-35 21 26)" />
        <rect x="24" y="10" width="13" height="10" rx="2.5" fill={u('steel')} stroke="#66728E" strokeWidth="1.1" transform="rotate(25 30 15)" />
        <path d="M37 11c5-6 10-3 12-9" stroke="#A58A52" strokeWidth="3.2" fill="none" strokeLinecap="round" />
        <polygon points={pts(starPts(50, 6, 6.5, 2.8))} fill={u('gold')} stroke="#E08A00" strokeWidth="0.8" />
      </g>);
      case 'rowclear':
      case 'colclear': return (<g filter="url(#gi-sh)" transform={name === 'colclear' ? 'rotate(90 32 32)' : undefined}>
        {!bare && <><circle cx="32" cy="32" r="27" fill={u('blue')} stroke="#1B4FB4" strokeWidth="1.2" /><circle cx="32" cy="32" r="27" fill="url(#gi-sphere)" /></>}
        <path d="M9 32h46M9 32l12-11v22zM55 32 43 21v22z" fill={bare ? '#1C4FB0' : '#fff'} stroke={bare ? '#fff' : '#fff'} strokeWidth={bare ? 2.6 : 5} strokeLinecap="round" strokeLinejoin="round" />
        
      </g>);
      case 'allclear': return (<g filter="url(#gi-sh)">
        {!bare && <circle cx="32" cy="32" r="27" fill={u('cream')} stroke="#C9B48A" strokeWidth="1.2" />}
        {['#EE4A35', '#FF9026', '#FFD233', '#4DBF3A', '#3A8EF0'].map((c, i) => <path key={i} d={`M${9 + i * 4.4} 40a${23 - i * 4.4} ${23 - i * 4.4} 0 0 1 ${2 * (23 - i * 4.4)} 0`} stroke={c} strokeWidth="4" fill="none" strokeLinecap="butt" />)}
        {!bare && <circle cx="32" cy="32" r="27" fill="url(#gi-sphere)" opacity="0.8" />}
      </g>);
      case 'shuffle': return (<g filter="url(#gi-sh)">
        {!bare && <><circle cx="32" cy="32" r="27" fill={u('green')} stroke="#2A8426" strokeWidth="1.2" /><circle cx="32" cy="32" r="27" fill="url(#gi-sphere)" /></>}
        <path d="M9 22h13c11 0 11 20 22 20h4" stroke={bare ? '#2F9E2A' : '#fff'} strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M9 42h13c11 0 11-20 22-20h4" stroke={bare ? '#F2780F' : '#fff'} strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M46 34 58 42 46 50z" fill={bare ? '#2F9E2A' : '#fff'} stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M46 14 58 22 46 30z" fill={bare ? '#F2780F' : '#fff'} stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
      </g>);
    }
  })();
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden style={{ display: 'block', overflow: 'visible', ...style }}>{body}</svg>
  );
}

/** 직접 그린 꽃잎(이모지 대신) */
export function Petal({ color = 'pink', size = 14 }: { color?: 'pink' | 'green' | 'yellow'; size?: number }) {
  const bg = color === 'pink' ? 'linear-gradient(135deg,#FFD9E8,#FF8FB8)' : color === 'green' ? 'linear-gradient(135deg,#CBF2A2,#6FBF4A)' : 'linear-gradient(135deg,#FFF3A8,#FFC83A)';
  return <span style={{ display: 'block', width: size * 0.8, height: size, borderRadius: '70% 30% 70% 30%', background: bg, border: '1.5px solid rgba(255,255,255,0.9)', boxShadow: '0 1px 2px rgba(0,0,0,0.25)' }} />;
}
/** 4갈래 반짝임(이모지 대신) */
export function Spark({ size = 14 }: { size?: number }) {
  return (
    <span style={{ display: 'block', filter: 'drop-shadow(0 0 4px #FFE98A) drop-shadow(0 0 2px #fff)' }}>
      <span style={{ display: 'block', width: size, height: size, background: 'radial-gradient(circle,#fff 30%,#FFE98A)', clipPath: 'polygon(50% 0,62% 38%,100% 50%,62% 62%,50% 100%,38% 62%,0 50%,38% 38%)' }} />
    </span>
  );
}
