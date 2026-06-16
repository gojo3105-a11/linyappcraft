import { useState, useEffect, useRef, useCallback } from 'react';
import { questAddGameCleared, questUpdateMaxCombo, questClaim, loadQuests, loadCoins, spendCoins, addCoins, loadBoosters, saveBoosters, type BoosterKind, type QuestSave } from './quest';
import { sGet, sSet, getScope, setScope } from './store';
import { tossLogin, fetchUserKey } from './toss';

// 부스터(블럭 제거 아이템) 상점 정보
// price = 코인 가격, cash = 시뮬레이션 현금 결제 가격(원)
const BOOSTERS: { kind: BoosterKind; icon: string; name: string; desc: string; price: number; cash: number }[] = [
  { kind: 'hammer',  icon: '🔨', name: '망치',   desc: '블럭 1개 제거',     price: 100, cash: 500  },
  { kind: 'bomb',    icon: '💣', name: '폭탄',   desc: '주변 3×3 제거',     price: 250, cash: 1200 },
  { kind: 'shuffle', icon: '🔀', name: '셔플',   desc: '보드 전체 섞기',     price: 150, cash: 800  },
];

// 코인 충전 패키지 (시뮬레이션 결제)
const COIN_PACKS: { coins: number; cash: number; bonus?: string }[] = [
  { coins: 1000,  cash: 1100  },
  { coins: 3500,  cash: 3300,  bonus: '+16%' },
  { coins: 12000, cash: 11000, bonus: '+33%' },
];

const ROWS = 7;
const COLS = 7;

const BASE = import.meta.env.BASE_URL;
const CHAR = (n: string) => `${BASE}characters/KakaoTalk_20260610_202544565${n}.png`;
const TILES = [
  { img: CHAR(''),     bg: 'linear-gradient(145deg,#FFD54F,#FF8F00)', glow: '#FFB300' },
  { img: CHAR('_01'), bg: 'linear-gradient(145deg,#64B5F6,#1565C0)', glow: '#42A5F5' },
  { img: CHAR('_02'), bg: 'linear-gradient(145deg,#AED581,#33691E)', glow: '#7CB342' },
  { img: CHAR('_03'), bg: 'linear-gradient(145deg,#F48FB1,#880E4F)', glow: '#E91E63' },
  { img: CHAR('_04'), bg: 'linear-gradient(145deg,#CE93D8,#6A1B9A)', glow: '#AB47BC' },
  { img: CHAR('_05'), bg: 'linear-gradient(145deg,#80CBC4,#004D40)', glow: '#26A69A' },
] as const;

type TileKind = 'normal' | 'lightning' | 'bomb';

function makeMap(heights: readonly number[]): (0|1)[][] {
  return Array.from({ length: ROWS }, (_, r) =>
    [...heights].map(h => (r >= ROWS - h ? 1 : 0) as 0|1)
  );
}

const MAPS = [
  makeMap([7,7,7,7,7,7,7]),
  makeMap([4,5,6,7,6,5,4]),
  makeMap([7,6,5,4,5,6,7]),
  makeMap([2,3,4,5,6,7,7]),
  makeMap([7,7,2,2,2,7,7]),
  makeMap([3,7,3,7,3,7,3]),
  makeMap([7,5,3,1,3,5,7]),
  makeMap([4,5,7,7,7,5,4]),
  makeMap([7,7,4,2,4,7,7]),
  makeMap([5,3,6,7,6,3,5]),
] as const;

const LEVELS = [
  { mode: 'time'  as const, sec: 60,   types: 4, goal: [500,  1500,  3000] as const },
  { mode: 'time'  as const, sec: 55,   types: 4, goal: [700,  2000,  4000] as const },
  { mode: 'moves' as const, moves: 30, types: 4, goal: [900,  2500,  5000] as const },
  { mode: 'time'  as const, sec: 50,   types: 5, goal: [1100, 3000,  6000] as const },
  { mode: 'moves' as const, moves: 28, types: 5, goal: [1400, 3500,  7000] as const },
  { mode: 'time'  as const, sec: 48,   types: 5, goal: [1700, 4000,  8000] as const },
  { mode: 'moves' as const, moves: 25, types: 6, goal: [2000, 5000, 10000] as const },
  { mode: 'time'  as const, sec: 45,   types: 6, goal: [2500, 6000, 12000] as const },
  { mode: 'moves' as const, moves: 22, types: 6, goal: [3000, 7000, 15000] as const },
  { mode: 'time'  as const, sec: 35,   types: 6, goal: [4000, 9000, 20000] as const },
];

const MAP_POS = [[0,0],[1,0],[2,0],[2,1],[1,1],[0,1],[0,2],[1,2],[2,2],[1,3]];
const COL_X = [18, 50, 82];
const ROW_Y = [84, 62, 40, 18];

const LS_BASE = 'linydory_v3';
const loadProg = (): number[] => sGet<number[]>(LS_BASE, Array(LEVELS.length).fill(0));
const saveProg = (p: number[]) => sSet(LS_BASE, p);

interface Cell { id: number; t: number; kind: TileKind; hit: boolean; }
type GridCell = Cell | null;
type Grid = GridCell[][];
type Phase = 'splash' | 'main' | 'map' | 'play' | 'end';

let _uid = 0;
let _fid = 0;
const mk = (t: number, kind: TileKind = 'normal'): Cell => ({ id: _uid++, t, kind, hit: false });
const rnd = (n: number) => Math.floor(Math.random() * n);
const wait = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
const calcStars = (score: number, goal: readonly [number,number,number]) =>
  score >= goal[2] ? 3 : score >= goal[1] ? 2 : score >= goal[0] ? 1 : 0;

function mkGrid(types: number, map: readonly (0|1)[][]): Grid {
  const g: Grid = Array.from({ length: ROWS }, (_, r) =>
    Array.from({ length: COLS }, (_, c) => (map[r]?.[c] ? mk(rnd(types)) : null))
  );
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (!map[r]?.[c]) continue;
      let attempts = 0;
      while (attempts++ < 100) {
        const cell = g[r][c]; if (!cell) break;
        const t = cell.t;
        const hMatch = c >= 2 && g[r][c-1]?.t === t && g[r][c-2]?.t === t;
        const vMatch = r >= 2 && g[r-1]?.[c]?.t === t && g[r-2]?.[c]?.t === t;
        if (!hMatch && !vMatch) break;
        g[r][c] = mk(rnd(types));
      }
    }
  }
  return g;
}

function hasMoves(g: Grid): boolean {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (!g[r]?.[c]) continue;
      if (c+1 < COLS && g[r]?.[c+1]) {
        const sw: Grid = g.map(row => [...row]);
        [sw[r][c], sw[r][c+1]] = [sw[r][c+1], sw[r][c]];
        if (findGroups(sw).length > 0) return true;
      }
      if (r+1 < ROWS && g[r+1]?.[c]) {
        const sw: Grid = g.map(row => [...row]);
        [sw[r][c], sw[r+1][c]] = [sw[r+1][c], sw[r][c]];
        if (findGroups(sw).length > 0) return true;
      }
    }
  }
  return false;
}

function findHint(g: Grid): [[number,number],[number,number]] | null {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (!g[r]?.[c]) continue;
      if (c+1 < COLS && g[r]?.[c+1]) {
        const sw: Grid = g.map(row => [...row]);
        [sw[r][c], sw[r][c+1]] = [sw[r][c+1], sw[r][c]];
        if (findGroups(sw).length > 0) return [[r,c],[r,c+1]];
      }
      if (r+1 < ROWS && g[r+1]?.[c]) {
        const sw: Grid = g.map(row => [...row]);
        [sw[r][c], sw[r+1][c]] = [sw[r+1][c], sw[r][c]];
        if (findGroups(sw).length > 0) return [[r,c],[r+1,c]];
      }
    }
  }
  return null;
}

interface Group { cells: [number,number][]; dir: 'h'|'v'; }

function findGroups(g: Grid): Group[] {
  const out: Group[] = [];
  for (let r = 0; r < ROWS; r++) {
    let c = 0;
    while (c < COLS) {
      if (!g[r][c] || g[r][c]!.kind !== 'normal') { c++; continue; }
      const t = g[r][c]!.t; let e = c;
      while (e+1 < COLS && g[r][e+1]?.t === t && g[r][e+1]?.kind === 'normal') e++;
      if (e-c >= 2) { out.push({ cells: Array.from({length:e-c+1},(_,i)=>[r,c+i] as [number,number]), dir:'h' }); c=e+1; }
      else c++;
    }
  }
  for (let c = 0; c < COLS; c++) {
    let r = 0;
    while (r < ROWS) {
      if (!g[r][c] || g[r][c]!.kind !== 'normal') { r++; continue; }
      const t = g[r][c]!.t; let e = r;
      while (e+1 < ROWS && g[e+1]?.[c]?.t === t && g[e+1]?.[c]?.kind === 'normal') e++;
      if (e-r >= 2) { out.push({ cells: Array.from({length:e-r+1},(_,i)=>[r+i,c] as [number,number]), dir:'v' }); r=e+1; }
      else r++;
    }
  }
  return out;
}

function expandSpecials(hits: Set<string>, g: Grid) {
  let changed = true;
  while (changed) {
    changed = false;
    [...hits].forEach(key => {
      const [r, c] = key.split(',').map(Number);
      const cell = g[r]?.[c];
      if (!cell) return;
      if (cell.kind === 'lightning') {
        for (let x=0; x<COLS; x++) if (g[r]?.[x]) { const k=`${r},${x}`; if (!hits.has(k)) { hits.add(k); changed=true; } }
        for (let x=0; x<ROWS; x++) if (g[x]?.[c]) { const k=`${x},${c}`; if (!hits.has(k)) { hits.add(k); changed=true; } }
      } else if (cell.kind === 'bomb') {
        for (let dr=-1; dr<=1; dr++) for (let dc=-1; dc<=1; dc++) {
          const nr=r+dr, nc=c+dc;
          if (nr>=0&&nr<ROWS&&nc>=0&&nc<COLS&&g[nr]?.[nc]) { const k=`${nr},${nc}`; if (!hits.has(k)) { hits.add(k); changed=true; } }
        }
      }
    });
  }
}

function buildCycle(g: Grid, mkSpecials: boolean, swapTo?: [number,number]): { hits: Set<string>; newSpec: Map<string,Cell>; nextG: Grid } | null {
  const groups = findGroups(g);
  if (!groups.length) return null;
  const hits = new Set<string>();
  const newSpec = new Map<string,Cell>();
  groups.forEach(grp => {
    const len = grp.cells.length;
    grp.cells.forEach(([r,c]) => hits.add(`${r},${c}`));
    if (!mkSpecials || len < 4) return;
    let pos: [number,number];
    if (swapTo) {
      const found = grp.cells.find(([r,c]) => r===swapTo[0] && c===swapTo[1]);
      pos = found ?? grp.cells[Math.floor(len/2)];
    } else pos = grp.cells[Math.floor(len/2)];
    const [tr,tc] = pos; const key = `${tr},${tc}`;
    hits.delete(key);
    const cell = g[tr][tc];
    if (cell) newSpec.set(key, mk(cell.t, len>=5?'bomb':'lightning'));
  });
  expandSpecials(hits, g);
  const nextG: Grid = g.map(row => row.map(c => c ? {...c} : null));
  hits.forEach(key => {
    const [r,c]=key.split(',').map(Number);
    const cell=nextG[r][c];
    if (cell && !newSpec.has(key)) cell.hit=true;
  });
  newSpec.forEach((cell,key) => { const [r,c]=key.split(',').map(Number); nextG[r][c]=cell; });
  return { hits, newSpec, nextG };
}

function applyFall(g: Grid, types: number, map: readonly (0|1)[][]): Grid {
  const n: Grid = g.map(row => row.map(cell => cell ? {...cell, hit:false} : null));
  for (let c = 0; c < COLS; c++) {
    const activeRows: number[] = [];
    for (let r=ROWS-1; r>=0; r--) if (map[r]?.[c]) activeRows.push(r);
    if (!activeRows.length) continue;
    const keep: Cell[] = [];
    for (const r of activeRows) {
      const cell = g[r][c];
      if (cell && !cell.hit) keep.push({...cell, hit:false});
    }
    for (let i=0; i<activeRows.length; i++) {
      n[activeRows[i]][c] = i < keep.length ? keep[i] : mk(rnd(types));
    }
  }
  return n;
}

const GAME_CSS = `
  @keyframes floatUp {
    0%   { opacity:1; transform:translateY(0) scale(1.1); }
    70%  { opacity:0.9; transform:translateY(-44px) scale(1.05); }
    100% { opacity:0; transform:translateY(-64px) scale(0.8); }
  }
  @keyframes comboIn {
    0%   { opacity:0; transform:scale(0.3) rotate(-8deg); }
    55%  { opacity:1; transform:scale(1.18) rotate(2deg); }
    80%  { transform:scale(0.96) rotate(-1deg); }
    100% { opacity:1; transform:scale(1) rotate(0deg); }
  }
  @keyframes pulseWarn {
    0%,100% { opacity:1; box-shadow:0 4px 0 rgba(0,0,0,0.18); }
    50%      { opacity:0.7; box-shadow:0 4px 0 rgba(0,0,0,0.18),0 0 24px rgba(255,50,50,0.85); }
  }
  @keyframes starPop {
    0%   { opacity:0; transform:scale(0) rotate(-25deg); }
    65%  { opacity:1; transform:scale(1.45) rotate(8deg); }
    82%  { transform:scale(0.9) rotate(-3deg); }
    100% { opacity:1; transform:scale(1) rotate(0deg); }
  }
  @keyframes hintGlow {
    0%,100% { transform:scale(1.05); box-shadow:0 0 14px rgba(255,240,60,0.5),0 3px 8px rgba(0,0,0,0.35); }
    50%      { transform:scale(1.18); box-shadow:0 0 28px rgba(255,240,60,0.95),0 0 10px rgba(255,200,0,0.8); }
  }
  @keyframes scoreBarFlash {
    0%   { opacity:1; }
    50%  { opacity:0.4; }
    100% { opacity:1; }
  }
  @keyframes splashPulse {
    0%,100% { opacity:0.85; }
    50%      { opacity:1; }
  }
  @keyframes luckySlide {
    0%   { transform:translateY(-60px); opacity:0; }
    15%  { transform:translateY(0); opacity:1; }
    85%  { transform:translateY(0); opacity:1; }
    100% { transform:translateY(-60px); opacity:0; }
  }
  @keyframes luckyGlow {
    0%,100% { box-shadow:0 0 20px rgba(255,215,0,0.6); }
    50%      { box-shadow:0 0 40px rgba(255,215,0,1), 0 0 80px rgba(255,140,0,0.5); }
  }
  @keyframes nearMissShake {
    0%,100% { transform:translateX(0); }
    20%     { transform:translateX(-6px); }
    40%     { transform:translateX(6px); }
    60%     { transform:translateX(-4px); }
    80%     { transform:translateX(4px); }
  }
  @keyframes questBadge {
    0%,100% { transform:scale(1); }
    50%      { transform:scale(1.15); }
  }
`;

export default function LinyDoryGame() {
  const [phase, setPhase]         = useState<Phase>(import.meta.env.DEV ? 'main' : 'splash');
  const [loadPct, setLoadPct]     = useState(0);
  const [lvlIdx, setLvlIdx]       = useState(0);
  const [progress, setProgress]   = useState<number[]>(loadProg);
  const [grid, setGrid]           = useState<Grid>(() => mkGrid(LEVELS[0].types, MAPS[0]));
  const [sel, setSel]             = useState<[number,number]|null>(null);
  const [score, setScore]         = useState(0);
  const [time, setTime]           = useState(60);
  const [movesLeft, setMovesLeft] = useState(0);
  const [popup, setPopup]         = useState<string|null>(null);
  const [popKind, setPopKind]     = useState<'combo'|'special'>('combo');
  const [busy, setBusy]           = useState(false);
  const [floats, setFloats]       = useState<{id:number;text:string}[]>([]);
  const [hintPair, setHintPair]   = useState<[[number,number],[number,number]]|null>(null);
  const [isLucky,  setIsLucky]    = useState(false);
  const [nearMiss, setNearMiss]   = useState(false);
  const [quests,   setQuests]     = useState<QuestSave>(loadQuests);
  const [showQuests, setShowQuests] = useState(false);
  const [coins,    setCoins]      = useState(loadCoins);
  const [boosters,    setBoosters]    = useState(loadBoosters);
  const [boosterMode, setBoosterMode] = useState<'hammer'|'bomb'|null>(null);
  const [showShop,    setShowShop]    = useState(false);
  const [showSettings,setShowSettings]= useState(false);
  const [shopTab,     setShopTab]     = useState<'coin'|'cash'>('coin');
  const [cart,        setCart]        = useState<Record<BoosterKind,number>>({hammer:0,bomb:0,shuffle:0});
  const [pay,         setPay]         = useState<{label:string;cash:number;onDone:()=>void}|null>(null);
  const [payStage,    setPayStage]    = useState<'confirm'|'processing'|'done'>('confirm');
  const [account,     setAccount]     = useState<string>(getScope());

  const gRef     = useRef<Grid>(grid);
  const busyRef  = useRef(false);
  const scoreRef = useRef(0);
  const lvlRef   = useRef(0);
  const movesRef = useRef(0);
  const mapRef   = useRef<readonly (0|1)[][]>(MAPS[0]);
  const popT     = useRef<ReturnType<typeof setTimeout>|null>(null);
  const hintTmr  = useRef<ReturnType<typeof setTimeout>|null>(null);
  const luckyRef = useRef(false);
  const luckyTmr = useRef<ReturnType<typeof setTimeout>|null>(null);

  const scheduleHint = useCallback(() => {
    if (hintTmr.current) clearTimeout(hintTmr.current);
    hintTmr.current = setTimeout(() => setHintPair(findHint(gRef.current)), 2500);
  }, []);

  const clearHint = useCallback(() => {
    if (hintTmr.current) clearTimeout(hintTmr.current);
    setHintPair(null);
  }, []);

  const push = useCallback((g: Grid) => { gRef.current=g; setGrid(g); }, []);

  const inc = useCallback((n: number) => {
    const pts = luckyRef.current ? n * 2 : n;
    scoreRef.current += pts;
    setScore(scoreRef.current);
    const fid = ++_fid;
    const label = pts >= 1000 ? `+${(pts/1000).toFixed(1)}K` : `+${pts}`;
    setFloats(p => [...p.slice(-5), { id: fid, text: luckyRef.current ? `⭐${label}` : label }]);
    setTimeout(() => setFloats(p => p.filter(f => f.id !== fid)), 1100);
  }, []);

  const pop = useCallback((msg: string, kind: 'combo'|'special' = 'combo') => {
    if (popT.current) clearTimeout(popT.current);
    setPopup(msg); setPopKind(kind);
    popT.current = setTimeout(() => setPopup(null), 1400);
  }, []);

  useEffect(() => {
    const refresh = () => setCoins(loadCoins());
    window.addEventListener('coins-updated', refresh);
    return () => window.removeEventListener('coins-updated', refresh);
  }, []);

  // 로그인(계정 전환)으로 스코프가 바뀌면 계정별 저장 데이터를 다시 불러옴
  useEffect(() => {
    const onScope = () => {
      setAccount(getScope());
      setProgress(loadProg());
      setCoins(loadCoins());
      setBoosters(loadBoosters());
      setQuests(loadQuests());
    };
    window.addEventListener('scope-changed', onScope);
    return () => window.removeEventListener('scope-changed', onScope);
  }, []);

  useEffect(() => {
    if (phase !== 'splash') return;
    let cur = 0;
    const id = setInterval(() => {
      cur += Math.random() * 7 + 3;
      if (cur >= 100) { setLoadPct(100); clearInterval(id); setTimeout(() => setPhase('main'), 600); }
      else setLoadPct(Math.floor(cur));
    }, 80);
    return () => clearInterval(id);
  }, [phase]);

  const endGame = useCallback(() => {
    clearHint();
    if (luckyTmr.current) clearTimeout(luckyTmr.current);
    luckyRef.current = false; setIsLucky(false);
    const li = lvlRef.current;
    const s = calcStars(scoreRef.current, LEVELS[li].goal);
    const goal0 = LEVELS[li].goal[0];
    setNearMiss(s === 0 && scoreRef.current >= goal0 * 0.72 && scoreRef.current < goal0);
    if (s > 0) {
      const q = questAddGameCleared();
      setQuests(q);
    }
    setProgress(prev => { const next=[...prev]; if (s>next[li]) next[li]=s; saveProg(next); return next; });
    setPhase('end');
  }, [clearHint]);

  useEffect(() => {
    if (phase !== 'play') return;
    if (LEVELS[lvlRef.current].mode !== 'time') return;
    const id = setInterval(() => setTime(t => { if (t<=1) { endGame(); return 0; } return t-1; }), 1000);
    return () => clearInterval(id);
  }, [phase, endGame]);

  useEffect(() => {
    if (phase !== 'play') { clearHint(); }
  }, [phase, clearHint]);

  useEffect(() => {
    if (phase !== 'play') return;
    const id = setInterval(() => {
      if (luckyRef.current) return;
      if (Math.random() < 0.22) {
        luckyRef.current = true;
        setIsLucky(true);
        pop('🌟 2배 점수! 6초!', 'special');
        luckyTmr.current = setTimeout(() => {
          luckyRef.current = false;
          setIsLucky(false);
        }, 6000);
      }
    }, 8000);
    return () => clearInterval(id);
  }, [phase, pop]);

  const startLevel = useCallback((idx: number) => {
    const lvl = LEVELS[idx];
    const map = MAPS[idx];
    mapRef.current = map;
    _uid = 0;
    const g = mkGrid(lvl.types, map);
    gRef.current=g; busyRef.current=false; scoreRef.current=0; lvlRef.current=idx;
    const mv = (lvl as {moves?:number}).moves ?? 0; movesRef.current=mv;
    setLvlIdx(idx); setGrid(g); setScore(0); setTime((lvl as {sec?:number}).sec ?? 0);
    setMovesLeft(mv); setSel(null); setBusy(false); setPopup(null); setFloats([]);
    setNearMiss(false); setIsLucky(false); luckyRef.current = false;
    setBoosterMode(null);
    setPhase('play');
    if (hintTmr.current) clearTimeout(hintTmr.current);
    setHintPair(null);
    hintTmr.current = setTimeout(() => setHintPair(findHint(gRef.current)), 2500);
  }, []);

  const chain = useCallback(async (g: Grid, swapTo: [number,number]) => {
    const types = LEVELS[lvlRef.current].types;
    const map = mapRef.current;
    let combo=0, cur=g, first=true;
    while (true) {
      const res = buildCycle(cur, first, first ? swapTo : undefined);
      if (!res) break;
      combo++;
      push(res.nextG);
      const spHits = [...res.hits].filter(k => { const [r,c]=k.split(',').map(Number); return cur[r][c]?.kind!=='normal'; }).length;
      const pts = res.hits.size*100*combo + spHits*200;
      inc(pts);
      if (res.newSpec.size > 0) {
        const k = [...res.newSpec.values()][0].kind;
        pop(k==='bomb' ? '💣 BOMB 생성!' : '⚡ LIGHTNING 생성!', 'special');
      } else if (combo >= 2) {
        pop(`${combo}x COMBO! +${pts.toLocaleString()}`, 'combo');
        if (combo >= 5) { const q = questUpdateMaxCombo(combo); setQuests(q); }
      }
      await wait(350);
      cur = applyFall(res.nextG, types, map); push(cur); await wait(220);
      first = false;
    }
    let reshuffles = 0;
    while (!hasMoves(cur) && reshuffles++ < 3) {
      pop('🔀 셔플!', 'special');
      await wait(700);
      cur = mkGrid(LEVELS[lvlRef.current].types, mapRef.current);
      push(cur);
    }
    busyRef.current=false; setBusy(false);
  }, [push, inc, pop]);

  // 부스터(망치/폭탄) 발동 — 선택한 칸에 효과 적용
  const useBoosterAt = useCallback(async (kind: 'hammer'|'bomb', r: number, c: number) => {
    if (busyRef.current) return;
    const g = gRef.current;
    if (!g[r]?.[c]) return;
    busyRef.current=true; setBusy(true); clearHint();
    setBoosterMode(null);
    setBoosters(prev => { const next={...prev,[kind]:Math.max(0,prev[kind]-1)}; saveBoosters(next); return next; });

    const hits = new Set<string>();
    if (kind === 'hammer') {
      hits.add(`${r},${c}`);
    } else {
      for (let dr=-1; dr<=1; dr++) for (let dc=-1; dc<=1; dc++) {
        const nr=r+dr, nc=c+dc;
        if (nr>=0&&nr<ROWS&&nc>=0&&nc<COLS&&g[nr]?.[nc]) hits.add(`${nr},${nc}`);
      }
    }
    expandSpecials(hits, g);
    const marked: Grid = g.map(row => row.map(x => x ? {...x} : null));
    hits.forEach(key => { const [rr,cc]=key.split(',').map(Number); const cell=marked[rr][cc]; if(cell) cell.hit=true; });
    push(marked); inc(hits.size*80);
    pop(kind==='bomb' ? '💣 폭탄 발동!' : '🔨 망치 발동!', 'special');
    await wait(350);
    const fallen = applyFall(marked, LEVELS[lvlRef.current].types, mapRef.current);
    push(fallen); await wait(220);
    await chain(fallen, [r,c]);
    scheduleHint();
  }, [push, inc, pop, chain, clearHint, scheduleHint]);

  // 셔플 부스터 — 즉시 보드 재생성
  const useShuffle = useCallback(() => {
    if (phase!=='play' || busyRef.current) return;
    let ok = false;
    setBoosters(prev => { if (prev.shuffle<=0) return prev; ok=true; const next={...prev,shuffle:prev.shuffle-1}; saveBoosters(next); return next; });
    if (!ok) return;
    clearHint();
    const g = mkGrid(LEVELS[lvlRef.current].types, mapRef.current);
    push(g);
    pop('🔀 셔플!', 'special');
    scheduleHint();
  }, [phase, push, pop, clearHint, scheduleHint]);

  const tap = useCallback(async (r: number, c: number) => {
    if (phase!=='play' || busyRef.current) return;
    if (!gRef.current[r]?.[c]) return;
    if (boosterMode) { await useBoosterAt(boosterMode, r, c); return; }
    if (!sel) { setSel([r,c]); return; }
    const [sr,sc] = sel; setSel(null);
    if (sr===r && sc===c) return;
    if (Math.abs(sr-r)+Math.abs(sc-c)!==1) { setSel([r,c]); return; }

    busyRef.current=true; setBusy(true);
    clearHint();

    const g = gRef.current;
    const sw: Grid = g.map(row => [...row]);
    [sw[sr][sc], sw[r][c]] = [sw[r][c], sw[sr][sc]];
    push(sw); await wait(120);

    const hasMatch = findGroups(sw).length > 0;
    const srcSpec = sw[r][c]?.kind !== 'normal';
    const dstSpec = sw[sr][sc]?.kind !== 'normal';

    if (!hasMatch && !srcSpec && !dstSpec) {
      const rv: Grid = sw.map(row => [...row]);
      [rv[sr][sc], rv[r][c]] = [rv[r][c], rv[sr][sc]];
      push(rv); await wait(200); busyRef.current=false; setBusy(false);
      scheduleHint();
      return;
    }

    const lvl = LEVELS[lvlRef.current];
    if (lvl.mode === 'moves') {
      movesRef.current = Math.max(0, movesRef.current-1);
      setMovesLeft(movesRef.current);
    }

    if (!hasMatch && (srcSpec || dstSpec)) {
      const hits = new Set<string>();
      if (srcSpec) hits.add(`${r},${c}`);
      if (dstSpec) hits.add(`${sr},${sc}`);
      expandSpecials(hits, sw);
      const marked: Grid = sw.map(row => row.map(x => x ? {...x} : null));
      hits.forEach(key => { const [rr,cc]=key.split(',').map(Number); const cell=marked[rr][cc]; if(cell) cell.hit=true; });
      push(marked); inc(hits.size*120);
      pop((srcSpec ? sw[r][c]?.kind : sw[sr][sc]?.kind) === 'bomb' ? '💣 BOOM!' : '⚡ ZAP!', 'special');
      await wait(350);
      const fallen = applyFall(marked, LEVELS[lvlRef.current].types, mapRef.current);
      push(fallen); await wait(220);
      await chain(fallen, [r,c]);
    } else {
      await chain(sw, [r,c]);
    }

    if (LEVELS[lvlRef.current].mode==='moves' && movesRef.current<=0) { endGame(); return; }
    scheduleHint();
  }, [phase, sel, push, chain, endGame, clearHint, scheduleHint, inc, boosterMode, useBoosterAt]);

  // ── 시뮬레이션 결제 ──────────────────────────────────
  const startPay = (label: string, cash: number, onDone: () => void) => {
    setPay({ label, cash, onDone });
    setPayStage('confirm');
  };
  const runPay = () => {
    setPayStage('processing');
    setTimeout(() => {
      setPayStage('done');
      pay?.onDone();
      setTimeout(() => setPay(null), 900);
    }, 1100);
  };

  // ── 장바구니(부스터 묶음 현금 결제) ──────────────────
  const cartCount = cart.hammer + cart.bomb + cart.shuffle;
  const cartTotal = BOOSTERS.reduce((s, b) => s + cart[b.kind] * b.cash, 0);
  const setCartQty = (kind: BoosterKind, delta: number) =>
    setCart(prev => ({ ...prev, [kind]: Math.max(0, Math.min(99, prev[kind] + delta)) }));
  const checkoutCart = () => {
    if (cartCount === 0) return;
    const snapshot = { ...cart };
    startPay(`아이템 ${cartCount}개`, cartTotal, () => {
      setBoosters(prev => {
        const next = {
          hammer:  prev.hammer  + snapshot.hammer,
          bomb:    prev.bomb    + snapshot.bomb,
          shuffle: prev.shuffle + snapshot.shuffle,
        };
        saveBoosters(next); return next;
      });
      setCart({ hammer: 0, bomb: 0, shuffle: 0 });
      pop('🎉 결제 완료! 아이템 지급', 'special');
    });
  };
  const buyCoinPack = (coins: number, cash: number) => {
    startPay(`코인 ${coins.toLocaleString()}개`, cash, () => {
      addCoins(coins);
      pop(`🪙 +${coins.toLocaleString()} 충전 완료!`, 'special');
    });
  };

  // ── 토스 로그인 ──────────────────────────────────────
  const handleLogin = async () => {
    const r = await tossLogin();
    if (!r.ok) { pop('토스 앱에서만 로그인할 수 있어요', 'special'); return; }
    const key = await fetchUserKey();
    if (key) { setScope(key); pop('✅ 로그인 완료! 계정에 저장돼요', 'special'); }
    else pop('로그인은 됐지만 키를 못 받았어요', 'special');
  };
  const handleLogout = () => { setScope('guest'); pop('게스트로 전환했어요', 'special'); };

  const lvl      = LEVELS[lvlIdx];
  const isTime   = lvl.mode === 'time';
  const maxCond  = isTime ? (lvl as {sec?:number}).sec ?? 60 : (lvl as {moves?:number}).moves ?? 1;
  const condLeft = isTime ? time : movesLeft;
  const condPct  = (condLeft / maxCond) * 100;
  const curStars = calcStars(score, lvl.goal);
  const endStars = calcStars(scoreRef.current, lvl.goal);
  const condLabel = isTime ? `${time}` : `${movesLeft}`;
  const isWarning = condPct < 25;
  const condBg = condPct > 50
    ? 'linear-gradient(180deg,#66BB6A,#2E7D32)'
    : condPct > 25
    ? 'linear-gradient(180deg,#FFA726,#E65100)'
    : 'linear-gradient(180deg,#EF5350,#B71C1C)';
  const curMap = MAPS[lvlIdx];

  const renderModals = () => (
    <>
      {/* Shop overlay */}
      {showShop && (
        <div style={{ position:'absolute', inset:0, zIndex:40, background:'rgba(0,0,0,0.78)', backdropFilter:'blur(5px)', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
          <div style={{ width:'100%', maxWidth:360, maxHeight:'88vh', background:'linear-gradient(160deg,#0d1a3a,#1a0d2e)', borderRadius:22, border:'2px solid rgba(255,180,0,0.4)', boxShadow:'0 20px 60px rgba(0,0,0,0.8)', overflow:'hidden', display:'flex', flexDirection:'column' }}>
            <div style={{ padding:'16px 16px 12px', borderBottom:'1px solid rgba(255,180,0,0.2)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <span style={{ fontSize:16, fontWeight:900, color:'#FFD700', letterSpacing:1 }}>🛒 상점</span>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <span style={{ fontSize:13, fontWeight:900, color:'#FFE566' }}>🪙 {coins.toLocaleString()}</span>
                <button onClick={() => setShowShop(false)} style={{ background:'none', border:'none', cursor:'pointer', fontSize:20, color:'rgba(255,255,255,0.6)', lineHeight:1 }}>✕</button>
              </div>
            </div>
            {/* 탭 */}
            <div style={{ display:'flex', gap:6, padding:'10px 12px 0' }}>
              {([['coin','🪙 코인으로'],['cash','💳 충전·결제']] as const).map(([k,label]) => (
                <button key={k} onClick={() => setShopTab(k)}
                  style={{ flex:1, padding:'8px 0', borderRadius:12, border:'none', cursor:'pointer', fontSize:12, fontWeight:900,
                    background: shopTab===k ? 'linear-gradient(135deg,#FF8C00,#FFD700)' : 'rgba(255,255,255,0.06)',
                    color: shopTab===k ? '#3D1C00' : 'rgba(255,255,255,0.55)' }}>{label}</button>
              ))}
            </div>
            <div style={{ padding:12, display:'flex', flexDirection:'column', gap:8, overflowY:'auto' }}>
              {shopTab === 'coin' ? (
                <>
                  {BOOSTERS.map(b => {
                    const afford = coins >= b.price;
                    return (
                      <div key={b.kind} style={{ padding:'10px 12px', borderRadius:14, background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)', display:'flex', alignItems:'center', gap:10 }}>
                        <span style={{ fontSize:26 }}>{b.icon}</span>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:13, fontWeight:800, color:'white' }}>{b.name} <span style={{ fontSize:10, color:'rgba(255,255,255,0.45)', fontWeight:600 }}>보유 {boosters[b.kind]}</span></div>
                          <div style={{ fontSize:10, color:'rgba(255,255,255,0.5)', marginTop:2 }}>{b.desc}</div>
                        </div>
                        <button disabled={!afford}
                          onClick={() => {
                            if (!spendCoins(b.price)) { pop('🪙 코인이 부족해요. 충전 탭에서 결제하세요', 'special'); setShopTab('cash'); return; }
                            setBoosters(prev => { const next={...prev,[b.kind]:prev[b.kind]+1}; saveBoosters(next); return next; });
                            pop(`${b.icon} ${b.name} 구매!`, 'special');
                          }}
                          style={{ padding:'8px 12px', borderRadius:999, border:'none', cursor: afford ? 'pointer' : 'default',
                            background: afford ? 'linear-gradient(135deg,#FF8C00,#FFD700)' : 'rgba(255,255,255,0.12)',
                            color: afford ? '#3D1C00' : 'rgba(255,255,255,0.4)', fontSize:11, fontWeight:900, whiteSpace:'nowrap' }}>
                          🪙 {b.price}
                        </button>
                      </div>
                    );
                  })}
                  <div style={{ padding:'8px 12px', borderRadius:10, background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.08)', fontSize:10, color:'rgba(255,255,255,0.4)', textAlign:'center', lineHeight:1.5 }}>
                    코인은 출석·일일 퀘스트로 모을 수 있어요 🎁
                  </div>
                </>
              ) : (
                <>
                  {/* 코인 충전 패키지 */}
                  <div style={{ fontSize:11, fontWeight:800, color:'rgba(255,220,100,0.85)', letterSpacing:1, padding:'2px 2px' }}>🪙 코인 충전</div>
                  {COIN_PACKS.map((p,i) => (
                    <div key={i} style={{ padding:'10px 12px', borderRadius:14, background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)', display:'flex', alignItems:'center', gap:10 }}>
                      <span style={{ fontSize:24 }}>🪙</span>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:13, fontWeight:800, color:'white' }}>{p.coins.toLocaleString()} 코인 {p.bonus && <span style={{ fontSize:10, color:'#FFD700' }}>{p.bonus}</span>}</div>
                      </div>
                      <button onClick={() => buyCoinPack(p.coins, p.cash)}
                        style={{ padding:'8px 12px', borderRadius:999, border:'none', cursor:'pointer', background:'linear-gradient(135deg,#1565C0,#42A5F5)', color:'white', fontSize:11, fontWeight:900, whiteSpace:'nowrap' }}>
                        ₩{p.cash.toLocaleString()}
                      </button>
                    </div>
                  ))}
                  {/* 부스터 묶음 결제 (장바구니) */}
                  <div style={{ fontSize:11, fontWeight:800, color:'rgba(255,220,100,0.85)', letterSpacing:1, padding:'6px 2px 2px' }}>🛍️ 아이템 묶음 결제</div>
                  {BOOSTERS.map(b => (
                    <div key={b.kind} style={{ padding:'8px 12px', borderRadius:14, background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)', display:'flex', alignItems:'center', gap:8 }}>
                      <span style={{ fontSize:22 }}>{b.icon}</span>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:12, fontWeight:800, color:'white' }}>{b.name}</div>
                        <div style={{ fontSize:10, color:'rgba(255,255,255,0.45)' }}>개당 ₩{b.cash.toLocaleString()}</div>
                      </div>
                      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                        <button onClick={() => setCartQty(b.kind,-1)} style={{ width:26, height:26, borderRadius:8, border:'none', cursor:'pointer', background:'rgba(255,255,255,0.12)', color:'white', fontSize:16, fontWeight:900, lineHeight:1 }}>−</button>
                        <span style={{ minWidth:18, textAlign:'center', fontSize:13, fontWeight:900, color:'white' }}>{cart[b.kind]}</span>
                        <button onClick={() => setCartQty(b.kind,1)} style={{ width:26, height:26, borderRadius:8, border:'none', cursor:'pointer', background:'rgba(255,180,0,0.85)', color:'#3D1C00', fontSize:16, fontWeight:900, lineHeight:1 }}>+</button>
                      </div>
                    </div>
                  ))}
                  <button disabled={cartCount===0} onClick={checkoutCart}
                    style={{ marginTop:4, padding:'13px', borderRadius:14, border:'none', cursor: cartCount? 'pointer':'default',
                      background: cartCount ? 'linear-gradient(135deg,#FF8C00,#FFD700)' : 'rgba(255,255,255,0.1)',
                      color: cartCount ? '#3D1C00' : 'rgba(255,255,255,0.4)', fontSize:14, fontWeight:900 }}>
                    💳 결제하기 {cartCount>0 && `· ${cartCount}개 · ₩${cartTotal.toLocaleString()}`}
                  </button>
                  <div style={{ fontSize:9, color:'rgba(255,255,255,0.3)', textAlign:'center', lineHeight:1.5 }}>
                    * 데모 환경에서는 시뮬레이션 결제로 동작해요
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Settings overlay */}
      {showSettings && (
        <div style={{ position:'absolute', inset:0, zIndex:40, background:'rgba(0,0,0,0.78)', backdropFilter:'blur(5px)', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
          <div style={{ width:'100%', maxWidth:340, background:'linear-gradient(160deg,#0d1a3a,#10101f)', borderRadius:22, border:'2px solid rgba(120,160,255,0.35)', boxShadow:'0 20px 60px rgba(0,0,0,0.8)', overflow:'hidden' }}>
            <div style={{ padding:'16px 16px 12px', borderBottom:'1px solid rgba(120,160,255,0.2)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <span style={{ fontSize:16, fontWeight:900, color:'#9EC0FF', letterSpacing:1 }}>⚙️ 설정</span>
              <button onClick={() => setShowSettings(false)} style={{ background:'none', border:'none', cursor:'pointer', fontSize:20, color:'rgba(255,255,255,0.6)', lineHeight:1 }}>✕</button>
            </div>
            <div style={{ padding:14, display:'flex', flexDirection:'column', gap:10 }}>
              {/* 계정 */}
              <div style={{ padding:'12px', borderRadius:14, background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)' }}>
                <div style={{ fontSize:11, color:'rgba(255,255,255,0.45)', marginBottom:4 }}>계정</div>
                <div style={{ fontSize:13, fontWeight:800, color:'white', marginBottom:10 }}>
                  {account === 'guest' ? '게스트 (로컬 저장)' : `토스 계정 · ${account.slice(0,8)}…`}
                </div>
                {account === 'guest'
                  ? <button onClick={handleLogin} style={{ width:'100%', padding:'11px', borderRadius:12, border:'none', cursor:'pointer', background:'linear-gradient(135deg,#0064FF,#3B8BFF)', color:'white', fontSize:13, fontWeight:900 }}>토스로 로그인</button>
                  : <button onClick={handleLogout} style={{ width:'100%', padding:'11px', borderRadius:12, border:'1px solid rgba(255,255,255,0.2)', cursor:'pointer', background:'rgba(255,255,255,0.06)', color:'rgba(255,255,255,0.8)', fontSize:13, fontWeight:800 }}>게스트로 전환</button>
                }
                <div style={{ fontSize:9, color:'rgba(255,255,255,0.3)', marginTop:8, lineHeight:1.5 }}>
                  로그인하면 스테이지·코인·아이템이 계정별로 저장돼요. (토스 앱에서 동작)
                </div>
              </div>
              {/* 진행도 요약 */}
              <div style={{ padding:'12px', borderRadius:14, background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)', display:'flex', justifyContent:'space-around', textAlign:'center' }}>
                <div><div style={{ fontSize:18, fontWeight:900, color:'#FFD700' }}>⭐ {progress.reduce((a,b)=>a+b,0)}</div><div style={{ fontSize:9, color:'rgba(255,255,255,0.4)' }}>총 별</div></div>
                <div><div style={{ fontSize:18, fontWeight:900, color:'#FFE566' }}>🪙 {coins.toLocaleString()}</div><div style={{ fontSize:9, color:'rgba(255,255,255,0.4)' }}>코인</div></div>
                <div><div style={{ fontSize:18, fontWeight:900, color:'#9EC0FF' }}>🎒 {boosters.hammer+boosters.bomb+boosters.shuffle}</div><div style={{ fontSize:9, color:'rgba(255,255,255,0.4)' }}>아이템</div></div>
              </div>
              {/* 데이터 초기화 */}
              <button onClick={() => {
                  if (confirm('이 계정의 진행도·코인·아이템을 모두 초기화할까요?')) {
                    saveProg(Array(LEVELS.length).fill(0)); setProgress(Array(LEVELS.length).fill(0));
                    saveBoosters({hammer:0,bomb:0,shuffle:0}); setBoosters({hammer:0,bomb:0,shuffle:0});
                    sSet('linydory_coins_v1', 0); setCoins(0); window.dispatchEvent(new Event('coins-updated'));
                    pop('진행도를 초기화했어요', 'special'); setShowSettings(false);
                  }
                }}
                style={{ padding:'11px', borderRadius:12, border:'1px solid rgba(255,80,80,0.4)', cursor:'pointer', background:'rgba(255,40,40,0.12)', color:'#FF8888', fontSize:12, fontWeight:800 }}>
                진행도 초기화
              </button>
              <div style={{ fontSize:9, color:'rgba(255,255,255,0.25)', textAlign:'center' }}>리니와도리의 가시소동 · v1.0</div>
            </div>
          </div>
        </div>
      )}

      {/* Payment modal (시뮬레이션) */}
      {pay && (
        <div style={{ position:'absolute', inset:0, zIndex:60, background:'rgba(0,0,0,0.82)', backdropFilter:'blur(6px)', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
          <div style={{ width:'100%', maxWidth:320, background:'linear-gradient(160deg,#101830,#0a0d18)', borderRadius:22, border:'2px solid rgba(0,100,255,0.45)', boxShadow:'0 20px 60px rgba(0,0,0,0.8)', overflow:'hidden' }}>
            <div style={{ padding:'18px 18px 8px', textAlign:'center' }}>
              <div style={{ fontSize:13, fontWeight:900, color:'#3B8BFF', letterSpacing:1 }}>toss pay</div>
            </div>
            <div style={{ padding:'4px 18px 18px', textAlign:'center' }}>
              {payStage === 'done' ? (
                <>
                  <div style={{ fontSize:44, marginBottom:6 }}>✅</div>
                  <div style={{ fontSize:16, fontWeight:900, color:'white' }}>결제 완료!</div>
                </>
              ) : payStage === 'processing' ? (
                <>
                  <div style={{ fontSize:40, marginBottom:6, animation:'splashPulse 0.7s ease infinite' }}>💳</div>
                  <div style={{ fontSize:14, fontWeight:800, color:'rgba(255,255,255,0.8)' }}>결제 처리 중…</div>
                </>
              ) : (
                <>
                  <div style={{ fontSize:12, color:'rgba(255,255,255,0.5)', marginBottom:4 }}>{pay.label}</div>
                  <div style={{ fontSize:30, fontWeight:900, color:'white', marginBottom:14 }}>₩{pay.cash.toLocaleString()}</div>
                  <div style={{ display:'flex', gap:8 }}>
                    <button onClick={() => setPay(null)} style={{ flex:1, padding:'12px', borderRadius:12, border:'1px solid rgba(255,255,255,0.2)', cursor:'pointer', background:'rgba(255,255,255,0.06)', color:'rgba(255,255,255,0.8)', fontSize:13, fontWeight:800 }}>취소</button>
                    <button onClick={runPay} style={{ flex:2, padding:'12px', borderRadius:12, border:'none', cursor:'pointer', background:'linear-gradient(135deg,#0064FF,#3B8BFF)', color:'white', fontSize:14, fontWeight:900 }}>결제하기</button>
                  </div>
                  <div style={{ fontSize:9, color:'rgba(255,255,255,0.3)', marginTop:10 }}>시뮬레이션 결제 · 실제 청구되지 않아요</div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );

  // ── Splash ────────────────────────────────────────────────────────────────────
  if (phase === 'splash') return (
    <div style={{ position:'relative', width:'100%', height:'100vh', overflow:'hidden', userSelect:'none' }}>
      <style>{GAME_CSS}</style>
      <img src={`${BASE}characters/MAIN.png`} alt="리니와도리의 가시소동" style={{ position:'absolute', top:0, left:0, width:'100%', height:'100%', objectFit:'cover', objectPosition:'top center' }} />
      <div style={{ position:'absolute', top:0, left:0, right:0, padding:'calc(var(--sat) + clamp(28px,6vh,48px)) clamp(16px,5vw,32px) clamp(40px,8vh,80px)', background:'linear-gradient(180deg,rgba(5,10,40,0.85) 0%,transparent 100%)', display:'flex', flexDirection:'column', alignItems:'center' }}>
        <h1 style={{ margin:0, fontSize:'clamp(26px,7.5vw,40px)', fontWeight:900, letterSpacing:'clamp(1px,0.5vw,3px)', color:'#FFE566', WebkitTextStroke:'2px #FFA500', textShadow:'0 4px 0 rgba(0,0,0,0.5),0 0 30px rgba(255,200,0,0.8)', animation:'splashPulse 2s ease infinite', textAlign:'center', whiteSpace:'nowrap' }}>리니와도리의 가시소동</h1>
        <p style={{ margin:'6px 0 0', fontSize:'clamp(10px,2.8vw,13px)', fontWeight:700, letterSpacing:'clamp(2px,1vw,4px)', color:'white', opacity:0.7 }}>ANIMAL PUZZLE</p>
      </div>
      <div style={{ position:'absolute', bottom:0, left:0, right:0, padding:'clamp(36px,8vh,60px) clamp(20px,5vw,32px) calc(var(--sab) + clamp(24px,5vh,40px))', background:'linear-gradient(0deg,rgba(5,10,40,0.9) 0%,transparent 100%)', display:'flex', flexDirection:'column', alignItems:'center', gap:10 }}>
        <div style={{ width:'100%', height:'clamp(16px,3.5vh,22px)', borderRadius:999, overflow:'hidden', background:'rgba(0,0,0,0.5)', border:'2px solid rgba(255,255,255,0.25)' }}>
          <div style={{ height:'100%', width:`${loadPct}%`, borderRadius:999, background:'linear-gradient(90deg,#2E7D32,#43A047,#66BB6A)', transition:'width 0.08s linear' }}/>
        </div>
        <p style={{ margin:0, fontSize:'clamp(11px,3vw,13px)', fontWeight:700, color:'white', opacity:0.75 }}>{loadPct < 100 ? `로딩 중... ${loadPct}%` : '준비 완료! ✓'}</p>
        <p style={{ margin:0, fontSize:'clamp(10px,2.5vw,12px)', color:'white', opacity:0.35, letterSpacing:2 }}>리니와 도리 크래프트</p>
      </div>
    </div>
  );

  // ── Main ──────────────────────────────────────────────────────────────────────
  if (phase === 'main') {
    const nextLvl    = progress.findIndex(s => s === 0);
    const stageIdx   = nextLvl === -1 ? LEVELS.length - 1 : nextLvl;
    const totalStars = progress.reduce((a, b) => a + b, 0);
    const lvlCfg     = LEVELS[stageIdx];
    const dotStart   = Math.max(0, Math.min(stageIdx - 2, LEVELS.length - 5));
    const dots       = Array.from({ length: Math.min(5, LEVELS.length) }, (_, i) => dotStart + i);
    return (
      <div style={{ position:'relative', width:'100%', height:'100vh', overflow:'hidden', userSelect:'none', background:'#0d1a0d' }}>
        <style>{GAME_CSS}</style>
        <img src={`${BASE}characters/MAIN.png`} alt="" style={{ position:'absolute', top:0, left:0, width:'100%', height:'100%', objectFit:'cover', objectPosition:'top center' }} />
        <div style={{ position:'absolute', top:0, left:0, right:0, height:120, background:'linear-gradient(180deg,rgba(5,15,5,0.85) 0%,transparent 100%)' }}/>
        <div style={{ position:'absolute', bottom:0, left:0, right:0, height:'clamp(180px,40vh,260px)', background:'linear-gradient(0deg,rgba(5,15,5,0.97) 0%,rgba(5,15,5,0.65) 65%,transparent 100%)' }}/>
        <div style={{ position:'absolute', top:0, left:0, right:0, padding:'calc(var(--sat) + clamp(10px,2.5vh,16px)) clamp(10px,3vw,16px) 0', display:'flex', alignItems:'center', gap:'clamp(5px,1.5vw,8px)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:4, background:'rgba(0,0,0,0.55)', borderRadius:999, padding:'5px 10px', border:'1.5px solid rgba(255,80,80,0.4)' }}>
            <span style={{ fontSize:14 }}>❤️</span>
            <span style={{ fontSize:13, fontWeight:900, color:'white' }}>5</span>
            <span style={{ fontSize:10, color:'rgba(255,255,255,0.45)', fontWeight:700 }}>/5</span>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:3, background:'rgba(0,0,0,0.55)', borderRadius:999, padding:'5px 10px', border:'1.5px solid rgba(100,200,100,0.35)' }}>
            <span style={{ fontSize:11, fontWeight:800, color:'#66BB6A' }}>⏰ 충전완료</span>
          </div>
          <div style={{ flex:1 }}/>
          <div style={{ display:'flex', alignItems:'center', gap:5, background:'rgba(0,0,0,0.55)', borderRadius:999, padding:'5px 10px', border:'1.5px solid rgba(255,180,0,0.35)' }}>
            <span style={{ fontSize:14 }}>🪙</span><span style={{ fontSize:13, fontWeight:900, color:'#FFE566' }}>{coins.toLocaleString()}</span>
          </div>
          <button onClick={() => setShowQuests(true)} style={{ position:'relative', width:34, height:34, borderRadius:'50%', background:'rgba(0,0,0,0.55)', border:'1.5px solid rgba(255,180,0,0.4)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, cursor:'pointer' }}>
            📋
            {(() => { const q = quests; const cnt = (q.gamesCleared>=3&&!q.claimed.game?1:0)+(q.maxCombo>=5&&!q.claimed.combo?1:0); return cnt > 0 ? <span style={{ position:'absolute', top:-4, right:-4, width:14, height:14, borderRadius:'50%', background:'#FF3030', border:'1.5px solid white', fontSize:9, fontWeight:900, color:'white', display:'flex', alignItems:'center', justifyContent:'center', animation:'questBadge 1s ease infinite' }}>{cnt}</span> : null; })()}
          </button>
        </div>

        {/* Quest Panel Overlay */}
        {showQuests && (
          <div style={{ position:'absolute', inset:0, zIndex:50, background:'rgba(0,0,0,0.75)', backdropFilter:'blur(4px)', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
            <div style={{ width:'100%', maxWidth:340, background:'linear-gradient(160deg,#0d1a0d,#1a1a0d)', borderRadius:20, border:'2px solid rgba(255,180,0,0.35)', boxShadow:'0 20px 60px rgba(0,0,0,0.8)', overflow:'hidden' }}>
              <div style={{ padding:'16px 16px 12px', borderBottom:'1px solid rgba(255,180,0,0.2)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <span style={{ fontSize:16, fontWeight:900, color:'#FFD700', letterSpacing:1 }}>📋 일일 퀘스트</span>
                <button onClick={() => setShowQuests(false)} style={{ background:'none', border:'none', cursor:'pointer', fontSize:20, color:'rgba(255,255,255,0.6)', lineHeight:1 }}>✕</button>
              </div>
              <div style={{ padding:12, display:'flex', flexDirection:'column', gap:8 }}>
                {[
                  { key:'game' as const, icon:'🎮', label:'게임 3판 클리어', target:3, current:quests.gamesCleared, reward:'🪙 +300', claimed:quests.claimed.game },
                  { key:'combo' as const, icon:'⚡', label:'5x 콤보 달성', target:5, current:quests.maxCombo, reward:'🪙 +500', claimed:quests.claimed.combo },
                ].map(q => {
                  const done = q.current >= q.target;
                  return (
                    <div key={q.key} style={{ padding:'10px 12px', borderRadius:12, background: q.claimed ? 'rgba(255,255,255,0.04)' : done ? 'rgba(255,180,0,0.1)' : 'rgba(255,255,255,0.05)', border: `1px solid ${q.claimed ? 'rgba(255,255,255,0.1)' : done ? 'rgba(255,180,0,0.4)' : 'rgba(255,255,255,0.1)'}`, display:'flex', alignItems:'center', gap:10 }}>
                      <span style={{ fontSize:20, opacity: q.claimed ? 0.4 : 1 }}>{q.icon}</span>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:12, fontWeight:800, color: q.claimed ? 'rgba(255,255,255,0.35)' : 'white' }}>{q.label}</div>
                        <div style={{ fontSize:10, color:'rgba(255,255,255,0.45)', marginTop:2 }}>
                          {q.claimed ? '완료 ✓' : `${Math.min(q.current, q.target)} / ${q.target}`}
                        </div>
                        {!q.claimed && <div style={{ marginTop:4, height:4, borderRadius:999, background:'rgba(255,255,255,0.1)', overflow:'hidden' }}>
                          <div style={{ height:'100%', borderRadius:999, background:'linear-gradient(90deg,#FF8C00,#FFD700)', width:`${Math.min((q.current/q.target)*100,100)}%`, transition:'width 0.3s' }}/>
                        </div>}
                      </div>
                      {done && !q.claimed && (
                        <button onClick={() => { const r = questClaim(q.key); if (r.success) setQuests(loadQuests()); }} style={{ padding:'6px 10px', borderRadius:999, background:'linear-gradient(135deg,#FF8C00,#FFD700)', border:'none', cursor:'pointer', fontSize:10, fontWeight:900, color:'#3D1C00', whiteSpace:'nowrap' }}>
                          수령 {q.reward}
                        </button>
                      )}
                      {q.claimed && <span style={{ fontSize:18, opacity:0.5 }}>✅</span>}
                    </div>
                  );
                })}
                <div style={{ padding:'8px 12px', borderRadius:10, background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.08)', fontSize:10, color:'rgba(255,255,255,0.35)', textAlign:'center' }}>
                  🪙 모은 코인: <span style={{ color:'#FFE566', fontWeight:800 }}>{coins.toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        <div style={{ position:'absolute', bottom:'calc(var(--sab) + clamp(60px,10vh,80px))', left:0, right:0, display:'flex', flexDirection:'column', alignItems:'center', gap:'clamp(10px,2.5vh,16px)', padding:'0 clamp(16px,5vw,32px)' }}>
          <div style={{ display:'flex', alignItems:'flex-end', gap:10 }}>
            {dots.map(li => {
              const s = progress[li]; const isCur = li === stageIdx;
              return (
                <div key={li} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:3 }}>
                  <div style={{ width:isCur?44:32, height:isCur?44:32, borderRadius:'50%', background:isCur?'linear-gradient(135deg,#FFB300,#FF6F00)':s>0?'rgba(255,255,255,0.25)':'rgba(0,0,0,0.45)', border:`2.5px solid ${isCur?'white':s>0?'rgba(255,255,255,0.4)':'rgba(255,255,255,0.15)'}`, boxShadow:isCur?'0 4px 16px rgba(255,150,0,0.6)':'none', display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <span style={{ fontSize:isCur?13:10, fontWeight:900, color:'white' }}>{li+1}</span>
                  </div>
                  <div style={{ display:'flex' }}>{[1,2,3].map(n=><span key={n} style={{ fontSize:7, opacity:n<=s?1:0.15 }}>⭐</span>)}</div>
                </div>
              );
            })}
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <span style={{ fontSize:11, fontWeight:700, color:'rgba(255,255,255,0.6)', background:'rgba(0,0,0,0.4)', padding:'3px 10px', borderRadius:999, border:'1px solid rgba(255,255,255,0.15)' }}>
              {lvlCfg.mode==='time'?`⏱ ${(lvlCfg as {sec?:number}).sec}초`:`🎯 ${(lvlCfg as {moves?:number}).moves}수`}
            </span>
            <span style={{ fontSize:11, fontWeight:700, color:'rgba(255,255,255,0.6)', background:'rgba(0,0,0,0.4)', padding:'3px 10px', borderRadius:999, border:'1px solid rgba(255,255,255,0.15)' }}>⭐ {totalStars}/{LEVELS.length*3}</span>
          </div>
          <button onClick={() => startLevel(stageIdx)}
            style={{ width:'100%', padding:'15px 0', borderRadius:999, background:'linear-gradient(180deg,#42A5F5 0%,#1565C0 100%)', border:'none', cursor:'pointer', boxShadow:'0 6px 0 #0D3B80,0 10px 28px rgba(0,80,200,0.55)', color:'white', fontWeight:900, fontSize:22, letterSpacing:3, display:'flex', alignItems:'center', justifyContent:'center', gap:10 }}
            onTouchStart={e=>(e.currentTarget.style.transform='scale(0.97)')} onTouchEnd={e=>(e.currentTarget.style.transform='scale(1)')}>
            <span style={{ fontSize:24 }}>🎮</span> STAGE {stageIdx+1} <span style={{ fontSize:20 }}>▶</span>
          </button>
        </div>
        <div style={{ position:'absolute', bottom:0, left:0, right:0, paddingBottom:'var(--sab)', background:'rgba(5,15,5,0.92)', borderTop:'1.5px solid rgba(255,255,255,0.1)', display:'flex', alignItems:'center', justifyContent:'space-around', minHeight:'clamp(56px,8vh,72px)' }}>
          {[
            {icon:'🏠',label:'홈',   fn:()=>{},                   active:true },
            {icon:'🗺️',label:'맵',   fn:()=>setPhase('map'),      active:false},
            {icon:'🛒',label:'상점', fn:()=>setShowShop(true),    active:false},
            {icon:'⚙️',label:'설정', fn:()=>setShowSettings(true), active:false},
          ].map((item,i)=>(
            <button key={i} onClick={item.fn} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:2, background:'none', border:'none', cursor:'pointer', padding:'6px 14px' }}>
              <span style={{ fontSize:22, filter:item.active?'drop-shadow(0 0 8px #FFB300)':'none', opacity:item.active?1:0.6 }}>{item.icon}</span>
              <span style={{ fontSize:10, fontWeight:700, color:item.active?'#FFB300':'rgba(255,255,255,0.45)' }}>{item.label}</span>
            </button>
          ))}
        </div>
        {renderModals()}
      </div>
    );
  }

  // ── Map ───────────────────────────────────────────────────────────────────────
  if (phase === 'map') {
    const isUnlocked = (i:number) => i===0 || progress[i-1]>=1;
    const totalStars = progress.reduce((a,b)=>a+b,0);
    return (
      <div style={{ display:'flex', flexDirection:'column', width:'100%', height:'100vh', userSelect:'none', background:'linear-gradient(180deg,#1565C0 0%,#0D47A1 60%,#0A2E6E 100%)', overflow:'hidden' }}>
        <style>{GAME_CSS}</style>
        <div style={{ flexShrink:0, padding:'calc(var(--sat) + clamp(10px,2.5vh,16px)) clamp(12px,4vw,16px) clamp(6px,1.5vh,10px)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <button onClick={()=>setPhase('main')} style={{ padding:'6px 12px', borderRadius:999, color:'white', fontSize:14, fontWeight:700, background:'rgba(0,0,0,0.3)', border:'1px solid rgba(255,255,255,0.2)', cursor:'pointer' }}>← 홈</button>
          <span style={{ fontSize:15, fontWeight:900, letterSpacing:1, color:'#FFE566', WebkitTextStroke:'0.5px #FFA500', whiteSpace:'nowrap' }}>리니와도리의 가시소동</span>
          <div style={{ display:'flex', alignItems:'center', gap:4, padding:'6px 12px', borderRadius:999, background:'rgba(0,0,0,0.3)', border:'1px solid rgba(255,255,255,0.2)' }}>
            <span>⭐</span><span style={{ color:'white', fontWeight:700, fontSize:14 }}>{totalStars}/{LEVELS.length*3}</span>
          </div>
        </div>
        <div style={{ flex:1, position:'relative', margin:'0 16px 16px' }}>
          <div style={{ width:'100%', height:'100%', position:'relative', borderRadius:16, overflow:'hidden', background:'rgba(0,0,60,0.25)', border:'2px solid rgba(255,255,255,0.1)' }}>
            <svg style={{ position:'absolute', inset:0, width:'100%', height:'100%', zIndex:1 }}>
              {MAP_POS.slice(0,-1).map(([col,row],i)=>{
                const [nc,nr]=MAP_POS[i+1]; const done=progress[i]>0;
                return <line key={i} x1={`${COL_X[col]}%`} y1={`${ROW_Y[row]}%`} x2={`${COL_X[nc]}%`} y2={`${ROW_Y[nr]}%`} stroke={done?'#FFB300':'rgba(255,255,255,0.18)'} strokeWidth="3" strokeDasharray={done?'0':'8,5'} strokeLinecap="round"/>;
              })}
            </svg>
            {LEVELS.map((_,i)=>{
              const [col,row]=MAP_POS[i]; const unlocked=isUnlocked(i); const s=progress[i];
              const modeIcon=LEVELS[i].mode==='time'?'⏱':'🎯';
              return (
                <button key={i} onClick={()=>unlocked&&startLevel(i)} disabled={!unlocked}
                  style={{ position:'absolute', width:60, height:60, left:`calc(${COL_X[col]}% - 30px)`, top:`calc(${ROW_Y[row]}% - 30px)`, zIndex:2, borderRadius:'50%', cursor:unlocked?'pointer':'default', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
                    background:!unlocked?'rgba(10,10,40,0.8)':s===3?'linear-gradient(135deg,#FF6F00,#FFB300)':s===2?'linear-gradient(135deg,#6A1B9A,#CE93D8)':'linear-gradient(135deg,#0D47A1,#1976D2)',
                    border:unlocked?'3px solid rgba(255,255,255,0.55)':'2px solid rgba(255,255,255,0.12)', boxShadow:unlocked?'0 4px 16px rgba(0,0,0,0.5)':'none', opacity:unlocked?1:0.45 }}>
                  {unlocked ? (<>
                    <div style={{ display:'flex', alignItems:'center', gap:1 }}><span style={{ fontSize:7 }}>{modeIcon}</span><span style={{ color:'white', fontWeight:900, fontSize:15 }}>{i+1}</span></div>
                    <div style={{ display:'flex' }}>{[1,2,3].map(n=><span key={n} style={{ fontSize:8, opacity:n<=s?1:0.2 }}>⭐</span>)}</div>
                  </>) : <span style={{ fontSize:20 }}>🔒</span>}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ── Play / End ────────────────────────────────────────────────────────────────
  return (
    <div style={{ display:'flex', flexDirection:'column', width:'100%', height:'100vh', overflow:'hidden', position:'relative', background:'linear-gradient(180deg,#7EC8F0 0%,#AEE4F8 30%,#C5F0A4 70%,#8BC34A 100%)', userSelect:'none' }}>
      <style>{GAME_CSS}</style>

      {/* Cloud decorations */}
      <div style={{ position:'absolute', inset:0, pointerEvents:'none', zIndex:0 }}>
        <div style={{ position:'absolute', top:'7%', left:'5%',  width:100, height:50, borderRadius:'50%', background:'rgba(255,255,255,0.6)', filter:'blur(10px)' }}/>
        <div style={{ position:'absolute', top:'5%', left:'18%', width:65,  height:32, borderRadius:'50%', background:'rgba(255,255,255,0.5)', filter:'blur(7px)'  }}/>
        <div style={{ position:'absolute', top:'9%', right:'7%', width:85,  height:42, borderRadius:'50%', background:'rgba(255,255,255,0.55)',filter:'blur(9px)'  }}/>
      </div>

      {/* Header white card */}
      <div style={{ flexShrink:0, position:'relative', zIndex:10, margin:'calc(var(--sat) + 8px) 10px 0', background:'white', borderRadius:22, padding:'8px 10px', boxShadow:'0 4px 20px rgba(0,0,0,0.18)', display:'flex', alignItems:'center', gap:8 }}>
        {/* Timer / Moves badge */}
        <div style={{
          background: condBg,
          borderRadius: 16,
          padding: '6px 14px',
          minWidth: 56,
          textAlign: 'center',
          boxShadow: '0 4px 0 rgba(0,0,0,0.18)',
          flexShrink: 0,
          animation: isWarning ? 'pulseWarn 0.55s ease infinite' : undefined,
        }}>
          <div style={{ fontSize:'clamp(24px,7vw,30px)', fontWeight:900, color:'white', lineHeight:1 }}>{condLabel}</div>
          <div style={{ fontSize:8, color:'rgba(255,255,255,0.9)', fontWeight:700, letterSpacing:1, marginTop:1 }}>{isTime?'TIME':'MOVE'}</div>
        </div>
        {/* Stage + score bar */}
        <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:3, position:'relative' }}>
          <span style={{ fontSize:10, fontWeight:800, color:'#aaa', letterSpacing:2 }}>STAGE {lvlIdx+1}</span>
          <div style={{ width:'100%', position:'relative', height:8, borderRadius:999, background:'#efefef', overflow:'visible' }}>
            <div style={{ position:'absolute', left:0, top:0, bottom:0, borderRadius:999, width:`${Math.min((score/lvl.goal[2])*100,100)}%`, background:'linear-gradient(90deg,#FF8C00,#FFD700)', transition:'width 0.3s ease' }}/>
            {lvl.goal.map((gv,i) => (
              <div key={i} style={{ position:'absolute', top:-3, bottom:-3, left:`${(gv/lvl.goal[2])*100}%`, width:2, background:'rgba(0,0,0,0.15)', transform:'translateX(-50%)' }}/>
            ))}
          </div>
          <span style={{ fontSize:'clamp(17px,5.5vw,22px)', fontWeight:900, color:'#222' }}>{score.toLocaleString()}</span>
          {/* Floating score numbers */}
          <div style={{ position:'absolute', top:-8, left:0, right:0, display:'flex', justifyContent:'center', pointerEvents:'none', zIndex:20 }}>
            {floats.map(f => (
              <span key={f.id} style={{
                position:'absolute',
                fontWeight:900,
                fontSize:'clamp(13px,3.8vw,16px)',
                color:'#FF6F00',
                textShadow:'0 1px 0 rgba(255,255,255,0.8), 0 0 8px rgba(255,140,0,0.6)',
                animation:'floatUp 1.1s ease-out both',
                whiteSpace:'nowrap',
              }}>{f.text}</span>
            ))}
          </div>
        </div>
        {/* Stars + back button */}
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4, flexShrink:0 }}>
          <div style={{ display:'flex' }}>
            {[1,2,3].map(s=>(
              <span key={s} style={{ fontSize:15, filter:s<=curStars?'drop-shadow(0 0 5px #FFD700)':'grayscale(1) opacity(0.3)', transition:'filter 0.3s, transform 0.3s', transform:s<=curStars?'scale(1.1)':'scale(1)' }}>⭐</span>
            ))}
          </div>
          <button onClick={()=>setPhase('main')} style={{ background:'none', border:'none', cursor:'pointer', fontSize:17, padding:0, lineHeight:1 }}>⚙️</button>
        </div>
      </div>

      {/* Hint button */}
      {phase==='play' && !busy && (
        <div style={{ position:'absolute', top:'calc(var(--sat) + 8px)', right:10, zIndex:15, pointerEvents:'none' }}>
          {hintPair && (
            <div style={{ fontSize:9, fontWeight:800, color:'rgba(255,220,0,0.9)', textShadow:'0 1px 4px rgba(0,0,0,0.6)', letterSpacing:1, animation:'splashPulse 1s ease infinite', paddingTop:2 }}>💡 HINT</div>
          )}
        </div>
      )}

      {/* Lucky Time Event banner */}
      {phase === 'play' && isLucky && (
        <div style={{ position:'absolute', top:0, left:0, right:0, zIndex:25, pointerEvents:'none',
          display:'flex', justifyContent:'center', paddingTop:'calc(var(--sat) + 76px)' }}>
          <div style={{
            padding: '8px 24px', borderRadius: 999,
            background: 'linear-gradient(135deg,#FF8C00,#FFD700,#FF8C00)',
            backgroundSize: '200% 100%',
            fontWeight: 900, fontSize: 'clamp(14px,4vw,17px)', color: '#3D1C00',
            boxShadow: '0 4px 24px rgba(255,180,0,0.9)',
            animation: 'luckyGlow 0.8s ease infinite',
            whiteSpace: 'nowrap',
            letterSpacing: 1,
          }}>🌟 2배 점수 타임! 🌟</div>
        </div>
      )}

      {/* Combo / Special popup */}
      {popup && (
        <div style={{ position:'absolute', zIndex:30, pointerEvents:'none', display:'flex', justifyContent:'center', top:'23%', left:0, right:0 }}>
          <div key={popup} style={{
            padding: popKind==='special' ? '10px 30px' : '8px 24px',
            borderRadius: 999,
            fontWeight: 900,
            fontSize: popKind==='special' ? 'clamp(16px,4.5vw,20px)' : 'clamp(14px,4vw,17px)',
            color: 'white',
            background: popKind==='special'
              ? 'linear-gradient(135deg,#6A1B9A,#E040FB)'
              : 'linear-gradient(135deg,#FF6F00,#FFB300)',
            boxShadow: popKind==='special'
              ? '0 4px 28px rgba(160,0,220,0.75), 0 0 0 2px rgba(255,255,255,0.3)'
              : '0 4px 24px rgba(255,100,0,0.7)',
            whiteSpace: 'nowrap',
            animation: 'comboIn 0.38s cubic-bezier(0.34,1.56,0.64,1) both',
          }}>{popup}</div>
        </div>
      )}

      {/* Grid */}
      <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', position:'relative', zIndex:10, padding:'6px 10px clamp(10px,2.5vh,16px)' }}>
        <div style={{ width:'100%', maxWidth:390, borderRadius:24, padding:'clamp(6px,1.8vw,10px)', background:'rgba(25,15,75,0.72)', boxShadow:'0 8px 36px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1)', backdropFilter:'blur(2px)' }}>
          <div style={{ display:'grid', gridTemplateColumns:`repeat(${COLS},1fr)`, gap:'clamp(3px,1vw,5px)' }}>
            {Array.from({ length: ROWS * COLS }, (_, idx) => {
              const row = Math.floor(idx / COLS);
              const col = idx % COLS;
              const cell = grid[row]?.[col] ?? null;
              const active = curMap[row]?.[col] === 1;

              if (!active) {
                return (
                  <div key={`hole-${row}-${col}`} style={{ aspectRatio:'1', borderRadius:'50%', background:'rgba(0,0,0,0.38)', boxShadow:'inset 0 3px 8px rgba(0,0,0,0.75)' }}/>
                );
              }

              if (!cell) return <div key={`empty-${row}-${col}`} style={{ aspectRatio:'1' }}/>;

              const tile = TILES[cell.t];
              const isSel = sel?.[0]===row && sel?.[1]===col;
              const isSpecial = cell.kind !== 'normal';
              const isHint = phase==='play' && hintPair !== null && (
                (hintPair[0][0]===row && hintPair[0][1]===col) ||
                (hintPair[1][0]===row && hintPair[1][1]===col)
              );

              return (
                <button key={cell.id} onClick={()=>tap(row,col)} disabled={busy||phase==='end'}
                  style={{
                    aspectRatio:'1', position:'relative', overflow:'hidden', borderRadius:'50%', padding:0,
                    background: tile.bg,
                    border: isSel
                      ? '3px solid white'
                      : isHint
                      ? '2.5px solid #FFE566'
                      : isSpecial
                      ? `2.5px solid ${cell.kind==='lightning'?'#FFE566':'#FF7043'}`
                      : '2px solid rgba(255,255,255,0.5)',
                    boxShadow: isSel
                      ? `0 0 0 3px rgba(255,255,255,0.35), 0 0 18px white, 0 4px 10px rgba(0,0,0,0.4), inset 0 -4px 8px rgba(0,0,0,0.2), inset 0 4px 8px rgba(255,255,255,0.35)`
                      : isHint
                      ? `0 0 18px rgba(255,230,0,0.9), 0 3px 8px rgba(0,0,0,0.35), inset 0 -3px 6px rgba(0,0,0,0.15)`
                      : isSpecial
                      ? `0 0 12px ${cell.kind==='lightning'?'#FFE56699':'#FF704399'}, 0 3px 8px rgba(0,0,0,0.35), inset 0 -3px 6px rgba(0,0,0,0.15), inset 0 3px 6px rgba(255,255,255,0.3)`
                      : `0 3px 8px rgba(0,0,0,0.35), inset 0 -3px 6px rgba(0,0,0,0.15), inset 0 3px 6px rgba(255,255,255,0.3)`,
                    transform: isSel ? 'scale(1.15)' : cell.hit ? 'scale(0)' : 'scale(1)',
                    opacity: cell.hit ? 0 : 1,
                    transition: 'transform 0.15s ease, opacity 0.15s ease',
                    cursor: 'pointer',
                    animation: isHint && !isSel ? 'hintGlow 0.75s ease infinite' : undefined,
                  }}>
                  {/* 4개 이상 매치로 생성된 특수 블럭은 캐릭터 이미지 대신 전용 아이콘으로 교체 */}
                  {isSpecial ? (
                    <span style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'clamp(24px,7vw,34px)', lineHeight:1, filter:'drop-shadow(0 2px 4px rgba(0,0,0,0.7))', zIndex:2 }}>{cell.kind==='lightning'?'⚡':'💣'}</span>
                  ) : (
                    <img src={tile.img} alt="" style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover', objectPosition:'center 8%' }}/>
                  )}
                  <div style={{ position:'absolute', top:0, left:'5%', right:'5%', height:'48%', borderRadius:'0 0 50% 50%', background:'linear-gradient(180deg,rgba(255,255,255,0.62) 0%,rgba(255,255,255,0.05) 100%)', pointerEvents:'none', zIndex:1 }}/>
                  <div style={{ position:'absolute', bottom:0, left:0, right:0, height:'28%', borderRadius:'0 0 50% 50%', background:'linear-gradient(0deg,rgba(0,0,0,0.2) 0%,transparent 100%)', pointerEvents:'none', zIndex:1 }}/>
                  {isSel && <div style={{ position:'absolute', inset:0, background:'rgba(255,255,255,0.2)', borderRadius:'50%', zIndex:2 }}/>}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Booster aim banner */}
      {phase==='play' && boosterMode && (
        <div style={{ position:'absolute', left:0, right:0, top:'44%', zIndex:24, display:'flex', justifyContent:'center', pointerEvents:'none' }}>
          <div style={{ padding:'7px 18px', borderRadius:999, background:'rgba(0,0,0,0.8)', color:'#FFE566', fontWeight:800, fontSize:13, whiteSpace:'nowrap', boxShadow:'0 0 18px rgba(255,180,0,0.6)', animation:'splashPulse 0.9s ease infinite' }}>
            {boosterMode==='bomb'?'💣':'🔨'} 제거할 블럭 선택! (다시 탭하면 취소)
          </div>
        </div>
      )}

      {/* Booster bar */}
      {phase==='play' && (
        <div style={{ flexShrink:0, position:'relative', zIndex:12, display:'flex', alignItems:'center', justifyContent:'center', gap:'clamp(6px,2vw,10px)', padding:'0 10px calc(var(--sab) + 8px)' }}>
          {BOOSTERS.map(b => {
            const cnt = boosters[b.kind];
            const armed = boosterMode === b.kind;
            return (
              <button key={b.kind} disabled={busy}
                onClick={() => {
                  if (busy) return;
                  if (cnt <= 0) { setShowShop(true); return; }
                  if (b.kind === 'shuffle') { useShuffle(); return; }
                  setBoosterMode(armed ? null : b.kind);
                }}
                style={{
                  position:'relative', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
                  width:58, height:54, borderRadius:16, cursor:'pointer',
                  background: armed ? 'linear-gradient(145deg,#FF8C00,#FFD700)' : 'rgba(255,255,255,0.92)',
                  border: armed ? '2.5px solid white' : '2px solid rgba(0,0,0,0.1)',
                  boxShadow: armed ? '0 0 16px rgba(255,180,0,0.9), 0 4px 0 rgba(0,0,0,0.15)' : '0 4px 0 rgba(0,0,0,0.15)',
                  opacity: cnt <= 0 ? 0.5 : 1, transition:'all 0.15s ease',
                }}>
                <span style={{ fontSize:22, lineHeight:1 }}>{b.icon}</span>
                <span style={{ fontSize:9, fontWeight:800, color: armed ? '#3D1C00' : '#555' }}>{b.name}</span>
                <span style={{ position:'absolute', top:-6, right:-6, minWidth:18, height:18, padding:'0 4px', borderRadius:999,
                  background: cnt > 0 ? '#22AA55' : '#BBB', border:'1.5px solid white', color:'white', fontSize:10, fontWeight:900,
                  display:'flex', alignItems:'center', justifyContent:'center' }}>{cnt}</span>
              </button>
            );
          })}
          <button onClick={() => setShowShop(true)}
            style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
              width:58, height:54, borderRadius:16, cursor:'pointer', background:'linear-gradient(145deg,#42A5F5,#1565C0)', border:'2px solid rgba(255,255,255,0.4)', boxShadow:'0 4px 0 #0D3B80' }}>
            <span style={{ fontSize:20, lineHeight:1 }}>🛒</span>
            <span style={{ fontSize:9, fontWeight:800, color:'white' }}>상점</span>
          </button>
        </div>
      )}

      {renderModals()}

      {/* End overlay */}
      {phase==='end' && (
        <div style={{ position:'absolute', inset:0, zIndex:20, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:'clamp(8px,2vh,14px)', background:'rgba(10,10,60,0.88)', backdropFilter:'blur(8px)', padding:'0 clamp(16px,5vw,24px)' }}>
          {nearMiss ? (
            <div style={{ textAlign:'center', animation:'nearMissShake 0.5s ease 0.2s' }}>
              <div style={{ fontSize:'clamp(26px,7vw,34px)', fontWeight:900, color:'#FFD700', animation:'splashPulse 0.8s ease infinite' }}>😱 아깝다!</div>
              <div style={{ fontSize:'clamp(12px,3.2vw,14px)', color:'rgba(255,240,100,0.9)', marginTop:2 }}>조금만 더 하면 별을 딸 수 있어요!</div>
            </div>
          ) : (
            <h2 style={{ fontSize:'clamp(22px,6vw,30px)', fontWeight:900, color:'white', margin:0 }}>게임 종료! 🏆</h2>
          )}
          <div style={{ display:'flex', gap:'clamp(8px,2.5vw,12px)', fontSize:'clamp(32px,10vw,48px)' }}>
            {[1,2,3].map(s=>(
              <span key={s} style={{
                display:'inline-block',
                filter: s<=endStars ? 'drop-shadow(0 0 14px #FFD700) drop-shadow(0 0 6px #FF8C00)' : 'grayscale(1) opacity(0.25)',
                animation: s<=endStars ? `starPop 0.5s ${(s-1)*0.18}s cubic-bezier(0.34,1.56,0.64,1) both` : undefined,
              }}>⭐</span>
            ))}
          </div>
          <div style={{ textAlign:'center' }}>
            <div style={{ fontSize:'clamp(10px,2.8vw,12px)', color:'white', opacity:0.5, marginBottom:4 }}>{isTime?`⏱ ${(lvl as {sec?:number}).sec}초 도전`:`🎯 ${(lvl as {moves?:number}).moves}수 도전`}</div>
            <div style={{ fontSize:'clamp(12px,3.5vw,14px)', color:'white', opacity:0.6 }}>최종 점수</div>
            <div style={{ fontSize:'clamp(32px,10vw,48px)', fontWeight:900, color:'white', marginTop:4 }}>{score.toLocaleString()}</div>
            <div style={{ fontSize:'clamp(11px,3vw,12px)', color:'white', opacity:0.5, marginTop:8, lineHeight:1.6 }}>
              {nearMiss ? `목표까지 ${(lvl.goal[0]-score).toLocaleString()}점 남았어요!` : endStars===0?'아쉬워요… 다시 도전!':endStars===1?'좋아요! 더 잘할 수 있어요':endStars===2?'훌륭해요! 조금만 더!':'완벽해요! 대단해요! 🎉'}
            </div>
            <div style={{ display:'flex', gap:8, marginTop:6, justifyContent:'center' }}>
              {lvl.goal.map((gv,i)=>(
                <div key={i} style={{ textAlign:'center', opacity: score>=gv ? 1 : 0.45 }}>
                  <div style={{ fontSize:10 }}>{'⭐'.repeat(i+1)}</div>
                  <div style={{ fontSize:11, fontWeight:700, color: score>=gv ? '#FFE566' : 'rgba(255,255,255,0.5)' }}>{gv.toLocaleString()}</div>
                </div>
              ))}
            </div>
            {endStars>0&&lvlIdx<LEVELS.length-1&&<div style={{ fontSize:'clamp(11px,3vw,12px)', color:'#FDE68A', marginTop:4, opacity:0.9 }}>다음 레벨 해제됨! 🔓</div>}
          </div>
          <div style={{ display:'flex', gap:'clamp(8px,2.5vw,12px)' }}>
            <button onClick={()=>startLevel(lvlIdx)} style={{ padding:'clamp(10px,2.5vh,12px) clamp(18px,5vw,24px)', borderRadius:999, fontWeight:900, fontSize:'clamp(13px,3.8vw,16px)', color:'white', background: nearMiss ? 'linear-gradient(135deg,#FF6F00,#FFD700)' : 'linear-gradient(135deg,#1565C0,#42A5F5)', boxShadow: nearMiss ? '0 4px 0 #B84800' : '0 4px 0 #0D3B80', border:'none', cursor:'pointer' }}>
              {nearMiss ? '한 판 더! 🔥' : '다시하기 🔄'}
            </button>
            {endStars>0 && lvlIdx<LEVELS.length-1
              ? <button onClick={()=>startLevel(lvlIdx+1)} style={{ padding:'clamp(10px,2.5vh,12px) clamp(18px,5vw,24px)', borderRadius:999, fontWeight:900, fontSize:'clamp(13px,3.8vw,16px)', color:'white', background:'linear-gradient(135deg,#FF6F00,#FFB300)', boxShadow:'0 4px 0 #B84800', border:'none', cursor:'pointer' }}>다음 스테이지 ▶</button>
              : !nearMiss && <button onClick={()=>setPhase('map')} style={{ padding:'clamp(10px,2.5vh,12px) clamp(18px,5vw,24px)', borderRadius:999, fontWeight:900, fontSize:'clamp(13px,3.8vw,16px)', color:'white', background:'linear-gradient(135deg,#FF6F00,#FFB300)', boxShadow:'0 4px 0 #B84800', border:'none', cursor:'pointer' }}>맵으로 🗺️</button>
            }
          </div>
        </div>
      )}
    </div>
  );
}
