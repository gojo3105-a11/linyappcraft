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

/** 원형 메달 — 아이콘을 담는 둥근 틀(이벤트·메뉴용) */
export function Medal({ hue, children, size = 62 }: { hue: string; children: ReactNode; size?: number }) {
  return (
    <span style={{
      position: 'relative', width: size, height: size, flexShrink: 0, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: `radial-gradient(circle at 50% 24%, #ffffff 0%, ${hue} 78%)`, border: '4px solid #fff',
      boxShadow: `0 0 0 3px ${C.ink}, 0 6px 0 3px ${C.ink}, 0 10px 14px rgba(0,0,0,0.35)`,
    }}>{children}</span>
  );
}

export type GIconName =
  | 'calendar' | 'slot' | 'gift' | 'tag' | 'clip' | 'flame' | 'shop' | 'home' | 'map' | 'gear'
  | 'coin' | 'plus' | 'star' | 'close' | 'check' | 'lock' | 'bolt' | 'crate' | 'jelly' | 'acorn' | 'question'
  | 'hammer' | 'bomb' | 'rowclear' | 'colclear' | 'allclear' | 'shuffle' | 'rock';

const INK = C.ink;
const S = { stroke: INK, strokeWidth: 2.6, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };

/** 스티커풍 아이콘 — 진한 외곽선 + 평평한 색 + 하이라이트 한 조각 */
export function GIcon({ name, size = 40, style }: { name: GIconName; size?: number | string; style?: CSSProperties }) {
  const body = (() => {
    switch (name) {
      case 'calendar': return (<>
        <rect x="7" y="10" width="34" height="33" rx="6" fill="#fff" {...S} />
        <path d="M7 17a7 7 0 0 1 7-7h20a7 7 0 0 1 7 7v5H7z" fill={C.red} {...S} />
        <rect x="14" y="5" width="5" height="10" rx="2.5" fill="#fff" {...S} /><rect x="29" y="5" width="5" height="10" rx="2.5" fill="#fff" {...S} />
        <path d="M15 32l6 6 12-13" fill="none" stroke={C.green} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      </>);
      case 'slot': return (<>
        <rect x="6" y="7" width="34" height="36" rx="7" fill="#9B6BFF" {...S} />
        <rect x="11" y="14" width="24" height="15" rx="3" fill="#fff" {...S} />
        <path d="M19 14v15M27 14v15" stroke={INK} strokeWidth="2" />
        <text x="15" y="26" fontSize="11" fontWeight="700" fill={C.red} textAnchor="middle" style={{ fontFamily: 'inherit' }}>7</text>
        <text x="23" y="26" fontSize="11" fontWeight="700" fill={C.red} textAnchor="middle" style={{ fontFamily: 'inherit' }}>7</text>
        <text x="31" y="26" fontSize="11" fontWeight="700" fill={C.red} textAnchor="middle" style={{ fontFamily: 'inherit' }}>7</text>
        <rect x="14" y="33" width="18" height="5" rx="2.5" fill={C.gold} {...S} />
        <path d="M41 17v12" stroke={INK} strokeWidth="3" strokeLinecap="round" /><circle cx="41" cy="14" r="3.6" fill={C.red} {...S} />
      </>);
      case 'gift': return (<>
        <rect x="8" y="22" width="32" height="20" rx="3" fill={C.red} {...S} />
        <rect x="6" y="15" width="36" height="9" rx="3" fill="#FF7E6B" {...S} />
        <rect x="21" y="15" width="6" height="27" fill={C.gold} {...S} />
        <path d="M24 15c-3-9-13-7-9-1.5 1.8 2.2 6 2 9 1.5zM24 15c3-9 13-7 9-1.5-1.8 2.2-6 2-9 1.5z" fill={C.gold} {...S} />
      </>);
      case 'tag': return (<>
        <path d="M24 5h15a4 4 0 0 1 4 4v15L25 42a4 4 0 0 1-5.7 0L5.6 28.4a4 4 0 0 1 0-5.7z" fill="#4FB4FF" {...S} />
        <circle cx="35" cy="13" r="3.4" fill="#fff" {...S} />
        <text x="23" y="30" fontSize="16" fontWeight="700" fill="#fff" textAnchor="middle" stroke={INK} strokeWidth="1.2" paintOrder="stroke" style={{ fontFamily: 'inherit' }}>%</text>
      </>);
      case 'clip': return (<>
        <rect x="9" y="8" width="30" height="35" rx="5" fill="#C58A52" {...S} />
        <rect x="13" y="13" width="22" height="26" rx="2" fill="#fff" {...S} />
        <rect x="18" y="4" width="12" height="9" rx="3" fill="#D9DEE6" {...S} />
        <path d="M16 21l2 2 3-4M16 29l2 2 3-4" fill="none" stroke={C.green} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M25 22h7M25 30h7" stroke="#9AA3B2" strokeWidth="2.4" strokeLinecap="round" />
      </>);
      case 'flame': return (<>
        <path d="M24 4c2 9 12 12 12 23a12 12 0 0 1-24 0c0-5 3-9 6-11 0 4 2 6 4 6 1-6-2-10 2-18z" fill="#FF8A2B" {...S} />
        <path d="M24 25c4 4 7 7 7 10a7 7 0 0 1-14 0c0-3 3-6 7-10z" fill="#FFD84A" />
      </>);
      case 'shop': return (<>
        <rect x="9" y="22" width="30" height="21" rx="2" fill="#FFE9B8" {...S} />
        <rect x="20" y="29" width="9" height="14" fill="#8A5A2E" {...S} />
        <rect x="12" y="26" width="6" height="6" fill="#BFE8FF" {...S} /><rect x="31" y="26" width="5" height="6" fill="#BFE8FF" {...S} />
        <path d="M6 20 10 8h28l4 12z" fill={C.red} {...S} />
        <path d="M18 8l-2 12M24 8v12M30 8l2 12" stroke="#fff" strokeWidth="3.4" />
        <path d="M6 20h36v1.5a6 6 0 0 1-12 0 6 6 0 0 1-12 0 6 6 0 0 1-12 0z" fill="#fff" {...S} />
      </>);
      case 'home': return (<>
        <rect x="10" y="22" width="28" height="21" rx="2" fill="#FFE9B8" {...S} />
        <rect x="19" y="30" width="10" height="13" rx="1" fill="#8A5A2E" {...S} />
        <rect x="31" y="9" width="6" height="11" fill="#C58A52" {...S} />
        <path d="M4 25 24 6l20 19z" fill={C.red} {...S} />
        <circle cx="24" cy="18" r="3.4" fill="#BFE8FF" {...S} />
      </>);
      case 'map': return (<>
        <path d="M5 12l12-5 14 5 12-5v29l-12 5-14-5-12 5z" fill="#BFE8A0" {...S} />
        <path d="M17 7v29M31 12v29" stroke={INK} strokeWidth="2.2" />
        <path d="M24 17a5.5 5.5 0 0 1 5.5 5.5c0 4-5.5 9-5.5 9s-5.5-5-5.5-9A5.5 5.5 0 0 1 24 17z" fill={C.red} {...S} />
        <circle cx="24" cy="22.5" r="2" fill="#fff" />
      </>);
      case 'gear': return (<>
        {[0, 45, 90, 135, 180, 225, 270, 315].map(a => <rect key={a} x="20.5" y="3.5" width="7" height="10" rx="2" fill={C.gold} {...S} transform={`rotate(${a} 24 24)`} />)}
        <circle cx="24" cy="24" r="14" fill={C.gold} {...S} />
        <circle cx="24" cy="24" r="6" fill="#fff" {...S} />
        <path d="M14 20a11 11 0 0 1 6-6" stroke="#FFF1B0" strokeWidth="3" fill="none" strokeLinecap="round" />
      </>);
      case 'coin': return (<>
        <circle cx="24" cy="24" r="18" fill={C.gold} {...S} /><circle cx="24" cy="24" r="12" fill="#FFE27A" stroke={C.goldDark} strokeWidth="2.2" />
        <path d="M24 16v16M19 21h8a3 3 0 0 1 0 6h-8" stroke={C.goldDark} strokeWidth="3" fill="none" strokeLinecap="round" />
        <path d="M13 17a13 13 0 0 1 7-6" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" />
      </>);
      case 'plus': return (<>
        <circle cx="24" cy="24" r="19" fill="#3E8CF2" {...S} /><path d="M24 14v20M14 24h20" stroke="#fff" strokeWidth="5.5" strokeLinecap="round" />
      </>);
      case 'star': return (<path d="M24 5l5.6 12.2 13.2 1.5-9.8 9 2.8 13L24 33.8 12.2 40.7l2.8-13-9.8-9 13.2-1.5z" fill={C.gold} {...S} />);
      case 'close': return (<path d="M12 12l24 24M36 12L12 36" stroke="#fff" strokeWidth="7" strokeLinecap="round" />);
      case 'check': return (<path d="M10 25l9 9 19-21" stroke="#fff" strokeWidth="7" fill="none" strokeLinecap="round" strokeLinejoin="round" />);
      case 'lock': return (<>
        <path d="M15 21v-6a9 9 0 0 1 18 0v6" fill="none" stroke={INK} strokeWidth="5" strokeLinecap="round" />
        <path d="M15 21v-6a9 9 0 0 1 18 0v6" fill="none" stroke="#C9D2E3" strokeWidth="2.4" strokeLinecap="round" />
        <rect x="9" y="20" width="30" height="22" rx="5" fill={C.gold} {...S} /><circle cx="24" cy="30" r="3.4" fill={INK} /><path d="M24 31v5" stroke={INK} strokeWidth="3" strokeLinecap="round" />
      </>);
      case 'bolt': return (<path d="M27 4 10 27h11l-3 17 20-26H27z" fill={C.gold} {...S} />);
      case 'crate': return (<>
        <rect x="6" y="9" width="36" height="32" rx="4" fill="#D9A25F" {...S} />
        <path d="M6 18h36M6 31h36M17 9v32M31 9v32" stroke={INK} strokeWidth="2.2" /><path d="M10 13l8 0" stroke="#F2CE96" strokeWidth="2.4" strokeLinecap="round" />
      </>);
      case 'jelly': return (<>
        <rect x="6" y="9" width="36" height="32" rx="10" fill="#FF8CCB" {...S} /><path d="M12 16a10 10 0 0 1 9-4" stroke="#fff" strokeWidth="3.4" fill="none" strokeLinecap="round" />
      </>);
      case 'acorn': return (<>
        <path d="M10 22h28c0 12-6 20-14 20S10 34 10 22z" fill="#D9892F" {...S} />
        <path d="M8 22c0-8 7-13 16-13s16 5 16 13z" fill="#8E5A2B" {...S} /><path d="M24 9V4" stroke={INK} strokeWidth="3.4" strokeLinecap="round" />
        <path d="M15 28c0 5 2 8 5 10" stroke="#F2B866" strokeWidth="2.6" fill="none" strokeLinecap="round" />
      </>);
      case 'hammer': return (<>
        <path d="M9 41 27 23" stroke={INK} strokeWidth="9.5" strokeLinecap="round" /><path d="M9 41 27 23" stroke="#C58A52" strokeWidth="5" strokeLinecap="round" />
        <rect x="19" y="11" width="25" height="14" rx="3.5" fill={C.red} {...S} transform="rotate(45 31.5 18)" />
        <path d="M27 15l7-7" stroke="#FF9D8F" strokeWidth="3" strokeLinecap="round" />
      </>);
      case 'bomb': return (<>
        <circle cx="22" cy="28" r="15" fill="#3A4668" {...S} /><path d="M13 22a10 10 0 0 1 7-6" stroke="#9AA9D1" strokeWidth="3.2" fill="none" strokeLinecap="round" />
        <rect x="18" y="8" width="9" height="8" rx="2" fill="#8A8F9C" {...S} transform="rotate(30 22 12)" />
        <path d="M28 8c4-5 8-2 9-7" stroke={INK} strokeWidth="2.8" fill="none" strokeLinecap="round" /><circle cx="39" cy="6" r="4" fill="#FFB02E" {...S} />
      </>);
      case 'rowclear': return (<>
        <circle cx="24" cy="24" r="19" fill="#fff" {...S} />
        <path d="M9 24h30M9 24l8-7M9 24l8 7M39 24l-8-7M39 24l-8 7" stroke="#2A6CE8" strokeWidth="4.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </>);
      case 'colclear': return (<>
        <circle cx="24" cy="24" r="19" fill="#fff" {...S} />
        <path d="M24 9v30M24 9l-7 8M24 9l7 8M24 39l-7-8M24 39l7-8" stroke="#2A6CE8" strokeWidth="4.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </>);
      case 'allclear': return (<>
        <circle cx="24" cy="24" r="19" fill="#fff" {...S} />
        <path d="M9 31a15 15 0 0 1 30 0" stroke="#E85A47" strokeWidth="4.4" fill="none" strokeLinecap="round" />
        <path d="M15 31a9 9 0 0 1 18 0" stroke="#FFC83A" strokeWidth="4.4" fill="none" strokeLinecap="round" />
        <path d="M21 31a3 3 0 0 1 6 0" stroke="#3E8CF2" strokeWidth="4.4" fill="none" strokeLinecap="round" />
      </>);
      case 'shuffle': return (<>
        <circle cx="24" cy="24" r="19" fill="#fff" {...S} />
        <path d="M11 17h19M30 17l-5-5M30 17l-5 5" stroke="#35A52E" strokeWidth="4.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M37 31H18M18 31l5-5M18 31l5 5" stroke="#F58A1F" strokeWidth="4.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </>);
      case 'rock': return (<>
        <path d="M7 35c-2-8 2-16 9-19 3-6 12-8 17-3 6 1 9 8 7 14 3 2 2 9-3 10H13c-4 0-6-1-6-2z" fill="#B4BCC9" {...S} />
        <path d="M15 24c3-4 8-6 12-4" stroke="#EEF2F8" strokeWidth="3.2" fill="none" strokeLinecap="round" />
        <path d="M27 38l2-7 5 5M13 36l3-5" stroke={INK} strokeWidth="2.2" fill="none" strokeLinecap="round" />
      </>);
      case 'question': return (<>
        <circle cx="24" cy="24" r="19" fill="#4FB4FF" {...S} />
        <path d="M17 19a7 7 0 1 1 11 5.5c-2.5 1.8-4 3-4 6" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" /><circle cx="24" cy="38" r="2.8" fill="#fff" />
      </>);
    }
  })();
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden style={{ display: 'block', overflow: 'visible', ...style }}>{body}</svg>
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
