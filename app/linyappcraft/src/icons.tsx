// 세련된 라인/필 SVG 아이콘 세트 (시스템 UI용)
type IconName =
  | 'home' | 'map' | 'tv' | 'shop' | 'gear' | 'trophy'
  | 'coin' | 'heart' | 'play' | 'close' | 'back' | 'bolt' | 'list';

export function Icon({ name, size = 24, color = 'currentColor' }: { name: IconName; size?: number; color?: string }) {
  const s = {
    width: size, height: size, viewBox: '0 0 24 24',
    fill: 'none' as const, stroke: color, strokeWidth: 2,
    strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
  };
  switch (name) {
    case 'home':
      return (<svg {...s}><path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.5V20h13V9.5"/><path d="M9.5 20v-5h5v5"/></svg>);
    case 'map':
      return (<svg {...s}><path d="M9 4 3.5 6.2v13.3L9 17.3l6 2.2 5.5-2.2V3.9L15 6.1 9 3.9z"/><path d="M9 3.9v13.4M15 6.1v13.4"/></svg>);
    case 'tv':
      return (<svg {...s}><rect x="2.5" y="7.5" width="19" height="12.5" rx="2.2"/><path d="m8 2.8 4 3.4 4-3.4"/><path d="m10.5 11 4 2.7-4 2.7z" fill={color} stroke="none"/></svg>);
    case 'shop':
      return (<svg {...s}><path d="M5.5 8h13l-1 11.2a1.5 1.5 0 0 1-1.5 1.3H8a1.5 1.5 0 0 1-1.5-1.3L5.5 8z"/><path d="M9 8a3 3 0 0 1 6 0"/></svg>);
    case 'gear':
      return (<svg {...s}><circle cx="12" cy="12" r="3.1"/><path d="M19.4 13.5a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-2.7-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.1-2.7l-.1-.1A2 2 0 1 1 6.9 3.4l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V2a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V8a1.6 1.6 0 0 0 1.5 1H22a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/></svg>);
    case 'trophy':
      return (<svg {...s}><path d="M7 4h10v4.5a5 5 0 0 1-10 0V4z"/><path d="M7 5.5H4.2v1.8A3.2 3.2 0 0 0 7 10.5M17 5.5h2.8v1.8a3.2 3.2 0 0 1-2.8 3.2"/><path d="M9.5 20h5M12 13.2V20"/></svg>);
    case 'coin':
      return (<svg width={size} height={size} viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.2" fill={color}/><circle cx="12" cy="12" r="9.2" fill="none" stroke="rgba(0,0,0,0.25)" strokeWidth="1.4"/><text x="12" y="16.2" textAnchor="middle" fontSize="11.5" fontWeight="900" fill="rgba(90,55,0,0.85)">₩</text></svg>);
    case 'heart':
      return (<svg width={size} height={size} viewBox="0 0 24 24"><path d="M12 20.5S3.5 15.4 3.5 9.4C3.5 6.6 5.6 4.7 8 4.7c1.7 0 3 .9 4 2.3 1-1.4 2.3-2.3 4-2.3 2.4 0 4.5 1.9 4.5 4.7 0 6-8.5 11.1-8.5 11.1z" fill={color}/></svg>);
    case 'play':
      return (<svg width={size} height={size} viewBox="0 0 24 24"><path d="M7 4.5 19.5 12 7 19.5z" fill={color}/></svg>);
    case 'bolt':
      return (<svg width={size} height={size} viewBox="0 0 24 24"><path d="M13 2 4 13.5h6L11 22l9-11.5h-6L13 2z" fill={color}/></svg>);
    case 'list':
      return (<svg {...s}><path d="M8 6h12M8 12h12M8 18h12"/><path d="M4 6h.01M4 12h.01M4 18h.01"/></svg>);
    case 'close':
      return (<svg {...s}><path d="M6 6l12 12M18 6 6 18"/></svg>);
    case 'back':
      return (<svg {...s}><path d="M15 5l-7 7 7 7"/></svg>);
    default:
      return null;
  }
}
