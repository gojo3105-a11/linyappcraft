import { useEffect, useState } from 'react';

interface Props { size?: number; isBoss?: boolean; animate?: boolean; }

export function MonsterSVG({ size = 80, isBoss = false, animate = true }: Props) {
  const [bob, setBob] = useState(0);
  useEffect(() => {
    if (!animate) return;
    const t = setInterval(() => setBob(b => (b + 1) % 4), 220);
    return () => clearInterval(t);
  }, [animate]);
  const dy = [0, -2, -4, -2][bob];

  /* 노멀 / 보스 컬러 세트 */
  const C = isBoss
    ? { cap0:'#CC1140', cap1:'#880022', cap2:'#440010', shine:'#FF2255', stemL:'#EEE8D0', stemD:'#A09870', glow:'#FF0044' }
    : { cap0:'#EE2828', cap1:'#AA1414', cap2:'#660A0A', shine:'#FF5555', stemL:'#F0ECDA', stemD:'#B0A878', glow:'#FF3030' };

  return (
    <svg
      width={size} height={Math.round(size * 1.1)}
      viewBox="0 0 100 110"
      style={{
        transform: `translateY(${dy}px)`,
        transition: 'transform 0.22s ease-in-out',
        willChange: 'transform',
        overflow: 'visible',
      }}
    >
      <defs>
        <radialGradient id="mc" cx="34%" cy="24%" r="72%">
          <stop offset="0%"   stopColor={C.shine}/>
          <stop offset="35%"  stopColor={C.cap0}/>
          <stop offset="68%"  stopColor={C.cap1}/>
          <stop offset="100%" stopColor={C.cap2}/>
        </radialGradient>
        <linearGradient id="ms" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor={C.stemL}/>
          <stop offset="28%"  stopColor={C.stemL}/>
          <stop offset="72%"  stopColor={C.stemD}/>
          <stop offset="100%" stopColor="#887848"/>
        </linearGradient>
        <linearGradient id="mg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#D4A860"/>
          <stop offset="100%" stopColor="#886030"/>
        </linearGradient>
        <radialGradient id="msp" cx="36%" cy="28%" r="66%">
          <stop offset="0%"   stopColor={isBoss ? '#FFD0E0' : '#FFFFFF'}/>
          <stop offset="60%"  stopColor={isBoss ? '#FFAABB' : '#F0EEE8'}/>
          <stop offset="100%" stopColor={isBoss ? '#CC8090' : '#C8C4B0'}/>
        </radialGradient>
        <radialGradient id="mao" cx="50%" cy="100%" r="50%">
          <stop offset="0%"   stopColor="rgba(0,0,0,0.5)"/>
          <stop offset="100%" stopColor="rgba(0,0,0,0)"/>
        </radialGradient>

        {/* 외부 글로우 */}
        <filter id="mglow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="0" stdDeviation={isBoss ? '5' : '3'}
            floodColor={C.glow} floodOpacity={isBoss ? '0.8' : '0.45'}/>
          <feDropShadow dx="1" dy="6" stdDeviation="6"
            floodColor="#000820" floodOpacity="0.7"/>
        </filter>
        {/* 보스 눈 글로우 */}
        <filter id="meyeglow">
          <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#FF0044" floodOpacity="0.9"/>
        </filter>
        {/* 갓 광택 마스크 */}
        <radialGradient id="mshine" cx="36%" cy="28%" r="55%">
          <stop offset="0%"   stopColor="rgba(255,255,255,0.22)"/>
          <stop offset="100%" stopColor="rgba(255,255,255,0)"/>
        </radialGradient>
      </defs>

      <g filter="url(#mglow)">

        {/* ── 바닥 AO ── */}
        <ellipse cx="50" cy="108" rx="34" ry="4" fill="rgba(0,0,0,0.4)"/>

        {/* ── 다리 ── */}
        <ellipse cx="37" cy="101" rx="13" ry="8.5" fill="url(#ms)"/>
        <ellipse cx="63" cy="101" rx="13" ry="8.5" fill="url(#ms)"/>
        {/* 다리 하이라이트 */}
        <ellipse cx="33" cy="97" rx="6" ry="3.5" fill="rgba(255,255,240,0.3)"/>
        <ellipse cx="59" cy="97" rx="6" ry="3.5" fill="rgba(255,255,240,0.3)"/>
        {/* AO 다리 */}
        <ellipse cx="37" cy="67" rx="11" ry="4"  fill="url(#mao)"/>
        <ellipse cx="63" cy="67" rx="11" ry="4"  fill="url(#mao)"/>
        {/* 발톱 */}
        {[30,37,44].map(x => <ellipse key={x} cx={x} cy="106.5" rx="3.5" ry="2.2" fill="#8A7840"/>)}
        {[56,63,70].map(x => <ellipse key={x} cx={x} cy="106.5" rx="3.5" ry="2.2" fill="#8A7840"/>)}

        {/* ── 팔 ── */}
        <ellipse cx="16" cy="77" rx="16" ry="9.5" fill="url(#ms)" transform="rotate(-28,16,77)"/>
        <ellipse cx="84" cy="77" rx="16" ry="9.5" fill="url(#ms)" transform="rotate(28,84,77)"/>
        <ellipse cx="14" cy="73" rx="6"  ry="3.5" fill="rgba(255,255,240,0.28)" transform="rotate(-28,14,73)"/>
        {/* 보스 발톱 */}
        {isBoss && (
          <>
            <path d="M 6 70 L 3 63" stroke="#BB0033" strokeWidth="3" strokeLinecap="round"/>
            <path d="M 12 67 L 10 60" stroke="#BB0033" strokeWidth="3" strokeLinecap="round"/>
            <path d="M 94 70 L 97 63" stroke="#BB0033" strokeWidth="3" strokeLinecap="round"/>
            <path d="M 88 67 L 90 60" stroke="#BB0033" strokeWidth="3" strokeLinecap="round"/>
          </>
        )}

        {/* ── 줄기 ── */}
        <rect x="27" y="63" width="46" height="34" rx="11" fill="url(#ms)"/>
        {/* 줄기 왼쪽 어두운 면 */}
        <rect x="27" y="63" width="10" height="34" rx="6" fill="rgba(0,0,0,0.14)"/>
        {/* 줄기 하이라이트 */}
        <rect x="33" y="66" width="14" height="28" rx="5" fill="rgba(255,255,235,0.2)"/>
        {/* 가로 주름 */}
        {[73,80,87].map(y => (
          <path key={y} d={`M 33 ${y} Q 50 ${y-3.5} 67 ${y}`}
            stroke="rgba(140,120,60,0.3)" strokeWidth="1.4" fill="none"/>
        ))}
        {/* 줄기 AO (상단) */}
        <ellipse cx="50" cy="66" rx="22" ry="5" fill="rgba(0,0,0,0.2)"/>

        {/* ── 갓 하부 (주름살) ── */}
        <ellipse cx="50" cy="67" rx="46" ry="11" fill="url(#mg)"/>
        {[36,42,50,58,64].map(x => (
          <line key={x} x1={x} y1="58" x2={x+(x<50 ? -3:3)} y2="75"
            stroke="rgba(100,60,10,0.3)" strokeWidth="1.3"/>
        ))}

        {/* ── 버섯 갓 ── */}
        <ellipse cx="50" cy="38" rx="48" ry="38" fill="url(#mc)"/>
        {/* 갓 광택 오버레이 */}
        <ellipse cx="50" cy="38" rx="48" ry="38" fill="url(#mshine)"/>
        {/* 갓 스페큘러 */}
        <ellipse cx="34" cy="20" rx="13" ry="8" fill="rgba(255,255,255,0.3)"/>
        <ellipse cx="28" cy="16" rx="5"  ry="3" fill="rgba(255,255,255,0.5)"/>
        {/* 갓 림 라이트 (아래 경계) */}
        <ellipse cx="50" cy="64" rx="45" ry="10" fill="rgba(0,0,0,0.22)"/>

        {/* ── 반점 ── */}
        {[
          {cx:27,cy:40,r:8.5 }, {cx:61,cy:25,r:11 },
          {cx:80,cy:46,r:7.5 }, {cx:19,cy:55,r:6  },
          {cx:50,cy:17,r:7   },
        ].map((s,i) => (
          <g key={i}>
            <circle cx={s.cx} cy={s.cy} r={s.r} fill="url(#msp)"/>
            {/* 반점 외곽 음영 */}
            <circle cx={s.cx} cy={s.cy} r={s.r} fill="none"
              stroke="rgba(0,0,0,0.14)" strokeWidth="1.2"/>
            {/* 반점 하이라이트 */}
            <ellipse
              cx={s.cx - s.r*0.18} cy={s.cy - s.r*0.22}
              rx={s.r*0.42} ry={s.r*0.3}
              fill="rgba(255,255,255,0.55)"/>
          </g>
        ))}
        {isBoss && (
          <>{[{cx:44,cy:49,r:5.5},{cx:70,cy:33,r:6.5}].map((s,i) => (
            <g key={i}>
              <circle cx={s.cx} cy={s.cy} r={s.r} fill="url(#msp)"/>
              <ellipse cx={s.cx-s.r*0.18} cy={s.cy-s.r*0.22} rx={s.r*0.42} ry={s.r*0.3} fill="rgba(255,255,255,0.55)"/>
            </g>
          ))}</>
        )}

        {/* ── 얼굴 ── */}
        {/* 눈썹 */}
        <path d="M 31 72 L 48 66" stroke="#180800" strokeWidth="4.5" strokeLinecap="round"/>
        <path d="M 52 66 L 69 72" stroke="#180800" strokeWidth="4.5" strokeLinecap="round"/>
        <path d="M 31 71 L 48 65" stroke="rgba(120,60,10,0.4)" strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M 52 65 L 69 71" stroke="rgba(120,60,10,0.4)" strokeWidth="1.5" strokeLinecap="round"/>

        {/* 눈 */}
        <ellipse cx="39" cy="74" rx="6.5" ry="6" fill={isBoss ? '#FF0033' : '#110800'}
          filter={isBoss ? 'url(#meyeglow)' : undefined}/>
        <ellipse cx="61" cy="74" rx="6.5" ry="6" fill={isBoss ? '#FF0033' : '#110800'}
          filter={isBoss ? 'url(#meyeglow)' : undefined}/>
        {isBoss ? (
          <>
            <ellipse cx="39" cy="73" rx="3"   ry="2.5" fill="#FF99BB"/>
            <ellipse cx="61" cy="73" rx="3"   ry="2.5" fill="#FF99BB"/>
            <ellipse cx="38" cy="72" rx="1.2" ry="0.9" fill="rgba(255,255,255,0.8)"/>
            <ellipse cx="60" cy="72" rx="1.2" ry="0.9" fill="rgba(255,255,255,0.8)"/>
          </>
        ) : (
          <>
            <circle cx="41" cy="72" r="2"   fill="rgba(255,255,255,0.65)"/>
            <circle cx="63" cy="72" r="2"   fill="rgba(255,255,255,0.65)"/>
          </>
        )}

        {/* 입 */}
        <path d="M 37 87 Q 50 81 63 87"
          stroke="#180800" strokeWidth="3" fill="none" strokeLinecap="round"/>
        {[{x:39,y:81},{x:47,y:80},{x:55,y:81}].map((t,i) => (
          <g key={i}>
            <rect x={t.x} y={t.y} width="6.5" height="7" rx="2" fill="#F5F2E0"/>
            <rect x={t.x} y={t.y+4.5} width="6.5" height="2.5" fill="rgba(0,0,0,0.1)"/>
          </g>
        ))}
        {isBoss && (
          <>
            <rect x="33" y="82" width="5" height="5.5" rx="1.5" fill="#FFBBCC"/>
            <rect x="62" y="82" width="5" height="5.5" rx="1.5" fill="#FFBBCC"/>
          </>
        )}

        {/* ── 보스 왕관 ── */}
        {isBoss && (
          <g>
            <defs>
              <linearGradient id="mcrown" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor="#FFE566"/>
                <stop offset="50%"  stopColor="#FFA020"/>
                <stop offset="100%" stopColor="#CC6A00"/>
              </linearGradient>
            </defs>
            <rect x="24" y="10" width="52" height="11" rx="3.5" fill="url(#mcrown)"/>
            <polygon points="27,10 33,-1 39,10"  fill="url(#mcrown)"/>
            <polygon points="44,10 50,-3 56,10"  fill="url(#mcrown)"/>
            <polygon points="61,10 67,-1 73,10"  fill="url(#mcrown)"/>
            {/* 왕관 하이라이트 */}
            <rect x="26" y="10" width="48" height="4" rx="2" fill="rgba(255,240,160,0.38)"/>
            {/* 보석 */}
            {[{cx:33,cy:9,c:'#FF2244'},{cx:50,cy:8,c:'#4488FF'},{cx:67,cy:9,c:'#FF2244'}].map((j,i)=>(
              <g key={i}>
                <circle cx={j.cx} cy={j.cy} r="4.5" fill={j.c}/>
                <circle cx={j.cx} cy={j.cy} r="4.5" fill="none"
                  stroke="rgba(255,255,255,0.4)" strokeWidth="0.8"/>
                <ellipse cx={j.cx-1.2} cy={j.cy-1.5} rx="1.8" ry="1.2" fill="rgba(255,255,255,0.75)"/>
              </g>
            ))}
          </g>
        )}
      </g>
    </svg>
  );
}
