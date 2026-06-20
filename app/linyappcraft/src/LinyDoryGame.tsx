import { useState, useEffect, useRef, useCallback, type CSSProperties } from 'react';
import { loadCoins, spendCoins, addCoins, loadBoosters, saveBoosters, loadLives, spendLife, addLives, nextLifeMs, LIVES_MAX, questAddGameCleared, questUpdateMaxCombo, questAddSpecials, questAddBlocks, questClaim, loadQuests, QUESTS, type QuestSave, type BoosterKind } from './quest';
import { sGet, sSet, getScope, setScope } from './store';
import { tossLogin, fetchUserKey } from './toss';
import { sfx, buzz, primeAudio, isMuted, toggleMuted, startBgm, stopBgm } from './sfx';
import { CHANNEL_URL } from './episodes';
import { Icon, type IconName } from './icons';

// 부스터(블럭 제거 아이템) 상점 정보
// price = 코인 가격, cash = 시뮬레이션 현금 결제 가격(원)
const BOOSTERS: { kind: BoosterKind; icon: string; name: string; desc: string; price: number; cash: number; aim: boolean }[] = [
  { kind: 'hammer',   icon: '🔨', name: '망치',   desc: '블럭 1개 제거',       price: 100, cash: 500,  aim: true  },
  { kind: 'bomb',     icon: '💣', name: '폭탄',   desc: '주변 3×3 제거',       price: 250, cash: 1200, aim: true  },
  { kind: 'rowClear', icon: '↔', name: '가로',   desc: '가로 한 줄 제거',     price: 200, cash: 1000, aim: true  },
  { kind: 'colClear', icon: '↕', name: '세로',   desc: '세로 한 줄 제거',     price: 200, cash: 1000, aim: true  },
  { kind: 'allClear', icon: '🌈', name: '전체',   desc: '보드 전체 제거',      price: 500, cash: 2500, aim: false },
  { kind: 'shuffle',  icon: '🔀', name: '셔플',   desc: '보드 전체 섞기',       price: 150, cash: 800,  aim: false },
];

// 부스터 종류별 SVG 아이콘 매핑 (하단 아이템 바)
const BOOSTER_ICON: Record<BoosterKind, IconName> = {
  hammer: 'hammer', bomb: 'bomb', rowClear: 'rowclear',
  colClear: 'colclear', allClear: 'allclear', shuffle: 'shuffle',
};

// 코인 충전 패키지 (시뮬레이션 결제)
const COIN_PACKS: { coins: number; cash: number; bonus?: string }[] = [
  { coins: 1000,  cash: 1100  },
  { coins: 3500,  cash: 3300,  bonus: '+16%' },
  { coins: 12000, cash: 11000, bonus: '+33%' },
];

const ROWS = 7;
const COLS = 7;

const BASE = import.meta.env.BASE_URL;
// 블럭 캐릭터 아이콘 (public/characters/block{n}.png)
const BLK = (n: number) => `${BASE}characters/block${n}.png`;
// 서로 완전히 다른 9색(계열 겹치지 않게) — 최대 구분 팔레트
const TILES = [
  { img: BLK(1), bg: 'linear-gradient(145deg,#FF6B6B,#C1121F)', glow: '#E6194B' }, // 1 빨강
  { img: BLK(2), bg: 'linear-gradient(145deg,#FFB14E,#E36A00)', glow: '#F58231' }, // 2 주황
  { img: BLK(3), bg: 'linear-gradient(145deg,#FFF06B,#E0C200)', glow: '#FFE119' }, // 3 노랑
  { img: BLK(4), bg: 'linear-gradient(145deg,#6FE07A,#2E7D32)', glow: '#3CB44B' }, // 4 초록
  { img: BLK(5), bg: 'linear-gradient(145deg,#7DEAF7,#0097A7)', glow: '#42D4F4' }, // 5 하늘(시안)
  { img: BLK(6), bg: 'linear-gradient(145deg,#6E86F0,#21409A)', glow: '#4363D8' }, // 6 파랑
  { img: BLK(7), bg: 'linear-gradient(145deg,#C06BD6,#6A1B9A)', glow: '#911EB4' }, // 7 보라
  { img: BLK(8), bg: 'linear-gradient(145deg,#FF7BEF,#C026B8)', glow: '#F032E6' }, // 8 자홍(핑크)
  { img: BLK(9), bg: 'linear-gradient(145deg,#C39A6B,#6D4C24)', glow: '#9A6324' }, // 9 갈색
] as const;

// 특수 블럭 종류: 가로 1줄 / 세로 1줄 / 주변 폭탄 / 전체 제거
type TileKind = 'normal' | 'row' | 'col' | 'bomb' | 'rainbow';
const SPECIAL_ICON: Record<string, string> = { row:'↔', col:'↕', bomb:'💣', rainbow:'🌈' };
const SPECIAL_COLOR: Record<string, string> = { row:'#4FC3F7', col:'#7E57C2', bomb:'#FF7043', rainbow:'#EC407A' };
const SPECIAL_LABEL: Record<string, string> = { row:'↔ 가로 한 줄!', col:'↕ 세로 한 줄!', bomb:'💣 폭탄!', rainbow:'🌈 전체 제거!' };

function makeMap(heights: readonly number[]): (0|1)[][] {
  return Array.from({ length: ROWS }, (_, r) =>
    [...heights].map(h => (r >= ROWS - h ? 1 : 0) as 0|1)
  );
}
// 문자열 아트로 자유로운 보드 모양 정의 ('#' = 칸, '.' = 구멍)
function M(rows: readonly string[]): (0|1)[][] {
  return rows.map(row => Array.from(row, ch => (ch === '#' ? 1 : 0) as 0|1));
}

// 다양한 보드 구조 (스테이지별로 모양이 달라짐)
const MAPS = [
  makeMap([7,7,7,7,7,7,7]),                 // 1 가득
  makeMap([4,5,6,7,6,5,4]),                 // 2 언덕
  makeMap([7,6,5,4,5,6,7]),                 // 3 골짜기
  M(['...#...','..###..','.#####.','#######','.#####.','..###..','...#...']), // 4 다이아
  makeMap([7,7,3,2,3,7,7]),                 // 5 협곡
  M(['..###..','..###..','#######','#######','#######','..###..','..###..']), // 6 플러스
  makeMap([3,5,7,7,7,5,3]),                 // 7 돔
  M(['#######','.#####.','..###..','...#...','..###..','.#####.','#######']), // 8 모래시계
  makeMap([7,4,7,4,7,4,7]),                 // 9 빗
  M(['##...##','##...##','##...##','#######','##...##','##...##','##...##']), // 10 H
  makeMap([1,3,5,7,5,3,1]),                 // 11 피라미드
  M(['#######','#######','##...##','##...##','##...##','#######','#######']), // 12 액자
  makeMap([6,3,6,3,6,3,6]),                 // 13 지그재그
  M(['##...##','.##.##.','..###..','...#...','..###..','.##.##.','##...##']), // 14 X자
  M(['.##.##.','#######','#######','#######','.#####.','..###..','...#...']), // 15 하트
] as const;

// 인덱스 기반 시드 난수
function mulberry(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// 스테이지마다 서로 다른 보드 — 기본 모양에 시드 기반 좌우대칭 구멍을 추가해 매번 다르게(난이도도 변동)
function genMap(i: number): (0|1)[][] {
  const base = MAPS[i % MAPS.length].map(row => [...row]) as (0|1)[][];
  const rnd = mulberry((i + 1) * 2654435761);
  const carve = 2 + (i % 4); // 2~5개의 추가 구멍 → 후반/특정 스테이지일수록 보드가 더 까다로움
  for (let n = 0; n < carve; n++) {
    const r = Math.floor(rnd() * ROWS);
    const c = Math.floor(rnd() * Math.ceil(COLS / 2));
    base[r][c] = 0; base[r][COLS - 1 - c] = 0;
  }
  // 각 열에 최소 3칸 보장(플레이 가능하도록)
  for (let c = 0; c < COLS; c++) {
    let cnt = 0; for (let r = 0; r < ROWS; r++) cnt += base[r][c];
    for (let r = ROWS - 1; r >= 0 && cnt < 3; r--) { if (!base[r][c]) { base[r][c] = 1; cnt++; } }
  }
  return base;
}

// 미니맵(월드) 구성 — 최대 500개, 각 월드당 STAGES_PER_WORLD 스테이지
const STAGES_PER_WORLD = 10;
const WORLD_COUNT = 10;
const TOTAL_STAGES = WORLD_COUNT * STAGES_PER_WORLD; // 2,500 스테이지

// 스테이지 설정은 인덱스 기반으로 절차 생성(블럭 종류↑ / 목표 점수↑, 후반은 완만히 증가)
const LEVELS: { mode: 'time' | 'moves'; sec?: number; moves?: number; types: number; goal: readonly [number, number, number] }[] =
  Array.from({ length: TOTAL_STAGES }, (_, i) => {
    const types = 4 + Math.min(5, Math.floor(i / 12));   // 4 → 9
    const moves = 26 + ((i * 7) % 9);                     // 26 ~ 34
    const base  = 400 + Math.min(i, 80) * 110 + Math.floor(i / 80) * 150;
    return { mode: 'moves' as const, moves, types, goal: [base, Math.round(base * 2.2), Math.round(base * 3.4)] as const };
  });

// 스테이지 난이도 등급(블럭 종류 기준 — 표시용)
const difficultyOf = (idx: number): { label: string; stars: number; color: string } => {
  const t = LEVELS[idx]?.types ?? 4;
  if (t <= 4) return { label: '쉬움',   stars: 1, color: '#66BB6A' };
  if (t <= 5) return { label: '보통',   stars: 2, color: '#FFB300' };
  if (t <= 7) return { label: '어려움', stars: 3, color: '#FF7043' };
  return { label: '최고', stars: 4, color: '#EF5350' };
};

// 월드(미니맵) — 최대 500개. 테마(이름/색/이모지)는 순환
const WORLD_NAMES = ['가시숲 마을','솔방울 언덕','반짝 동굴','물방울 호수','노을 사막','서리 골짜기','벚꽃 들판','버섯 숲','별빛 평원','달밤 언덕'];
// 업로드한 미니맵 이미지 (월드별로 순환 적용)
const WORLD_IMAGES = ['w1.png','w2.png','w3.png','w4.png','w5.png','w6.png','w7.png','w8.png','w9.jpg','w10.png','w11.png','w12.png','w13.jpg','w14.png'];
const worldImg = (w: number) => `${import.meta.env.BASE_URL}worlds/${WORLD_IMAGES[w % WORLD_IMAGES.length]}`;
const WORLD_THEMES = [
  { color:'#66BB6A', emoji:'🌳' }, { color:'#FFB300', emoji:'⛰️' }, { color:'#7E57C2', emoji:'💎' },
  { color:'#42A5F5', emoji:'🌊' }, { color:'#FF7043', emoji:'🏜️' }, { color:'#26C6DA', emoji:'❄️' },
  { color:'#EC407A', emoji:'🌸' }, { color:'#AB47BC', emoji:'🍄' }, { color:'#FDD835', emoji:'⭐' }, { color:'#5C6BC0', emoji:'🌙' },
];
const WORLDS: { name: string; from: number; to: number; color: string; emoji: string }[] =
  Array.from({ length: WORLD_COUNT }, (_, w) => {
    const t = WORLD_THEMES[w % WORLD_THEMES.length];
    const cycle = Math.floor(w / WORLD_NAMES.length);
    const name = WORLD_NAMES[w % WORLD_NAMES.length] + (cycle > 0 ? ` ${cycle + 1}` : '');
    return { name, from: w * STAGES_PER_WORLD, to: w * STAGES_PER_WORLD + STAGES_PER_WORLD, color: t.color, emoji: t.emoji };
  });

// 스테이지 첫 클리어(별3) 보상 — 하트 + 부스터 아이템
const BOOSTER_CYCLE = ['hammer', 'bomb', 'shuffle'] as const;
const stageReward = (i: number) => ({ hearts: 1, booster: BOOSTER_CYCLE[i % 3] });
const BOOSTER_EMOJI: Record<string, string> = { hammer:'🔨', bomb:'💣', shuffle:'🔀' };

// 별 등급별 클리어 보상 코인(0/1/2/3별). 기록 갱신 시 전액, 재도전(갱신 없음)은 25%만.
const CLEAR_COINS = [0, 60, 140, 300] as const;
const FIRST_CLEAR_BONUS = 100;

// 이어하기 — 실패 후 이동 횟수 보충 (한 판 최대 3회). 첫 회는 무료(+5수), 이후 코인 차감
const MAX_CONTINUES = 3;
const CONTINUE_COSTS = [0, 300, 600] as const;
const CONTINUE_MOVES = 5;   // 이어하기 시 이동 +5수

// 맵 화면 — 세로로 스크롤되는 지그재그 길 배치
const MAP_X = [50, 76, 50, 24];        // 스테이지 가로 위치(%) 지그재그
const MAP_ROW_GAP = 104;               // 스테이지 간 세로 간격(px)
const mapNodeX = (i: number) => MAP_X[i % MAP_X.length];

const LS_BASE = 'linydory_v3';
const loadProg = (): number[] => {
  const saved = sGet<number[]>(LS_BASE, []);
  return Array.from({ length: LEVELS.length }, (_, i) => saved[i] ?? 0);
};
const saveProg = (p: number[]) => sSet(LS_BASE, p);

const TUT_BASE = 'linydory_tutorial_v1';
const loadTutorialDone = (): boolean => sGet<boolean>(TUT_BASE, false);
const saveTutorialDone = () => sSet(TUT_BASE, true);

// 시작 튜토리얼 단계
const TUTORIAL_STEPS = [
  { kind: 'intro'   as const, title: '리니와 도리의 가시소동!', desc: '같은 고슴도치 친구 블럭 3개 이상을 가로·세로로 맞추면 터져요. 화면을 채운 블럭을 터트려 점수를 모으는 퍼즐 게임이에요.' },
  { kind: 'drag'    as const, title: '① 드래그로 이동', desc: '옮길 블럭을 누른 채 바꾸고 싶은 방향(상하좌우)으로 살짝 끌면 옆 블럭과 자리가 바뀌어요. 탭해서 선택한 뒤 옆 칸을 탭해도 됩니다.' },
  { kind: 'match'   as const, title: '② 3개 맞춰 터트리기', desc: '같은 친구가 가로 또는 세로로 3개 이상 나란히 모이면 펑! 하고 터지고, 위 블럭이 내려와 빈자리를 채워요. 연쇄로 터지면 콤보 보너스!' },
  { kind: 'special' as const, title: '③ 특수 블럭 만들기', desc: '한 번에 4개 = ⚡라이트닝(가로·세로 줄 제거), 5개 이상 = 💣폭탄(주변 3×3 제거)! 2×2 정사각형으로 모아도 특수 블럭이 생겨요.' },
  { kind: 'goal'    as const, title: '④ 목표 점수 달성', desc: '정해진 이동 횟수 안에 목표 점수(⭐⭐⭐)를 넘기면 스테이지 클리어! 별 3개를 모아야 다음 스테이지가 열려요. 망치·폭탄·셔플 아이템도 활용하세요.' },
];

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
        // 2x2 정사각형도 매치로 인정되므로 초기 보드에서 미리 제거
        const sqMatch = r >= 1 && c >= 1 && g[r-1]?.[c]?.t === t && g[r]?.[c-1]?.t === t && g[r-1]?.[c-1]?.t === t;
        if (!hMatch && !vMatch && !sqMatch) break;
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
        if (hasAnyMatch(sw)) return true;
      }
      if (r+1 < ROWS && g[r+1]?.[c]) {
        const sw: Grid = g.map(row => [...row]);
        [sw[r][c], sw[r+1][c]] = [sw[r+1][c], sw[r][c]];
        if (hasAnyMatch(sw)) return true;
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
        if (hasAnyMatch(sw)) return [[r,c],[r,c+1]];
      }
      if (r+1 < ROWS && g[r+1]?.[c]) {
        const sw: Grid = g.map(row => [...row]);
        [sw[r][c], sw[r+1][c]] = [sw[r+1][c], sw[r][c]];
        if (hasAnyMatch(sw)) return [[r,c],[r+1,c]];
      }
    }
  }
  return null;
}

// 같은 종류의 일반 블럭인지 비교
const sameTile = (a: GridCell, b: GridCell): boolean =>
  !!a && !!b && a.kind === 'normal' && b.kind === 'normal' && a.t === b.t;

// 매치(터질) 대상 칸 마스크 — 가로/세로 직선 3개 이상 + 2x2 정사각형 포함
function findMatchedMask(g: Grid): boolean[][] {
  const mask: boolean[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
  // 가로 직선 3개 이상
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS;) {
      const cell = g[r][c];
      if (!cell || cell.kind !== 'normal') { c++; continue; }
      let e = c;
      while (e+1 < COLS && sameTile(g[r][e+1], cell)) e++;
      if (e-c >= 2) for (let i = c; i <= e; i++) mask[r][i] = true;
      c = e + 1;
    }
  }
  // 세로 직선 3개 이상
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS;) {
      const cell = g[r][c];
      if (!cell || cell.kind !== 'normal') { r++; continue; }
      let e = r;
      while (e+1 < ROWS && sameTile(g[e+1][c], cell)) e++;
      if (e-r >= 2) for (let i = r; i <= e; i++) mask[i][c] = true;
      r = e + 1;
    }
  }
  // 2x2 정사각형 (직선 3개가 아니어도 매치로 인정)
  for (let r = 0; r < ROWS-1; r++) {
    for (let c = 0; c < COLS-1; c++) {
      const a = g[r][c];
      if (!a || a.kind !== 'normal') continue;
      if (sameTile(a, g[r][c+1]) && sameTile(a, g[r+1][c]) && sameTile(a, g[r+1][c+1])) {
        mask[r][c] = mask[r][c+1] = mask[r+1][c] = mask[r+1][c+1] = true;
      }
    }
  }
  return mask;
}

// 매치가 하나라도 존재하는지
function hasAnyMatch(g: Grid): boolean {
  const mask = findMatchedMask(g);
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (mask[r][c]) return true;
  return false;
}

// 터질(hit) 표시가 남아있는 칸이 있는지
function anyHit(g: Grid): boolean {
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (g[r]?.[c]?.hit) return true;
  return false;
}

function expandSpecials(hits: Set<string>, g: Grid) {
  let changed = true;
  while (changed) {
    changed = false;
    [...hits].forEach(key => {
      const [r, c] = key.split(',').map(Number);
      const cell = g[r]?.[c];
      if (!cell) return;
      if (cell.kind === 'row') {            // 가로 한 줄 제거
        for (let x=0; x<COLS; x++) if (g[r]?.[x]) { const k=`${r},${x}`; if (!hits.has(k)) { hits.add(k); changed=true; } }
      } else if (cell.kind === 'col') {     // 세로 한 줄 제거
        for (let x=0; x<ROWS; x++) if (g[x]?.[c]) { const k=`${x},${c}`; if (!hits.has(k)) { hits.add(k); changed=true; } }
      } else if (cell.kind === 'bomb') {    // 주변 3×3 제거
        for (let dr=-1; dr<=1; dr++) for (let dc=-1; dc<=1; dc++) {
          const nr=r+dr, nc=c+dc;
          if (nr>=0&&nr<ROWS&&nc>=0&&nc<COLS&&g[nr]?.[nc]) { const k=`${nr},${nc}`; if (!hits.has(k)) { hits.add(k); changed=true; } }
        }
      } else if (cell.kind === 'rainbow') { // 전체 제거
        for (let y=0; y<ROWS; y++) for (let x=0; x<COLS; x++) if (g[y]?.[x]) { const k=`${y},${x}`; if (!hits.has(k)) { hits.add(k); changed=true; } }
      }
    });
  }
}

function buildCycle(g: Grid, mkSpecials: boolean, swapTo?: [number,number]): { hits: Set<string>; newSpec: Map<string,Cell>; nextG: Grid } | null {
  const mask = findMatchedMask(g);
  const hits = new Set<string>();
  const newSpec = new Map<string,Cell>();
  // 매치된 칸들을 같은 종류끼리 연결 묶음(flood fill)으로 그룹화
  // → 직선·ㄱ/ㅗ자·2x2 정사각형 모두 하나의 묶음으로 처리되고, 4개 이상이면 특수 블럭 생성
  const visited: boolean[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
  let found = false;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (!mask[r][c] || visited[r][c]) continue;
    const t = g[r][c]!.t;
    const comp: [number,number][] = [];
    const stack: [number,number][] = [[r,c]];
    visited[r][c] = true;
    while (stack.length) {
      const [cr,cc] = stack.pop()!;
      comp.push([cr,cc]);
      for (const [dr,dc] of [[-1,0],[1,0],[0,-1],[0,1]] as const) {
        const nr=cr+dr, nc=cc+dc;
        if (nr<0||nr>=ROWS||nc<0||nc>=COLS) continue;
        if (visited[nr][nc] || !mask[nr][nc] || g[nr][nc]?.t !== t) continue;
        visited[nr][nc] = true;
        stack.push([nr,nc]);
      }
    }
    found = true;
    comp.forEach(([cr,cc]) => hits.add(`${cr},${cc}`));
    const len = comp.length;
    if (!mkSpecials || len < 4) continue;
    let pos: [number,number] | undefined;
    if (swapTo) pos = comp.find(([cr,cc]) => cr===swapTo[0] && cc===swapTo[1]);
    pos = pos ?? comp[Math.floor(len/2)];
    const [tr,tc] = pos; const key = `${tr},${tc}`;
    hits.delete(key);
    const cell = g[tr][tc];
    // 터트린 블럭 수/모양에 따라 특수 블럭 종류 결정
    //  4개 직선 → 가로/세로 한 줄, 4개 정사각형/5개 → 폭탄, 6개 이상 → 전체 제거
    let kind: TileKind;
    if (len >= 6) kind = 'rainbow';
    else if (len === 5) kind = 'bomb';
    else { // len 4
      const oneRow = comp.every(([cr]) => cr === comp[0][0]);
      const oneCol = comp.every(([,cc]) => cc === comp[0][1]);
      kind = oneRow ? 'row' : oneCol ? 'col' : 'bomb';
    }
    if (cell) newSpec.set(key, mk(cell.t, kind));
  }
  if (!found) return null;
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
  @keyframes popOut {
    0%   { transform:scale(1) rotate(0deg);    opacity:1; filter:brightness(1); }
    25%  { transform:scale(1.35) rotate(8deg); opacity:1; filter:brightness(1.6); }
    55%  { transform:scale(0.9) rotate(-6deg); opacity:0.75; filter:blur(1px); }
    100% { transform:scale(0.2) rotate(-16deg); opacity:0; filter:blur(3px); }
  }
  @keyframes dustFly {
    0%   { opacity:1; transform:translate(-50%,-50%) scale(1.1); }
    100% { opacity:0; transform:translate(calc(-50% + var(--dx)), calc(-50% + var(--dy))) scale(0.3); }
  }
  @keyframes lightDive {
    0%   { opacity:0; transform:translate(-50%,-340px) scale(0.6) rotate(0deg); }
    25%  { opacity:1; }
    100% { opacity:1; transform:translate(-50%,-50%) scale(1.2) rotate(360deg); }
  }
  @keyframes popFlash {
    0%   { transform:scale(0.5); opacity:0.95; }
    100% { transform:scale(2.4); opacity:0; }
  }
  @keyframes sparkConverge {
    0%   { opacity:0; transform:translate(-50%,-50%) scale(2.6) rotate(-30deg); }
    45%  { opacity:1; transform:translate(-50%,-50%) scale(1.1) rotate(0deg); }
    100% { opacity:0; transform:translate(-50%,-50%) scale(0.5) rotate(20deg); }
  }
  @keyframes shardFly {
    0%   { transform:translate(0,0) scale(1); opacity:1; }
    100% { transform:translate(var(--sx), var(--sy)) scale(0.3); opacity:0; }
  }
  @keyframes tileShake {
    0%,100% { transform:translateX(0); }
    25%      { transform:translateX(-5px); }
    75%      { transform:translateX(5px); }
  }
  @keyframes flameBurst {
    0%   { opacity:0;   transform:translate(-50%,-40%) scale(0.4) rotate(-8deg); }
    25%  { opacity:1;   transform:translate(-50%,-58%) scale(1.35) rotate(6deg); }
    60%  { opacity:0.9; transform:translate(-50%,-86%) scale(1.05) rotate(-5deg); }
    100% { opacity:0;   transform:translate(-50%,-120%) scale(0.7) rotate(4deg); }
  }
  @keyframes screenShake {
    0%,100% { transform:translate(0,0); }
    20%     { transform:translate(-5px,3px); }
    40%     { transform:translate(5px,-3px); }
    60%     { transform:translate(-4px,-2px); }
    80%     { transform:translate(4px,2px); }
  }
  @keyframes confettiFall {
    0%   { transform:translateY(-30px) rotate(0deg);   opacity:1; }
    100% { transform:translateY(420px) rotate(620deg); opacity:0; }
  }
  @keyframes lifeFlyAway {
    0%   { opacity:1; transform:translate(0,0) scale(1) rotate(0deg); }
    25%  { opacity:1; transform:translate(2px,-8px) scale(1.6) rotate(8deg); }
    100% { opacity:0; transform:translate(40vw,-30px) scale(0.5) rotate(40deg); }
  }
  @keyframes lifeChipPulse {
    0%,100% { transform:scale(1); }
    30%      { transform:scale(1.18); box-shadow:0 0 14px rgba(255,90,130,0.9); }
  }
  @keyframes lifeMinusUp {
    0%   { opacity:0; transform:translateY(0) scale(0.8); }
    25%  { opacity:1; transform:translateY(-6px) scale(1.1); }
    100% { opacity:0; transform:translateY(-34px) scale(1); }
  }
`;

export default function LinyDoryGame() {
  const [phase, setPhase]         = useState<Phase>(import.meta.env.DEV ? 'main' : 'splash');
  const [loadPct, setLoadPct]     = useState(0);
  const [lvlIdx, setLvlIdx]       = useState(0);
  const [progress, setProgress]   = useState<number[]>(loadProg);
  const [grid, setGrid]           = useState<Grid>(() => mkGrid(LEVELS[0].types, genMap(0)));
  const [sel, setSel]             = useState<[number,number]|null>(null);
  const [score, setScore]         = useState(0);
  const [time, setTime]           = useState(60);
  const [movesLeft, setMovesLeft] = useState(0);
  const [popup, setPopup]         = useState<string|null>(null);
  const [popKind, setPopKind]     = useState<'combo'|'special'>('combo');
  const [flames, setFlames]       = useState<{id:number;r:number;c:number}[]>([]);
  const [sparks, setSparks]       = useState<{id:number;r:number;c:number}[]>([]);
  const [dust, setDust]           = useState<{id:number;r:number;c:number;dx:number;dy:number;color:string}[]>([]);
  const [lights, setLights]       = useState<{id:number;r:number;c:number}[]>([]);
  const [selectedWorld, setSelectedWorld] = useState(0);
  const [blocksPopped, setBlocksPopped] = useState(0);
  const [screenShake, setScreenShake] = useState(false);
  const [confetti, setConfetti]   = useState<{id:number;left:number;delay:number;color:string;e:string}[]>([]);
  const [coinsEarned, setCoinsEarned] = useState(0);
  const [muted, setMutedState]    = useState(isMuted());
  const [floats, setFloats]       = useState<{id:number;text:string}[]>([]);
  const [hintPair, setHintPair]   = useState<[[number,number],[number,number]]|null>(null);
  const [isLucky,  setIsLucky]    = useState(false);
  const [nearMiss, setNearMiss]   = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [tutStep, setTutStep]     = useState(0);
  const [tutorialPlay, setTutorialPlay] = useState(false); // 실제 플레이 가이드 진행 중
  const [tutMatches, setTutMatches] = useState(0);
  const [timeLeft, setTimeLeft]   = useState(60); // 제한 시간(초) — 60에서 카운트다운
  const [lifeFly, setLifeFly]     = useState(false); // 하트 소모 시 날아가는 임팩트
  const [lifeLossToast, setLifeLossToast] = useState(false); // 스테이지 시작 시 하트 감소 강조(3초)
  const STAGE_TIME = 60;
  const [continueOffer, setContinueOffer] = useState(false);
  const [continuesUsed, setContinuesUsed] = useState(0);
  const [coins,    setCoins]      = useState(loadCoins);
  const [lives,    setLives]      = useState(loadLives);
  const [lifeTimer, setLifeTimer] = useState(0); // 다음 하트 충전까지(초)
  const [quests,   setQuests]     = useState<QuestSave>(loadQuests);
  const [showQuests, setShowQuests] = useState(false);
  const [boosters,    setBoosters]    = useState(loadBoosters);
  const [boosterMode, setBoosterMode] = useState<BoosterKind|null>(null);
  const [showPause,   setShowPause]   = useState(false);
  const [showShop,    setShowShop]    = useState(false);
  const [showSettings,setShowSettings]= useState(false);
  const [shopTab,     setShopTab]     = useState<'coin'|'cash'>('coin');
  const [cart,        setCart]        = useState<Record<BoosterKind,number>>({hammer:0,bomb:0,shuffle:0,rowClear:0,colClear:0,allClear:0});
  const [pay,         setPay]         = useState<{label:string;cash:number;onDone:()=>void}|null>(null);
  const [payStage,    setPayStage]    = useState<'confirm'|'processing'|'done'>('confirm');
  const [account,     setAccount]     = useState<string>(getScope());

  const gRef     = useRef<Grid>(grid);
  const scoreRef = useRef(0);
  const lvlRef   = useRef(0);
  const movesRef = useRef(0);
  const mapRef   = useRef<readonly (0|1)[][]>(genMap(0));
  const popT     = useRef<ReturnType<typeof setTimeout>|null>(null);
  const hintTmr  = useRef<ReturnType<typeof setTimeout>|null>(null);
  const luckyRef = useRef(false);
  const luckyTmr = useRef<ReturnType<typeof setTimeout>|null>(null);
  // 연쇄 처리는 단일 리졸버가 항상 최신 보드(gRef)를 읽어 진행 — 입력은 잠그지 않음
  const resolvingRef = useRef(false);        // 리졸버 중복 실행 방지
  const dirtyRef     = useRef(false);        // 애니메이션 도중 새 스왑이 커밋되면 표시
  const comboRef     = useRef(0);            // 리졸버 세션 동안 누적 콤보
  const lastSwapRef  = useRef<[number,number]|null>(null); // 특수 블럭 생성 위치 보정
  const phaseRef     = useRef<Phase>(phase);
  const boostersRef  = useRef(boosters);
  const dragRef      = useRef<{r:number;c:number;x:number;y:number;moved:boolean}|null>(null);
  const continuesUsedRef   = useRef(0);  // 이번 판 이어하기 사용 횟수
  const pausedRef          = useRef(false); // 이어하기 제안 중 입력/타이머 정지
  const sessionBlocksRef   = useRef(0);  // 퀘스트 집계: 이번 판 터트린 블럭
  const sessionSpecialsRef = useRef(0);  // 퀘스트 집계: 이번 판 만든 특수 블럭
  const tutorialPlayRef    = useRef(false); // 가이드 플레이 중 여부(리졸버에서 참조)
  const tutMatchesRef      = useRef(0);
  const TUT_GOAL_MATCHES   = 5;
  const mapScrollRef       = useRef<HTMLDivElement>(null); // 맵 스크롤 컨테이너

  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { boostersRef.current = boosters; }, [boosters]);
  // 스테이지 선택 진입 시 현재 도전 스테이지가 보이도록 스크롤
  useEffect(() => {
    if (phase === 'map' && mapScrollRef.current) {
      const idx = progress.findIndex(s => s < 3);
      const cur = idx === -1 ? LEVELS.length - 1 : idx;
      const w = WORLDS[selectedWorld];
      const local = Math.max(0, Math.min(w.to - w.from - 1, cur - w.from));
      mapScrollRef.current.scrollTop = Math.max(0, local * MAP_ROW_GAP + 60 - 220);
    }
  }, [phase, progress, selectedWorld]);

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

  // 큰 콤보/폭발 시 화면 흔들림(타격감)
  const shakeTmr = useRef<ReturnType<typeof setTimeout>|null>(null);
  const kickScreen = useCallback(() => {
    setScreenShake(true);
    if (shakeTmr.current) clearTimeout(shakeTmr.current);
    shakeTmr.current = setTimeout(() => setScreenShake(false), 320);
  }, []);

  // 폭탄·아이템으로 블럭이 터질 때 해당 칸에 불길(🔥) 효과를 잠깐 띄운다
  const spawnFlames = useCallback((keys: Iterable<string>) => {
    const arr = [...keys].map(k => { const [r,c]=k.split(',').map(Number); return { id: ++_fid, r, c }; });
    if (!arr.length) return;
    setFlames(p => [...p.slice(-40), ...arr]);
    const ids = new Set(arr.map(a => a.id));
    setTimeout(() => setFlames(p => p.filter(f => !ids.has(f.id))), 600);
  }, []);

  // 빛이 블럭으로 모여드는 스파클 효과(보너스 연출용)
  const spawnSparks = useCallback((keys: Iterable<string>) => {
    const arr = [...keys].map(k => { const [r,c]=k.split(',').map(Number); return { id: ++_fid, r, c }; });
    if (!arr.length) return;
    setSparks(p => [...p.slice(-30), ...arr]);
    const ids = new Set(arr.map(a => a.id));
    setTimeout(() => setSparks(p => p.filter(f => !ids.has(f.id))), 450);
  }, []);

  // 블럭이 가루가 되어 퍼지는 먼지 파티클 (천천히 보이게)
  const spawnDust = useCallback((keys: string[], g: Grid) => {
    const parts: {id:number;r:number;c:number;dx:number;dy:number;color:string}[] = [];
    for (const k of keys.slice(0, 28)) {
      const [r,c] = k.split(',').map(Number);
      const cell = g[r]?.[c]; if (!cell) continue;
      const color = cell.kind === 'normal' ? (TILES[cell.t]?.glow ?? '#fff') : (SPECIAL_COLOR[cell.kind] ?? '#fff');
      for (let p = 0; p < 4; p++) {
        const ang = Math.random() * Math.PI * 2, dist = 16 + Math.random() * 40;
        parts.push({ id: ++_fid, r, c, dx: Math.cos(ang)*dist, dy: Math.sin(ang)*dist - 8, color });
      }
    }
    if (!parts.length) return;
    setDust(p => [...p.slice(-120), ...parts]);
    const ids = new Set(parts.map(a => a.id));
    setTimeout(() => setDust(p => p.filter(f => !ids.has(f.id))), 1400);
  }, []);

  // 클리어 피날레 — 빛이 위에서 블럭으로 날아오는 효과
  const spawnLights = useCallback((keys: Iterable<string>) => {
    const arr = [...keys].map(k => { const [r,c]=k.split(',').map(Number); return { id: ++_fid, r, c }; });
    if (!arr.length) return;
    setLights(p => [...p.slice(-20), ...arr]);
    const ids = new Set(arr.map(a => a.id));
    setTimeout(() => setLights(p => p.filter(f => !ids.has(f.id))), 520);
  }, []);

  useEffect(() => {
    const refresh = () => setCoins(loadCoins());
    window.addEventListener('coins-updated', refresh);
    return () => window.removeEventListener('coins-updated', refresh);
  }, []);

  // 하트 갱신(이벤트) + 자동 충전 카운트다운(1초마다)
  useEffect(() => {
    const refresh = () => { setLives(loadLives()); setLifeTimer(Math.ceil(nextLifeMs()/1000)); };
    refresh();
    window.addEventListener('lives-updated', refresh);
    const id = setInterval(refresh, 1000);
    return () => { window.removeEventListener('lives-updated', refresh); clearInterval(id); };
  }, []);

  // 게임 BGM: 메인/맵/플레이 중 재생, 스플래시·종료 화면에선 정지
  useEffect(() => {
    const playing = phase === 'main' || phase === 'map' || phase === 'play';
    if (playing && !muted) startBgm();
    else stopBgm();
    return () => stopBgm();
  }, [phase, muted]);

  // 오디오 잠금 해제(첫 제스처) — 게임 중이면 BGM 시작
  useEffect(() => {
    const unlock = () => { primeAudio(); const p = phaseRef.current; if ((p === 'main' || p === 'map' || p === 'play') && !isMuted()) startBgm(); };
    window.addEventListener('pointerdown', unlock);
    return () => window.removeEventListener('pointerdown', unlock);
  }, []);

  // 로그인(계정 전환)으로 스코프가 바뀌면 계정별 저장 데이터를 다시 불러옴
  useEffect(() => {
    const onScope = () => {
      setAccount(getScope());
      setProgress(loadProg());
      setCoins(loadCoins());
      setBoosters(loadBoosters());
      setLives(loadLives());
      setQuests(loadQuests());
    };
    window.addEventListener('scope-changed', onScope);
    return () => window.removeEventListener('scope-changed', onScope);
  }, []);

  // 처음 메인 화면에 도착하면(아직 안 봤다면) 튜토리얼 표시
  useEffect(() => {
    if (phase === 'main' && !loadTutorialDone()) { setTutStep(0); setShowTutorial(true); }
  }, [phase]);

  const closeTutorial = useCallback(() => { saveTutorialDone(); setShowTutorial(false); }, []);

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
    setShowPause(false);
    if (luckyTmr.current) clearTimeout(luckyTmr.current);
    luckyRef.current = false; setIsLucky(false);
    const li = lvlRef.current;
    const s = calcStars(scoreRef.current, LEVELS[li].goal);
    const goal0 = LEVELS[li].goal[0];
    setNearMiss(s === 0 && scoreRef.current >= goal0 * 0.72 && scoreRef.current < goal0);
    // 일일 퀘스트 집계 반영
    questAddBlocks(sessionBlocksRef.current);     sessionBlocksRef.current = 0;
    questAddSpecials(sessionSpecialsRef.current); sessionSpecialsRef.current = 0;
    if (s >= 3) questAddGameCleared();
    setQuests(loadQuests());
    // 클리어 보상 코인 — 기록 갱신이면 전액, 재도전이면 25%
    const prevStars = progress[li] ?? 0;
    let earned: number = CLEAR_COINS[s];
    if (s > 0 && s <= prevStars) earned = Math.floor(earned * 0.25);
    if (s > 0 && prevStars === 0) earned += FIRST_CLEAR_BONUS;
    setCoinsEarned(earned);
    if (earned > 0) { addCoins(earned); setTimeout(() => sfx.coin(), 500); }
    // 첫 별3 클리어 보상: 하트 + 부스터 아이템
    if (s >= 3 && prevStars < 3) {
      const rw = stageReward(li);
      addLives(rw.hearts); setLives(loadLives());
      setBoosters(prev => { const next={...prev, [rw.booster]: prev[rw.booster]+1}; saveBoosters(next); return next; });
    }
    // 승리/패배 사운드 & 색종이
    if (s > 0) {
      sfx.win(); buzz(40);
      // 별이 하나씩 켜질 때마다 '딩' 소리
      for (let i = 0; i < s; i++) setTimeout(() => { sfx.ding(i); buzz(18); }, 350 + i * 450);
      const palette = ['#FFD700','#FF6F00','#42A5F5','#66BB6A','#E040FB','#FF5252'];
      setConfetti(Array.from({ length: 26 }, (_, i) => ({
        id: i, left: Math.random()*100, delay: Math.random()*0.5,
        color: palette[i % palette.length], e: ['🎉','✨','⭐','🎊'][i % 4],
      })));
    } else { sfx.lose(); setConfetti([]); }
    setProgress(prev => { const next=[...prev]; if (s>next[li]) next[li]=s; saveProg(next); return next; });
    setPhase('end');
  }, [clearHint, progress]);

  // 클리어 피날레 — 남은 이동 횟수가 빛처럼 날아와 블럭을 터트려 점수에 합산
  const runFinale = useCallback(async () => {
    resolvingRef.current = true;
    pausedRef.current = true;   // 목표 달성 — 타이머 멈춤

    const leftover = Math.max(0, movesRef.current);
    movesRef.current = 0; setMovesLeft(0);
    let bonus = Math.min(leftover, 20);
    if (leftover > 0) { pop(`🎉 남은 ${leftover}수 보너스!`, 'special'); sfx.special(); }
    while (bonus > 0 && phaseRef.current === 'play') {
      const g = gRef.current;
      const cells: [number,number][] = [];
      for (let r=0;r<ROWS;r++) for (let c=0;c<COLS;c++) { const cc=g[r][c]; if (cc && !cc.hit) cells.push([r,c]); }
      if (!cells.length) break;
      const [r,c] = cells[Math.floor(Math.random()*cells.length)];
      spawnLights([`${r},${c}`]); spawnSparks([`${r},${c}`]); // 빛이 위에서 블럭으로 날아옴
      sfx.swap();
      await wait(180);
      const ng = g.map(row => row.map(x => x ? {...x} : null));
      if (ng[r][c]) ng[r][c]!.hit = true;
      push(ng); inc(300); sfx.pop(4); spawnDust([`${r},${c}`], g); buzz(8);  // 가루 터짐(#1과 동일)
      bonus--;
      await wait(120);
    }
    await wait(300);
    resolvingRef.current = false;
    endGame();
  }, [push, inc, pop, endGame, spawnDust, spawnLights, spawnSparks]);

  // 시간/이동이 다 떨어졌을 때 — 이어하기 제안 가능하면 일시정지하고 제안, 아니면 종료
  const outOfResource = useCallback(() => {
    if (continuesUsedRef.current < MAX_CONTINUES) {
      pausedRef.current = true;
      setContinueOffer(true);
    } else {
      endGame();
    }
  }, [endGame]);

  // 이어하기 수락 — 코인 차감 후 시간/이동 보충하고 재개
  const acceptContinue = useCallback(() => {
    const cost = CONTINUE_COSTS[continuesUsedRef.current];
    if (cost > 0 && !spendCoins(cost)) { pop('🪙 코인이 부족해요!', 'special'); setShowShop(true); return; }
    if (cost > 0) setCoins(loadCoins());
    continuesUsedRef.current++; setContinuesUsed(c => c+1);
    // 이동 +5수 보충 (+ 시간도 함께 회복해 재개 가능하도록)
    movesRef.current += CONTINUE_MOVES; setMovesLeft(movesRef.current);
    setTimeLeft(t => Math.max(t, 30));
    setContinueOffer(false);
    pausedRef.current = false;
    sfx.coin(); pop(`▶ 이동 +${CONTINUE_MOVES}! 이어서 도전!`, 'special');
    scheduleHint();
  }, [pop, scheduleHint]);

  const declineContinue = useCallback(() => {
    setContinueOffer(false);
    pausedRef.current = false;
    endGame();
  }, [endGame]);

  // 제한 시간 — 진행 중(일시정지 아님)일 때 60초에서 1초씩 감소, 0이 되면 종료/이어하기 제안
  useEffect(() => {
    if (phase !== 'play') return;
    const id = setInterval(() => {
      if (pausedRef.current) return;            // 이어하기 제안 중엔 멈춤
      setTimeLeft(t => { if (t<=1) { outOfResource(); return 0; } return t-1; });
    }, 1000);
    return () => clearInterval(id);
  }, [phase, outOfResource]);

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
    const map = genMap(idx);
    mapRef.current = map;
    _uid = 0;
    const g = mkGrid(lvl.types, map);
    gRef.current=g; scoreRef.current=0; lvlRef.current=idx;
    resolvingRef.current=false; dirtyRef.current=false; comboRef.current=0;
    lastSwapRef.current=null; dragRef.current=null;
    continuesUsedRef.current=0; pausedRef.current=false;
    sessionBlocksRef.current=0; sessionSpecialsRef.current=0;
    tutorialPlayRef.current=false; setTutorialPlay(false); setTutMatches(0); tutMatchesRef.current=0;
    setTimeLeft(STAGE_TIME);
    setFlames([]); setSparks([]); setDust([]); setLights([]); setScreenShake(false); setConfetti([]); setCoinsEarned(0);
    setContinuesUsed(0); setContinueOffer(false); setBlocksPopped(0);
    primeAudio();
    const mv = (lvl as {moves?:number}).moves ?? 0; movesRef.current=mv;
    setLvlIdx(idx); setGrid(g); setScore(0); setTime((lvl as {sec?:number}).sec ?? 0);
    setMovesLeft(mv); setSel(null); setPopup(null); setFloats([]);
    setNearMiss(false); setIsLucky(false); luckyRef.current = false;
    setBoosterMode(null); setShowPause(false);
    setPhase('play');
    if (hintTmr.current) clearTimeout(hintTmr.current);
    setHintPair(null);
    hintTmr.current = setTimeout(() => setHintPair(findHint(gRef.current)), 2500);
  }, []);

  // 튜토리얼을 실제 플레이로 진행 — 1스테이지를 하트 소모 없이 시작하고 코칭 오버레이 표시
  const startTutorialPlay = useCallback(() => {
    saveTutorialDone();
    setShowTutorial(false);
    setTutMatches(0); tutMatchesRef.current = 0;
    startLevel(0);
    tutorialPlayRef.current = true; setTutorialPlay(true);
    setTimeout(() => setHintPair(findHint(gRef.current)), 700); // 곧바로 힌트(반짝임) 표시
  }, [startLevel]);

  // 하트 1개를 소모하고 스테이지 시작 (하트 없으면 상점 안내)
  const tryStartLevel = useCallback((idx: number) => {
    if (!spendLife()) {
      setLives(loadLives());
      pop('💔 하트가 부족해요! 충전을 기다리거나 상점에서 받으세요', 'special');
      setShowShop(true);
      return;
    }
    setLives(loadLives());        // 좌측 상단 하트 숫자 즉시 감소
    setLifeFly(true);             // 하트가 날아가는 임팩트
    setLifeLossToast(true);       // 하트 감소 강조(플레이 화면에서 3초)
    buzz(18);
    setTimeout(() => { setLifeFly(false); startLevel(idx); }, 480);
    setTimeout(() => setLifeLossToast(false), 3000);
  }, [startLevel, pop]);

  // 연쇄 리졸버 — 항상 최신 보드(gRef)를 읽어 매치를 해소한다.
  // 입력을 잠그지 않으므로 블럭이 터지는 동안에도 새 스왑/부스터가 커밋되면 같은 세션에서 함께 처리된다.
  const resolve = useCallback(async () => {
    if (resolvingRef.current) return;
    resolvingRef.current = true;
    try {
      while (phaseRef.current === 'play') {
        dirtyRef.current = false;
        // 매치가 남아있는 동안 반복(매 반복마다 gRef를 새로 읽어 도중 들어온 스왑도 반영)
        while (phaseRef.current === 'play') {
          const g = gRef.current;
          // 부스터/특수블럭 발동으로 미리 표시된 칸은 먼저 터뜨려 떨어뜨린다(매치 판정 전)
          if (anyHit(g)) {
            await wait(450);
            push(applyFall(gRef.current, LEVELS[lvlRef.current].types, mapRef.current));
            await wait(200);
            continue;
          }
          const swp = lastSwapRef.current; lastSwapRef.current = null;
          const res = buildCycle(g, true, swp ?? undefined);
          if (!res) break;
          comboRef.current++;
          const combo = comboRef.current;
          push(res.nextG);
          spawnDust([...res.hits], g);   // 가루가 되어 퍼지는 효과
          setBlocksPopped(n => n + res.hits.size);
          sessionBlocksRef.current += res.hits.size;
          sessionSpecialsRef.current += res.newSpec.size;
          // 폭탄/전체 제거가 터지면 불길 효과 + 화면 흔들림
          const bigHit = [...res.hits].some(k => { const [r,c]=k.split(',').map(Number); const kd=g[r][c]?.kind; return kd==='bomb'||kd==='rainbow'; });
          if (bigHit) { spawnFlames(res.hits); kickScreen(); sfx.explode(); }
          const spHits = [...res.hits].filter(k => { const [r,c]=k.split(',').map(Number); return g[r][c]?.kind!=='normal'; }).length;
          const pts = res.hits.size*100*combo + spHits*200;
          inc(pts);
          // 목표 점수(별3) 도달 시 타이머 멈춤
          if (scoreRef.current >= LEVELS[lvlRef.current].goal[2]) pausedRef.current = true;
          // 사운드/햅틱
          sfx.pop(combo); buzz(combo >= 4 ? 22 : 9);
          if (combo >= 4) kickScreen();
          if (res.newSpec.size > 0) {
            const k = [...res.newSpec.values()][0].kind;
            sfx.special();
            pop(`${SPECIAL_ICON[k] ?? '✨'} 특수 블럭 생성!`, 'special');
          } else if (combo >= 2) {
            sfx.combo(combo);
            pop(`${combo}x COMBO! +${pts.toLocaleString()}`, 'combo');
            if (combo >= 5) questUpdateMaxCombo(combo);
          }
          // 가이드 플레이: 플레이어가 직접 만든 매치 수 카운트 → 목표 달성 시 튜토리얼 종료
          if (tutorialPlayRef.current && combo === 1) {
            tutMatchesRef.current++;
            setTutMatches(tutMatchesRef.current);
            if (tutMatchesRef.current >= TUT_GOAL_MATCHES) {
              tutorialPlayRef.current = false; setTutorialPlay(false);
              pop('🎉 튜토리얼 완료! 이제 자유롭게 즐겨보세요', 'special');
            }
          }
          await wait(450);
          push(applyFall(gRef.current, LEVELS[lvlRef.current].types, mapRef.current));
          await wait(200);
        }
        // 막힌 보드면 셔플(완전히 정착된 뒤에만)
        let reshuffles = 0;
        while (phaseRef.current === 'play' && !hasMoves(gRef.current) && reshuffles++ < 3) {
          pop('🔀 셔플!', 'special');
          await wait(700);
          push(mkGrid(LEVELS[lvlRef.current].types, mapRef.current));
        }
        if (!dirtyRef.current) break; // 애니메이션 도중 새 입력이 없었으면 종료
      }
    } finally {
      comboRef.current = 0;
      resolvingRef.current = false;
    }
    if (phaseRef.current === 'play') {
      // 별 3개(목표 점수) 달성 → 즉시 스테이지 클리어
      if (scoreRef.current >= LEVELS[lvlRef.current].goal[2]) {
        if (!tutorialPlayRef.current && movesRef.current > 0) { runFinale(); return; }
        endGame(); return;
      }
      if (LEVELS[lvlRef.current].mode === 'moves' && movesRef.current <= 0) { outOfResource(); return; }
      scheduleHint();
    }
  }, [push, inc, pop, endGame, outOfResource, scheduleHint, spawnFlames, kickScreen, runFinale, spawnDust]);

  // 두 칸 교환 시도 — 유효하면 즉시 커밋하고 리졸버를 가동(입력 잠금 없음)
  const trySwap = useCallback((sr: number, sc: number, r: number, c: number) => {
    if (phaseRef.current !== 'play' || pausedRef.current) return;
    if (Math.abs(sr-r)+Math.abs(sc-c) !== 1) return;
    const g = gRef.current;
    const a = g[sr]?.[sc], b = g[r]?.[c];
    if (!a || !b || a.hit || b.hit) return; // 터지는 중인 칸은 이동 불가
    const sw: Grid = g.map(row => row.map(x => x ? {...x} : null));
    [sw[sr][sc], sw[r][c]] = [sw[r][c], sw[sr][sc]];
    const srcSpec = sw[r][c]?.kind !== 'normal';
    const dstSpec = sw[sr][sc]?.kind !== 'normal';
    const miss = !hasAnyMatch(sw) && !srcSpec && !dstSpec;
    clearHint();
    // 매치도 없고 특수 블럭도 아니면 → 잠깐 바꿨다가 제자리로 원위치 (헛스왑은 이동 차감 안 함)
    if (miss) {
      sfx.invalid();
      push(sw);
      setTimeout(() => { if (gRef.current === sw) push(g); }, 220);
      return;
    }
    // 유효한 스왑(매치/특수 발동)만 이동 1회 소모
    if (LEVELS[lvlRef.current].mode === 'moves') {
      movesRef.current = Math.max(0, movesRef.current-1);
      setMovesLeft(movesRef.current);
    }
    sfx.swap(); buzz(8);
    // 특수 블럭이 관여하면 매치 여부와 무관하게 항상 즉시 발동
    if (srcSpec || dstSpec) {
      const hits = new Set<string>();
      if (srcSpec) hits.add(`${r},${c}`);
      if (dstSpec) hits.add(`${sr},${sc}`);
      expandSpecials(hits, sw);
      hits.forEach(key => { const [rr,cc]=key.split(',').map(Number); const cell=sw[rr][cc]; if(cell) cell.hit=true; });
      inc(hits.size*120);
      setBlocksPopped(n => n + hits.size); sessionBlocksRef.current += hits.size;
      spawnFlames(hits); spawnDust([...hits], sw); kickScreen(); sfx.explode(); buzz(25);
      const dk = (srcSpec ? sw[r][c]?.kind : sw[sr][sc]?.kind) ?? 'bomb';
      pop(SPECIAL_LABEL[dk] ?? '💥 발동!', 'special');
    }
    lastSwapRef.current = [r,c];
    dirtyRef.current = true;
    push(sw);
    resolve();
  }, [clearHint, inc, pop, push, resolve, spawnFlames, kickScreen, spawnDust]);

  // 부스터(망치/폭탄/가로/세로/전체) 발동 — 선택한 칸 기준 효과 (입력 잠금 없음)
  const triggerBooster = useCallback((kind: BoosterKind, r: number, c: number) => {
    if (phaseRef.current !== 'play' || pausedRef.current) return;
    if ((boostersRef.current[kind] ?? 0) <= 0) { setShowShop(true); return; }
    const g = gRef.current;
    const cell = g[r]?.[c];
    if (!cell || cell.hit) return;
    setBoosterMode(null);
    clearHint();
    setBoosters(prev => { const next={...prev,[kind]:Math.max(0,prev[kind]-1)}; saveBoosters(next); return next; });
    const sw: Grid = g.map(row => row.map(x => x ? {...x} : null));
    const hits = new Set<string>();
    if (kind === 'hammer') hits.add(`${r},${c}`);
    else if (kind === 'rowClear') { for (let x=0;x<COLS;x++) if (sw[r]?.[x]) hits.add(`${r},${x}`); }
    else if (kind === 'colClear') { for (let y=0;y<ROWS;y++) if (sw[y]?.[c]) hits.add(`${y},${c}`); }
    else if (kind === 'allClear') { for (let y=0;y<ROWS;y++) for (let x=0;x<COLS;x++) if (sw[y]?.[x]) hits.add(`${y},${x}`); }
    else for (let dr=-1; dr<=1; dr++) for (let dc=-1; dc<=1; dc++) { // bomb
      const nr=r+dr, nc=c+dc;
      if (nr>=0&&nr<ROWS&&nc>=0&&nc<COLS&&sw[nr]?.[nc]) hits.add(`${nr},${nc}`);
    }
    expandSpecials(hits, sw);
    hits.forEach(key => { const [rr,cc]=key.split(',').map(Number); const cell2=sw[rr][cc]; if(cell2) cell2.hit=true; });
    inc(hits.size*80);
    setBlocksPopped(n => n + hits.size); sessionBlocksRef.current += hits.size;
    spawnFlames(hits); spawnDust([...hits], sw); kickScreen(); sfx.explode(); buzz(25);
    pop(kind==='bomb'?'💣 폭탄 발동!':kind==='rowClear'?'↔ 가로 제거!':kind==='colClear'?'↕ 세로 제거!':kind==='allClear'?'🌈 전체 제거!':'🔨 망치 발동!', 'special');
    dirtyRef.current = true;
    push(sw);
    resolve();
  }, [clearHint, inc, pop, push, resolve, spawnFlames, kickScreen, spawnDust]);

  // 셔플 부스터 — 즉시 보드 재생성
  const triggerShuffle = useCallback(() => {
    if (phaseRef.current !== 'play' || pausedRef.current) return;
    if ((boostersRef.current.shuffle ?? 0) <= 0) { setShowShop(true); return; }
    setBoosters(prev => { const next={...prev,shuffle:Math.max(0,prev.shuffle-1)}; saveBoosters(next); return next; });
    clearHint();
    push(mkGrid(LEVELS[lvlRef.current].types, mapRef.current));
    pop('🔀 셔플!', 'special');
    scheduleHint();
  }, [push, pop, clearHint, scheduleHint]);

  // ── 입력(탭/드래그) ───────────────────────────────────
  const handleTap = (r: number, c: number) => {
    if (phaseRef.current !== 'play' || pausedRef.current) return;
    const cell = gRef.current[r]?.[c];
    if (!cell || cell.hit) return;
    if (boosterMode) { triggerBooster(boosterMode, r, c); return; }
    if (!sel) { setSel([r,c]); return; }
    const [sr,sc] = sel; setSel(null);
    if (sr===r && sc===c) return;
    if (Math.abs(sr-r)+Math.abs(sc-c) !== 1) { setSel([r,c]); return; }
    trySwap(sr,sc,r,c);
  };
  const onTilePointerDown = (e: { clientX:number; clientY:number }, r: number, c: number) => {
    primeAudio();
    if (phaseRef.current !== 'play' || pausedRef.current) return;
    const cell = gRef.current[r]?.[c];
    if (!cell || cell.hit) return;
    dragRef.current = { r, c, x:e.clientX, y:e.clientY, moved:false };
  };
  const onGridPointerMove = (e: { clientX:number; clientY:number }) => {
    const d = dragRef.current;
    if (!d || d.moved) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (Math.abs(dx) < 14 && Math.abs(dy) < 14) return; // 드래그 임계값
    d.moved = true;
    if (boosterMode) { dragRef.current = null; return; } // 부스터는 탭으로만
    let tr = d.r, tc = d.c;
    if (Math.abs(dx) > Math.abs(dy)) tc += dx > 0 ? 1 : -1;
    else tr += dy > 0 ? 1 : -1;
    setSel(null);
    dragRef.current = null;
    if (tr < 0 || tr >= ROWS || tc < 0 || tc >= COLS) return;
    trySwap(d.r, d.c, tr, tc);
  };
  const onGridPointerUp = () => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d || d.moved) return;
    handleTap(d.r, d.c); // 드래그가 아니면 탭으로 처리
  };

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
  const cartCount = BOOSTERS.reduce((s, b) => s + cart[b.kind], 0);
  const cartTotal = BOOSTERS.reduce((s, b) => s + cart[b.kind] * b.cash, 0);
  const setCartQty = (kind: BoosterKind, delta: number) =>
    setCart(prev => ({ ...prev, [kind]: Math.max(0, Math.min(99, prev[kind] + delta)) }));
  const checkoutCart = () => {
    if (cartCount === 0) return;
    const snapshot = { ...cart };
    startPay(`아이템 ${cartCount}개`, cartTotal, () => {
      setBoosters(prev => {
        const next = { ...prev };
        (Object.keys(snapshot) as BoosterKind[]).forEach(k => { next[k] = (prev[k] ?? 0) + snapshot[k]; });
        saveBoosters(next); return next;
      });
      setCart({ hammer:0, bomb:0, shuffle:0, rowClear:0, colClear:0, allClear:0 });
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
  const curMap = genMap(lvlIdx);

  const renderModals = () => (
    <>
      {/* 이어하기 제안 (시간/이동 소진) */}
      {continueOffer && (() => {
        const cost = CONTINUE_COSTS[Math.min(continuesUsed, MAX_CONTINUES-1)];
        const timeMode = timeLeft <= 0;   // 시간 소진으로 멈췄는지
        const afford = coins >= cost;
        return (
          <div style={{ position:'absolute', inset:0, zIndex:65, background:'rgba(8,8,40,0.86)', backdropFilter:'blur(6px)', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
            <div style={{ width:'100%', maxWidth:330, background:'linear-gradient(160deg,#101830,#1a0d2e)', borderRadius:22, border:'2px solid rgba(255,180,0,0.45)', boxShadow:'0 20px 60px rgba(0,0,0,0.8)', overflow:'hidden', textAlign:'center' }}>
              <div style={{ padding:'22px 20px 6px' }}>
                <div style={{ fontSize:46, animation:'splashPulse 1s ease infinite' }}>{timeMode ? '⏳' : '🎯'}</div>
                <div style={{ fontSize:18, fontWeight:900, color:'white', marginTop:6 }}>{timeMode ? '시간이 다 됐어요!' : '이동을 다 썼어요!'}</div>
                <div style={{ fontSize:13, color:'rgba(255,255,255,0.7)', marginTop:6, lineHeight:1.5 }}>
                  코인으로 <b style={{ color:'#FFE566' }}>+{CONTINUE_MOVES}수 · +시간</b> 받고<br/>이어서 도전할 수 있어요!
                </div>
                <div style={{ fontSize:12, color:'rgba(255,255,255,0.55)', marginTop:8 }}>
                  현재 <b style={{ color:'white' }}>{score.toLocaleString()}</b> / 목표 <b style={{ color:'#FFD700' }}>{lvl.goal[0].toLocaleString()}</b>
                </div>
              </div>
              <div style={{ display:'flex', gap:8, padding:'14px 16px 8px' }}>
                <button onClick={declineContinue} style={{ flex:1, padding:'13px', borderRadius:12, border:'1px solid rgba(255,255,255,0.2)', cursor:'pointer', background:'rgba(255,255,255,0.06)', color:'rgba(255,255,255,0.8)', fontSize:13, fontWeight:800 }}>포기하기</button>
                <button onClick={acceptContinue} style={{ flex:2, padding:'13px', borderRadius:12, border:'none', cursor:'pointer', background: (cost===0 || afford) ? 'linear-gradient(135deg,#FF8C00,#FFD700)' : 'rgba(255,255,255,0.15)', color: (cost===0 || afford) ? '#3D1C00' : 'rgba(255,255,255,0.7)', fontSize:14, fontWeight:900 }}>
                  {cost===0 ? `무료 이어하기 ▶ (+${CONTINUE_MOVES}수)` : afford ? `🪙 ${cost} 이어하기 ▶` : `🪙 ${cost} · 충전`}
                </button>
              </div>
              <div style={{ fontSize:10, color:'rgba(255,255,255,0.4)', paddingBottom:14 }}>남은 이어하기 {MAX_CONTINUES - continuesUsed}회 · 보유 🪙 {coins.toLocaleString()}</div>
            </div>
          </div>
        );
      })()}

      {/* 일일 퀘스트 (완료 시 난이도별 하트 지급) */}
      {showQuests && (
        <div style={{ position:'absolute', inset:0, zIndex:50, background:'rgba(0,0,0,0.78)', backdropFilter:'blur(4px)', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
          <div style={{ width:'100%', maxWidth:340, background:'linear-gradient(160deg,#0d1a3a,#1a1a0d)', borderRadius:20, border:'2px solid rgba(255,180,0,0.35)', boxShadow:'0 20px 60px rgba(0,0,0,0.8)', overflow:'hidden' }}>
            <div style={{ padding:'16px 16px 12px', borderBottom:'1px solid rgba(255,180,0,0.2)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <span style={{ fontSize:16, fontWeight:900, color:'#FFD700', letterSpacing:1 }}>📋 일일 퀘스트</span>
              <button onClick={() => setShowQuests(false)} style={{ background:'none', border:'none', cursor:'pointer', fontSize:20, color:'rgba(255,255,255,0.6)', lineHeight:1 }}>✕</button>
            </div>
            <div style={{ padding:12, display:'flex', flexDirection:'column', gap:8, maxHeight:'68vh', overflowY:'auto' }}>
              {QUESTS.map(qd => {
                const current = qd.metric(quests);
                const claimed = quests.claimed[qd.key];
                const done = current >= qd.target;
                const diffColor = qd.difficulty==='쉬움' ? '#66BB6A' : qd.difficulty==='보통' ? '#FFB300' : '#EF5350';
                return (
                  <div key={qd.key} style={{ padding:'10px 12px', borderRadius:12, background: claimed ? 'rgba(255,255,255,0.04)' : done ? 'rgba(255,180,0,0.1)' : 'rgba(255,255,255,0.05)', border: `1px solid ${claimed ? 'rgba(255,255,255,0.1)' : done ? 'rgba(255,180,0,0.4)' : 'rgba(255,255,255,0.1)'}`, display:'flex', alignItems:'center', gap:10 }}>
                    <span style={{ fontSize:20, opacity: claimed ? 0.4 : 1 }}>{qd.icon}</span>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                        <span style={{ fontSize:12, fontWeight:800, color: claimed ? 'rgba(255,255,255,0.35)' : 'white' }}>{qd.label}</span>
                        <span style={{ fontSize:8, fontWeight:900, color:diffColor, border:`1px solid ${diffColor}`, borderRadius:999, padding:'1px 5px', opacity: claimed?0.4:1 }}>{qd.difficulty}</span>
                      </div>
                      <div style={{ fontSize:10, color:'rgba(255,255,255,0.45)', marginTop:2 }}>
                        {claimed ? '완료 ✓' : `${Math.min(current, qd.target)} / ${qd.target}`} · 💗 {qd.hearts}개
                      </div>
                      {!claimed && <div style={{ marginTop:4, height:4, borderRadius:999, background:'rgba(255,255,255,0.1)', overflow:'hidden' }}>
                        <div style={{ height:'100%', borderRadius:999, background:'linear-gradient(90deg,#FF8C00,#FFD700)', width:`${Math.min((current/qd.target)*100,100)}%`, transition:'width 0.3s' }}/>
                      </div>}
                    </div>
                    {done && !claimed && (
                      <button onClick={() => { const r = questClaim(qd.key); if (r.success) { setQuests(loadQuests()); setLives(loadLives()); pop(`${r.reward} 하트 획득!`, 'special'); } }} style={{ padding:'6px 10px', borderRadius:999, background:'linear-gradient(135deg,#FF5C8A,#C2185B)', border:'none', cursor:'pointer', fontSize:10, fontWeight:900, color:'white', whiteSpace:'nowrap' }}>
                        💗 {qd.hearts} 받기
                      </button>
                    )}
                    {claimed && <span style={{ fontSize:18, opacity:0.5 }}>✅</span>}
                  </div>
                );
              })}
              <div style={{ padding:'8px 12px', borderRadius:10, background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.08)', fontSize:10, color:'rgba(255,255,255,0.4)', textAlign:'center', lineHeight:1.5 }}>
                매일 0시 초기화 · 완료하면 난이도에 따라 하트를 드려요 💗
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tutorial overlay (첫 실행 / 설정에서 다시 보기) */}
      {showTutorial && (() => {
        const step = TUTORIAL_STEPS[tutStep];
        const last = tutStep >= TUTORIAL_STEPS.length - 1;
        // 실제 블럭 아이콘으로 플레이 장면을 보여주는 작은 일러스트
        const Tile = ({ t, size = 40, glow = false }: { t: number; size?: number; glow?: boolean }) => (
          <div style={{ width:size, height:size, borderRadius:'50%', background:TILES[t].bg, border:'2px solid rgba(255,255,255,0.6)', boxShadow: glow ? `0 0 12px ${TILES[t].glow}, 0 2px 5px rgba(0,0,0,0.4)` : '0 2px 5px rgba(0,0,0,0.4)', overflow:'hidden', position:'relative', flexShrink:0 }}>
            <img src={TILES[t].img} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
          </div>
        );
        const Special = ({ icon, size = 34 }: { icon: string; size?: number }) => (
          <div style={{ width:size, height:size, borderRadius:'50%', background:'linear-gradient(145deg,#6A1B9A,#E040FB)', border:'2px solid white', display:'flex', alignItems:'center', justifyContent:'center', fontSize:size*0.5, boxShadow:'0 0 12px rgba(224,64,251,0.85)', flexShrink:0 }}>{icon}</div>
        );
        const arrow = <span style={{ fontSize:18, color:'#FFD700', fontWeight:900 }}>→</span>;
        const cap = (txt: string) => <div style={{ fontSize:11, color:'rgba(255,255,255,0.55)', marginTop:2 }}>{txt}</div>;
        const visual =
          step.kind === 'intro' ? (
            <div style={{ display:'flex', gap:6 }}>{[0,1,2,3,4].map(t => <Tile key={t} t={t} size={42}/>)}</div>
          ) : step.kind === 'drag' ? (
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:6 }}>
              <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                <div style={{ position:'relative' }}><Tile t={0} size={50} glow/><span style={{ position:'absolute', bottom:-12, right:-10, fontSize:24 }}>👆</span></div>
                <span style={{ fontSize:26, color:'#FFD700', fontWeight:900 }}>⇆</span>
                <Tile t={1} size={50}/>
              </div>
              {cap('끌어서 옆 블럭과 자리 바꾸기')}
            </div>
          ) : step.kind === 'match' ? (
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:6 }}>
              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                <Tile t={2} size={44} glow/><Tile t={2} size={44} glow/><Tile t={2} size={44} glow/>
                <span style={{ fontSize:26 }}>💥</span>
              </div>
              {cap('같은 친구 3개 → 펑! 터짐')}
            </div>
          ) : step.kind === 'special' ? (
            <div style={{ display:'flex', flexDirection:'column', gap:10, width:'100%' }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:4 }}>
                {[0,1,2,3].map(i => <Tile key={i} t={3} size={26}/>)}{arrow}<Special icon="⚡" size={32}/>
                <span style={{ fontSize:10, color:'rgba(255,255,255,0.6)', marginLeft:4 }}>4개</span>
              </div>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:4 }}>
                {[0,1,2,3,4].map(i => <Tile key={i} t={4} size={26}/>)}{arrow}<Special icon="💣" size={32}/>
                <span style={{ fontSize:10, color:'rgba(255,255,255,0.6)', marginLeft:4 }}>5개+</span>
              </div>
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:8 }}>
              <div style={{ fontSize:32, letterSpacing:2 }}>⭐⭐⭐</div>
              <div style={{ display:'flex', gap:6 }}>
                <span style={{ fontSize:11, fontWeight:800, color:'#3D1C00', background:'linear-gradient(135deg,#FF8C00,#FFD700)', borderRadius:999, padding:'4px 10px' }}>🎯 목표 2,000</span>
                <span style={{ fontSize:11, fontWeight:800, color:'white', background:'rgba(255,255,255,0.15)', borderRadius:999, padding:'4px 10px' }}>📊 현재 1,650</span>
              </div>
              {cap('별 3개(목표 점수) 달성 = 클리어!')}
            </div>
          );
        return (
          <div style={{ position:'absolute', inset:0, zIndex:70, background:'rgba(0,0,0,0.82)', backdropFilter:'blur(6px)', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
            <div style={{ width:'100%', maxWidth:340, background:'linear-gradient(160deg,#0d1a3a,#1a0d2e)', borderRadius:22, border:'2px solid rgba(255,180,0,0.4)', boxShadow:'0 20px 60px rgba(0,0,0,0.8)', overflow:'hidden' }}>
              <div style={{ padding:'10px 16px', display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:'1px solid rgba(255,180,0,0.2)' }}>
                <span style={{ fontSize:12, fontWeight:800, color:'#FFD700', letterSpacing:1 }}>📖 튜토리얼 {tutStep+1}/{TUTORIAL_STEPS.length}</span>
                <button onClick={closeTutorial} style={{ background:'none', border:'none', cursor:'pointer', fontSize:12, fontWeight:800, color:'rgba(255,255,255,0.55)' }}>건너뛰기 ✕</button>
              </div>
              <div style={{ padding:'18px 20px 8px', textAlign:'center' }}>
                <div style={{ minHeight:118, display:'flex', alignItems:'center', justifyContent:'center', marginBottom:12, background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:16, padding:12 }}>
                  {visual}
                </div>
                <div style={{ fontSize:16, fontWeight:900, color:'white', marginBottom:8 }}>{step.title}</div>
                <div style={{ fontSize:13, color:'rgba(255,255,255,0.78)', lineHeight:1.6, minHeight:84 }}>{step.desc}</div>
              </div>
              <div style={{ display:'flex', justifyContent:'center', gap:6, padding:'4px 0 12px' }}>
                {TUTORIAL_STEPS.map((_,i) => (
                  <span key={i} style={{ width:i===tutStep?16:7, height:7, borderRadius:999, background:i===tutStep?'#FFD700':'rgba(255,255,255,0.25)', transition:'all 0.2s' }}/>
                ))}
              </div>
              <div style={{ display:'flex', gap:8, padding:'0 16px 16px' }}>
                {tutStep > 0 && (
                  <button onClick={() => setTutStep(s => Math.max(0, s-1))} style={{ flex:1, padding:'12px', borderRadius:12, border:'1px solid rgba(255,255,255,0.2)', cursor:'pointer', background:'rgba(255,255,255,0.06)', color:'rgba(255,255,255,0.8)', fontSize:13, fontWeight:800 }}>이전</button>
                )}
                <button onClick={() => last ? startTutorialPlay() : setTutStep(s => s+1)} style={{ flex:2, padding:'12px', borderRadius:12, border:'none', cursor:'pointer', background:'linear-gradient(135deg,#FF8C00,#FFD700)', color:'#3D1C00', fontSize:14, fontWeight:900 }}>
                  {last ? '직접 해보기 🎮' : '다음 ▶'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

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
                  {/* 하트 충전 */}
                  <div style={{ padding:'10px 12px', borderRadius:14, background:'rgba(255,120,150,0.1)', border:'1px solid rgba(255,120,150,0.3)', display:'flex', alignItems:'center', gap:10 }}>
                    <img src={`${BASE}characters/life.png`} alt="" style={{ width:30, height:30, borderRadius:'50%', objectFit:'cover' }}/>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:13, fontWeight:800, color:'white' }}>하트 5개 <span style={{ fontSize:10, color:'rgba(255,255,255,0.45)', fontWeight:600 }}>보유 {lives}/{LIVES_MAX}</span></div>
                      <div style={{ fontSize:10, color:'rgba(255,255,255,0.5)', marginTop:2 }}>게임 플레이에 필요한 하트를 채워요</div>
                    </div>
                    <button disabled={coins < 250 || lives >= LIVES_MAX}
                      onClick={() => {
                        if (lives >= LIVES_MAX) { pop('하트가 이미 가득 찼어요', 'special'); return; }
                        if (!spendCoins(250)) { pop('🪙 코인이 부족해요', 'special'); setShopTab('cash'); return; }
                        addLives(5); setLives(loadLives()); pop('💗 하트 +5!', 'special');
                      }}
                      style={{ padding:'8px 12px', borderRadius:999, border:'none', cursor: (coins>=250&&lives<LIVES_MAX)?'pointer':'default',
                        background: (coins>=250&&lives<LIVES_MAX) ? 'linear-gradient(135deg,#FF5C8A,#C2185B)' : 'rgba(255,255,255,0.12)',
                        color: (coins>=250&&lives<LIVES_MAX) ? 'white' : 'rgba(255,255,255,0.4)', fontSize:11, fontWeight:900, whiteSpace:'nowrap' }}>
                      🪙 250
                    </button>
                  </div>
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
                  {/* 하트 충전 (현금) */}
                  <div style={{ fontSize:11, fontWeight:800, color:'rgba(255,160,190,0.9)', letterSpacing:1, padding:'6px 2px 2px' }}>💗 하트 충전</div>
                  <div style={{ padding:'10px 12px', borderRadius:14, background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)', display:'flex', alignItems:'center', gap:10 }}>
                    <img src={`${BASE}characters/life.png`} alt="" style={{ width:28, height:28, borderRadius:'50%', objectFit:'cover' }}/>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:13, fontWeight:800, color:'white' }}>하트 가득 채우기 (15)</div>
                      <div style={{ fontSize:10, color:'rgba(255,255,255,0.45)' }}>지금 바로 최대치로</div>
                    </div>
                    <button onClick={() => startPay('하트 가득 채우기', 1500, () => { addLives(LIVES_MAX); setLives(loadLives()); pop('💗 하트 가득 충전!', 'special'); })}
                      style={{ padding:'8px 12px', borderRadius:999, border:'none', cursor:'pointer', background:'linear-gradient(135deg,#FF5C8A,#C2185B)', color:'white', fontSize:11, fontWeight:900, whiteSpace:'nowrap' }}>
                      ₩1,500
                    </button>
                  </div>
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
                <div><div style={{ fontSize:18, fontWeight:900, color:'#9EC0FF' }}>🎒 {BOOSTERS.reduce((a,b)=>a+boosters[b.kind],0)}</div><div style={{ fontSize:9, color:'rgba(255,255,255,0.4)' }}>아이템</div></div>
              </div>
              {/* 사운드 on/off */}
              <button onClick={() => { const m = toggleMuted(); setMutedState(m); if (!m) { sfx.click(); primeAudio(); const p=phaseRef.current; if (p==='main'||p==='map'||p==='play') startBgm(); } else stopBgm(); }}
                style={{ padding:'11px', borderRadius:12, border:'1px solid rgba(120,160,255,0.35)', cursor:'pointer', background:'rgba(120,160,255,0.12)', color:'#9EC0FF', fontSize:12, fontWeight:800, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <span>{muted ? '🔇 소리 꺼짐' : '🔊 소리 켜짐'}</span>
                <span style={{ fontSize:10, opacity:0.7 }}>{muted ? '탭하면 켜기' : '탭하면 끄기'}</span>
              </button>
              {/* 튜토리얼 다시 보기 */}
              <button onClick={() => { setShowSettings(false); setTutStep(0); setShowTutorial(true); }}
                style={{ padding:'11px', borderRadius:12, border:'1px solid rgba(120,160,255,0.35)', cursor:'pointer', background:'rgba(120,160,255,0.12)', color:'#9EC0FF', fontSize:12, fontWeight:800 }}>
                📖 튜토리얼 다시 보기
              </button>
              {/* 데이터 초기화 */}
              <button onClick={() => {
                  if (confirm('이 계정의 진행도·코인·아이템을 모두 초기화할까요?')) {
                    saveProg(Array(LEVELS.length).fill(0)); setProgress(Array(LEVELS.length).fill(0));
                    saveBoosters({hammer:0,bomb:0,shuffle:0,rowClear:0,colClear:0,allClear:0}); setBoosters({hammer:0,bomb:0,shuffle:0,rowClear:0,colClear:0,allClear:0});
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
    <div style={{ position:'relative', width:'100%', height:'100dvh', overflow:'hidden', userSelect:'none' }}>
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
        {/* 전체이용가 등급 표시 */}
        <div style={{ display:'flex', alignItems:'center', gap:7, marginTop:2 }}>
          <div style={{ width:34, height:34, borderRadius:'50%', background:'#2E9E4F', border:'2px solid white', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', lineHeight:1, boxShadow:'0 2px 8px rgba(0,0,0,0.4)' }}>
            <span style={{ fontSize:11, fontWeight:900, color:'white' }}>전체</span>
            <span style={{ fontSize:6.5, fontWeight:700, color:'white', letterSpacing:0.5 }}>이용가</span>
          </div>
          <span style={{ fontSize:10, color:'white', opacity:0.7, fontWeight:700 }}>전체이용가 · 누구나 즐길 수 있어요</span>
        </div>
        <p style={{ margin:0, fontSize:'clamp(10px,2.5vw,12px)', color:'white', opacity:0.35, letterSpacing:2 }}>리니와 도리 크래프트</p>
      </div>
    </div>
  );

  // 월드/스테이지 선택 화면 공통 요소
  const isUnlocked = (i:number) => i===0 || progress[i-1]>=3;
  const totalStars = progress.reduce((a, b) => a + b, 0);
  const topBar = (
    <div style={{ flexShrink:0, padding:'calc(var(--sat) + clamp(10px,2.5vh,16px)) clamp(10px,3vw,16px) 4px', display:'flex', alignItems:'center', gap:'clamp(5px,1.5vw,8px)' }}>
      <div style={{ position:'relative', display:'flex', alignItems:'center', gap:5, background:'rgba(0,0,0,0.4)', borderRadius:999, padding:'4px 10px 4px 6px', border:'1.5px solid rgba(255,120,150,0.5)', animation: lifeFly ? 'lifeChipPulse 0.5s ease' : undefined }}>
        <img src={`${BASE}characters/life.png`} alt="하트" style={{ width:22, height:22, borderRadius:'50%', objectFit:'cover' }}/>
        <span style={{ fontSize:13, fontWeight:900, color:'white' }}>{lives}</span>
        <span style={{ fontSize:10, color:'rgba(255,255,255,0.5)', fontWeight:700 }}>/{LIVES_MAX}</span>
        {lives < LIVES_MAX && lifeTimer > 0 && (
          <span style={{ fontSize:10, fontWeight:700, color:'#9EE6A0', marginLeft:2 }}>{Math.floor(lifeTimer/60)}:{String(lifeTimer%60).padStart(2,'0')}</span>
        )}
        {lifeFly && (<>
          <img src={`${BASE}characters/life.png`} alt="" style={{ position:'absolute', left:4, top:3, width:24, height:24, borderRadius:'50%', objectFit:'cover', pointerEvents:'none', zIndex:5, animation:'lifeFlyAway 0.5s ease-out forwards', filter:'drop-shadow(0 0 6px rgba(255,90,130,0.9))' }}/>
          <span style={{ position:'absolute', left:30, top:-2, fontSize:13, fontWeight:900, color:'#FF6B8A', pointerEvents:'none', zIndex:5, textShadow:'0 1px 3px rgba(0,0,0,0.6)', animation:'lifeMinusUp 0.6s ease-out forwards' }}>-1</span>
        </>)}
      </div>
      <div style={{ flex:1 }}/>
      <div style={{ display:'flex', alignItems:'center', gap:5, background:'rgba(0,0,0,0.4)', borderRadius:999, padding:'5px 10px', border:'1.5px solid rgba(255,180,0,0.35)' }}>
        <Icon name="coin" size={16} color="#FFCA28" /><span style={{ fontSize:13, fontWeight:900, color:'#FFE566' }}>{coins.toLocaleString()}</span>
      </div>
      <button onClick={() => { sfx.click(); setQuests(loadQuests()); setShowQuests(true); }} style={{ position:'relative', width:34, height:34, borderRadius:'50%', background:'rgba(0,0,0,0.4)', border:'1.5px solid rgba(255,180,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
        <Icon name="list" size={17} color="#FFD27A" />
        {(() => { const cnt = QUESTS.filter(qd => qd.metric(quests) >= qd.target && !quests.claimed[qd.key]).length; return cnt > 0 ? <span style={{ position:'absolute', top:-4, right:-4, width:14, height:14, borderRadius:'50%', background:'#FF3030', border:'1.5px solid white', fontSize:9, fontWeight:900, color:'white', display:'flex', alignItems:'center', justifyContent:'center', animation:'questBadge 1s ease infinite' }}>{cnt}</span> : null; })()}
      </button>
    </div>
  );
  const bottomNav = (
    <div style={{ flexShrink:0, paddingBottom:'var(--sab)', background:'rgba(5,10,30,0.92)', borderTop:'1.5px solid rgba(255,255,255,0.1)', display:'flex', alignItems:'center', justifyContent:'space-around', minHeight:'clamp(54px,7.5vh,68px)' }}>
      {([
        {icon:'home'   as const, label:'홈',   fn:()=>setPhase('main'),     active: phase==='main' },
        {icon:'tv'     as const, label:'유튜브', fn:()=>{ sfx.click(); window.open(CHANNEL_URL, '_blank', 'noopener'); }, active:false},
        {icon:'shop'   as const, label:'상점', fn:()=>setShowShop(true),    active:false},
        {icon:'gear'   as const, label:'설정', fn:()=>setShowSettings(true), active:false},
      ]).map((item,i)=>(
        <button key={i} onClick={item.fn} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:3, background:'none', border:'none', cursor:'pointer', padding:'6px 14px', filter:item.active?'drop-shadow(0 0 6px rgba(255,179,0,0.6))':'none' }}>
          <Icon name={item.icon} size={23} color={item.active?'#FFB300':'rgba(255,255,255,0.55)'} />
          <span style={{ fontSize:10, fontWeight:700, color:item.active?'#FFB300':'rgba(255,255,255,0.45)' }}>{item.label}</span>
        </button>
      ))}
    </div>
  );

  // ── Main = 월드(미니맵) 선택 ────────────────────────────────────────────────
  if (phase === 'main') {
    return (
      <div style={{ display:'flex', flexDirection:'column', width:'100%', height:'100dvh', userSelect:'none', background:`linear-gradient(180deg, rgba(10,26,72,0.5) 0%, rgba(8,20,60,0.82) 55%, rgba(6,16,48,0.94) 100%), url(${BASE}characters/mapbg.png) center top / cover no-repeat`, overflow:'hidden' }}>
        <style>{GAME_CSS}</style>
        {topBar}
        <div style={{ flexShrink:0, textAlign:'center', padding:'2px 0 8px' }}>
          <div style={{ fontSize:16, fontWeight:900, letterSpacing:1, color:'#FFE566', WebkitTextStroke:'0.5px #FFA500' }}>맵 선택 <span style={{ fontSize:11, color:'white', WebkitTextStroke:'0' }}>⭐ {totalStars}/{LEVELS.length*3}</span></div>
          <div style={{ fontSize:10.5, color:'rgba(255,255,255,0.6)', marginTop:2 }}>미니맵을 골라 스테이지에 도전하세요!</div>
        </div>
        <div style={{ flex:1, minHeight:0, overflow:'hidden', padding:'4px 10px 8px', display:'grid', gridTemplateColumns:'repeat(2,1fr)', gridAutoRows:'1fr', gap:'clamp(4px,1.5vw,10px)' }}>
          {WORLDS.map((w, wi) => {
            const unlocked = isUnlocked(w.from);
            const wStars = progress.slice(w.from, w.to).reduce((a,b)=>a+b,0);
            const wMax = (w.to - w.from) * 3;
            const cleared = progress.slice(w.from, w.to).every(s => s >= 3);
            return (
              <div key={wi} style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:3, minHeight:0 }}>
                {/* 스테이지와 동일한 원형 이미지 */}
                <button disabled={!unlocked} onClick={() => { if(!unlocked) return; sfx.click(); setSelectedWorld(wi); setPhase('map'); }}
                  style={{ position:'relative', width:'clamp(46px,13vw,64px)', aspectRatio:'1', borderRadius:'50%', overflow:'hidden', padding:0, flexShrink:0, cursor:unlocked?'pointer':'default',
                    border:`3px solid ${unlocked?w.color:'rgba(255,255,255,0.2)'}`,
                    boxShadow: unlocked ? `0 0 10px ${w.color}, 0 4px 12px rgba(0,0,0,0.5)` : 'none', opacity: unlocked?1:0.6 }}>
                  <img src={worldImg(wi)} alt="" loading="lazy" style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover', filter: unlocked?'none':'grayscale(1) brightness(0.4)' }}/>
                  <span style={{ position:'absolute', top:0, left:3, fontSize:12 }}>{w.emoji}</span>
                  {!unlocked && <span style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:22 }}>🔒</span>}
                </button>
                <div style={{ fontSize:'clamp(9px,2.6vw,11px)', fontWeight:900, color:'white', textShadow:'0 1px 3px rgba(0,0,0,0.85)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth:'46vw', textAlign:'center' }}>{wi+1}. {w.name}</div>
                <div style={{ fontSize:'clamp(8px,2.2vw,9px)', fontWeight:800, color:'#FFE566', textShadow:'0 1px 2px rgba(0,0,0,0.85)' }}>⭐ {wStars}/{wMax}{cleared?' 🎉':''}</div>
              </div>
            );
          })}
        </div>
        {bottomNav}
        {renderModals()}
      </div>
    );
  }

  // ── 스테이지 선택 (선택한 월드) ─────────────────────────────────────────────
  if (phase === 'map') {
    const w = WORLDS[selectedWorld];
    const ids = Array.from({ length: w.to - w.from }, (_, k) => w.from + k);
    const localY = (k:number) => k * MAP_ROW_GAP + 60;
    const wHeight = ids.length * MAP_ROW_GAP + 90;
    const curIdx = progress.findIndex(p=>p<3)===-1 ? LEVELS.length-1 : progress.findIndex(p=>p<3);
    return (
      <div style={{ display:'flex', flexDirection:'column', width:'100%', height:'100dvh', userSelect:'none', background:`linear-gradient(180deg, ${w.color}33 0%, rgba(8,20,60,0.9) 55%, rgba(6,16,48,0.97) 100%), url(${worldImg(selectedWorld)}) center top / cover no-repeat`, overflow:'hidden' }}>
        <style>{GAME_CSS}</style>
        {topBar}
        <div style={{ flexShrink:0, display:'flex', alignItems:'center', justifyContent:'space-between', padding:'2px 14px 6px' }}>
          <button onClick={()=>{ sfx.click(); setPhase('main'); }} style={{ display:'flex', alignItems:'center', gap:4, padding:'6px 12px', borderRadius:999, color:'white', fontSize:13, fontWeight:700, background:'rgba(0,0,0,0.35)', border:'1px solid rgba(255,255,255,0.2)', cursor:'pointer' }}><Icon name="back" size={15} color="white" /> 맵</button>
          <span style={{ fontSize:15, fontWeight:900, color:'#FFE566', WebkitTextStroke:'0.5px #FFA500' }}>{w.emoji} {w.name}</span>
          <span style={{ fontSize:12, fontWeight:800, color:'white' }}>⭐ {progress.slice(w.from,w.to).reduce((a,b)=>a+b,0)}/{(w.to-w.from)*3}</span>
        </div>
        <div style={{ flex:1, display:'flex', gap:6, margin:'4px 8px 8px', minHeight:0 }}>
        <div ref={mapScrollRef} style={{ flex:1, overflowY:'auto', borderRadius:16, background:'rgba(0,0,40,0.28)', border:'2px solid rgba(255,255,255,0.1)' }}>
          <div style={{ position:'relative', width:'100%', height: wHeight }}>
            <svg style={{ position:'absolute', inset:0, width:'100%', height:'100%', zIndex:1 }}>
              {ids.slice(0,-1).map((gi,k)=>{
                const done = progress[gi] >= 3;
                return <line key={gi} x1={`${mapNodeX(k)}%`} y1={localY(k)} x2={`${mapNodeX(k+1)}%`} y2={localY(k+1)} stroke={done?'#FFB300':'rgba(255,255,255,0.18)'} strokeWidth="4" strokeDasharray={done?'0':'8,6'} strokeLinecap="round"/>;
              })}
            </svg>
            {ids.map((gi,k)=>{
              const unlocked=isUnlocked(gi); const s=progress[gi]??0; const isCur = gi === curIdx;
              const diff = difficultyOf(gi); const rw = stageReward(gi); const earned = s>=3;
              return (
                <div key={gi}>
                  <button onClick={()=>unlocked&&tryStartLevel(gi)} disabled={!unlocked}
                    style={{ position:'absolute', width:64, height:64, left:`calc(${mapNodeX(k)}% - 32px)`, top:localY(k)-32, zIndex:2, borderRadius:'50%', cursor:unlocked?'pointer':'default', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
                      background:!unlocked?'rgba(10,10,40,0.8)':s===3?'linear-gradient(135deg,#FF6F00,#FFB300)':s>=1?'linear-gradient(135deg,#6A1B9A,#CE93D8)':'linear-gradient(135deg,#0D47A1,#1976D2)',
                      border: isCur&&unlocked?'3px solid #FFE566':unlocked?'3px solid rgba(255,255,255,0.55)':'2px solid rgba(255,255,255,0.12)',
                      boxShadow:isCur&&unlocked?'0 0 18px rgba(255,220,80,0.9), 0 4px 16px rgba(0,0,0,0.5)':unlocked?'0 4px 16px rgba(0,0,0,0.5)':'none', opacity:unlocked?1:0.5 }}>
                    {unlocked ? (<>
                      <span style={{ color:'white', fontWeight:900, fontSize:17, lineHeight:1 }}>{gi+1}</span>
                      <div style={{ display:'flex', marginTop:1 }}>{[1,2,3].map(n=><span key={n} style={{ fontSize:8, opacity:n<=s?1:0.25 }}>⭐</span>)}</div>
                      <span style={{ fontSize:7, fontWeight:800, color:diff.color, lineHeight:1 }}>{diff.label}</span>
                    </>) : <span style={{ fontSize:22 }}>🔒</span>}
                  </button>
                  {/* 보상 표시(동그라미 옆): 하트 + 아이템 */}
                  {unlocked && (
                    <div style={{ position:'absolute', left:`calc(${mapNodeX(k)}% + 30px)`, top:localY(k)-20, zIndex:3, display:'flex', flexDirection:'column', gap:3, opacity: earned?0.45:1 }}>
                      <span style={{ display:'flex', alignItems:'center', gap:2, background:'rgba(0,0,0,0.55)', borderRadius:999, padding:'1px 6px 1px 2px', border:'1px solid rgba(255,120,150,0.5)' }}>
                        <img src={`${BASE}characters/life.png`} alt="" style={{ width:14, height:14, borderRadius:'50%', objectFit:'cover' }}/>
                        <span style={{ fontSize:9, fontWeight:900, color:'white' }}>+{rw.hearts}</span>
                      </span>
                      <span style={{ display:'flex', alignItems:'center', gap:2, background:'rgba(0,0,0,0.55)', borderRadius:999, padding:'1px 6px', border:'1px solid rgba(255,255,255,0.25)' }}>
                        <span style={{ fontSize:11 }}>{BOOSTER_EMOJI[rw.booster]}</span>
                        <span style={{ fontSize:9, fontWeight:900, color:'white' }}>+1</span>
                      </span>
                      {earned && <span style={{ fontSize:9, color:'#9EE6A0', fontWeight:800 }}>받음✓</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        {/* 우측 진행 고슴도치 — 이 월드에서 별3 클리어한 만큼 아래→위로 */}
        {(() => {
          const count = w.to - w.from;
          const clearedN = progress.slice(w.from, w.to).filter(s => s >= 3).length;
          const frac = count > 0 ? clearedN / count : 0;
          return (
            <div style={{ width:30, flexShrink:0, display:'flex', justifyContent:'center', padding:'4px 0' }}>
              <div style={{ position:'relative', width:9, borderRadius:999, background:'rgba(255,255,255,0.18)', border:'1.5px solid rgba(255,255,255,0.35)' }}>
                <div style={{ position:'absolute', left:0, right:0, bottom:0, height:`${frac*100}%`, borderRadius:999, background:`linear-gradient(0deg, ${w.color}, #FFD700)`, transition:'height 0.4s ease' }}/>
                <span style={{ position:'absolute', left:'50%', top:-2, transform:'translateX(-50%)', fontSize:11 }}>🏁</span>
                <img src={`${BASE}characters/block1.png`} alt="" style={{ position:'absolute', left:'50%', bottom:`${frac*100}%`, transform:'translate(-50%,50%)', width:26, height:26, borderRadius:'50%', objectFit:'cover', border:'2px solid white', boxShadow:'0 2px 7px rgba(0,0,0,0.55)', transition:'bottom 0.4s ease' }}/>
              </div>
            </div>
          );
        })()}
        </div>
        {bottomNav}
        {renderModals()}
      </div>
    );
  }

  // ── Play / End ────────────────────────────────────────────────────────────────
  return (
    <div style={{ display:'flex', flexDirection:'column', width:'100%', height:'100dvh', overflow:'hidden', position:'relative', background:'linear-gradient(180deg,#7EC8F0 0%,#AEE4F8 30%,#C5F0A4 70%,#8BC34A 100%)', userSelect:'none', animation: screenShake ? 'screenShake 0.32s ease' : undefined }}>
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
        {/* 제한 시간 타이머 (별 왼쪽) — 60초 카운트다운 */}
        <div style={{ display:'flex', alignItems:'center', gap:3, flexShrink:0, background: timeLeft<=10 ? '#FFE3E3' : '#f1f3f5', borderRadius:999, padding:'4px 9px', alignSelf:'flex-start', animation: timeLeft<=10 ? 'pulseWarn 0.6s ease infinite' : undefined }}>
          <Icon name="clock" size={13} color={timeLeft<=10 ? '#E03131' : '#6b7280'} />
          <span style={{ fontSize:12, fontWeight:900, color: timeLeft<=10 ? '#E03131' : '#444', fontVariantNumeric:'tabular-nums' }}>{Math.floor(timeLeft/60)}:{String(timeLeft%60).padStart(2,'0')}</span>
        </div>
        {/* Stars + back button */}
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4, flexShrink:0 }}>
          <div style={{ display:'flex' }}>
            {[1,2,3].map(s=>(
              <span key={s} style={{ fontSize:15, filter:s<=curStars?'drop-shadow(0 0 5px #FFD700)':'grayscale(1) opacity(0.3)', transition:'filter 0.3s, transform 0.3s', transform:s<=curStars?'scale(1.1)':'scale(1)' }}>⭐</span>
            ))}
          </div>
          <button onClick={()=>{ sfx.click(); pausedRef.current = true; setShowPause(true); }} aria-label="일시정지" style={{ background:'#eef1f5', border:'1px solid rgba(0,0,0,0.08)', borderRadius:10, cursor:'pointer', padding:'4px 7px', lineHeight:1, display:'flex', boxShadow:'0 2px 0 rgba(0,0,0,0.08)' }}><Icon name="pause" size={17} color="#4b5563" /></button>
        </div>
      </div>

      {/* 목표 점수 · 현재 점수 표시 */}
      {(() => {
        const goal3 = lvl.goal[2];                 // 별 3개(클리어) 목표 점수
        const goalDone = score >= goal3;
        return (
          <div style={{ flexShrink:0, position:'relative', zIndex:10, display:'flex', justifyContent:'center', gap:8, margin:'6px 10px 0' }}>
            <div style={{ display:'flex', alignItems:'center', gap:5, background:'rgba(255,255,255,0.88)', borderRadius:999, padding:'4px 12px', boxShadow:'0 2px 6px rgba(0,0,0,0.18)' }}>
              <span style={{ fontSize:12 }}>🎯</span>
              <span style={{ fontSize:11, fontWeight:800, color:'#888' }}>목표 ⭐⭐⭐</span>
              <span style={{ fontSize:13, fontWeight:900, color:'#FF6F00' }}>{goal3.toLocaleString()}</span>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:5, background:'rgba(255,255,255,0.88)', borderRadius:999, padding:'4px 12px', boxShadow:'0 2px 6px rgba(0,0,0,0.18)' }}>
              <span style={{ fontSize:12 }}>📊</span>
              <span style={{ fontSize:11, fontWeight:800, color:'#888' }}>현재</span>
              <span style={{ fontSize:13, fontWeight:900, color: goalDone ? '#2E9E4F' : '#1565C0' }}>{score.toLocaleString()}</span>
            </div>
          </div>
        );
      })()}

      {/* Hint button */}
      {phase==='play' && (
        <div style={{ position:'absolute', top:'calc(var(--sat) + 8px)', right:10, zIndex:15, pointerEvents:'none' }}>
          {hintPair && (
            <div style={{ fontSize:9, fontWeight:800, color:'rgba(255,220,0,0.9)', textShadow:'0 1px 4px rgba(0,0,0,0.6)', letterSpacing:1, animation:'splashPulse 1s ease infinite', paddingTop:2 }}>💡 HINT</div>
          )}
        </div>
      )}

      {/* 하트 감소 강조 토스트 (스테이지 시작 시 3초) */}
      {phase==='play' && lifeLossToast && (
        <div style={{ position:'absolute', top:'calc(var(--sat) + 78px)', left:0, right:0, zIndex:27, display:'flex', justifyContent:'center', pointerEvents:'none' }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 16px', borderRadius:999, background:'linear-gradient(135deg,#C2185B,#FF5C8A)', border:'2px solid white', boxShadow:'0 6px 20px rgba(194,24,91,0.6)', animation:'comboIn 0.4s cubic-bezier(0.34,1.56,0.64,1) both' }}>
            <img src={`${BASE}characters/life.png`} alt="" style={{ width:24, height:24, borderRadius:'50%', objectFit:'cover' }}/>
            <span style={{ fontSize:14, fontWeight:900, color:'white' }}>하트 −1</span>
            <span style={{ fontSize:12, fontWeight:800, color:'rgba(255,255,255,0.85)' }}>· 남은 {lives}/{LIVES_MAX}</span>
          </div>
        </div>
      )}

      {/* 튜토리얼 코칭 배너 (실제 플레이 가이드) */}
      {phase==='play' && tutorialPlay && (
        <div style={{ position:'absolute', top:'calc(var(--sat) + 92px)', left:0, right:0, zIndex:26, display:'flex', flexDirection:'column', alignItems:'center', gap:6, padding:'0 16px', pointerEvents:'none' }}>
          <div style={{ maxWidth:340, padding:'10px 16px', borderRadius:16, background:'linear-gradient(135deg,#1565C0,#0D47A1)', border:'2px solid #FFE566', boxShadow:'0 6px 20px rgba(0,0,0,0.5)', color:'white', fontSize:13, fontWeight:800, textAlign:'center', lineHeight:1.45, animation:'splashPulse 1.4s ease infinite' }}>
            {tutMatches===0 ? '👆 반짝이는 두 블럭을 드래그해 같은 친구 3개를 맞춰보세요!'
              : tutMatches===1 ? '잘했어요! ✨ 계속 3개 이상 맞춰볼까요?'
              : tutMatches===2 ? '한 번에 4개를 맞추면 ⚡특수 블럭이 생겨요!'
              : '거의 다 왔어요! 목표 점수를 향해 🎯'}
            <div style={{ marginTop:6, display:'flex', justifyContent:'center', gap:4 }}>
              {Array.from({length:TUT_GOAL_MATCHES}).map((_,i)=>(
                <span key={i} style={{ width:8, height:8, borderRadius:'50%', background: i<tutMatches ? '#FFE566' : 'rgba(255,255,255,0.3)' }}/>
              ))}
            </div>
          </div>
          <button onClick={()=>{ tutorialPlayRef.current=false; setTutorialPlay(false); }} style={{ pointerEvents:'auto', background:'rgba(0,0,0,0.5)', border:'1px solid rgba(255,255,255,0.3)', color:'rgba(255,255,255,0.85)', fontSize:11, fontWeight:800, borderRadius:999, padding:'4px 12px', cursor:'pointer' }}>튜토리얼 건너뛰기</button>
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
        {/* 우측 목표 진행바 — 고슴도치가 목표 달성도만큼 아래에서 위로 이동 */}
        {(() => {
          const goal3 = lvl.goal[2];
          const prog = Math.max(0, Math.min(1, score / goal3));
          return (
            <div style={{ position:'absolute', right:7, top:'9%', bottom:'9%', width:28, zIndex:11, display:'flex', justifyContent:'center' }}>
              <div style={{ position:'relative', width:9, borderRadius:999, background:'rgba(255,255,255,0.18)', border:'1.5px solid rgba(255,255,255,0.35)' }}>
                <div style={{ position:'absolute', left:0, right:0, bottom:0, height:`${prog*100}%`, borderRadius:999, background:'linear-gradient(0deg,#FF8C00,#FFD700)', transition:'height 0.4s ease' }}/>
                {lvl.goal.map((gv,i)=>(
                  <span key={i} style={{ position:'absolute', left:'50%', bottom:`${(gv/goal3)*100}%`, transform:'translate(-50%,50%)', fontSize:10, lineHeight:1, filter: score>=gv?'none':'grayscale(1) opacity(0.5)' }}>⭐</span>
                ))}
                <img src={`${BASE}characters/block1.png`} alt="" style={{ position:'absolute', left:'50%', bottom:`${prog*100}%`, transform:'translate(-50%,50%)', width:26, height:26, borderRadius:'50%', objectFit:'cover', border:'2px solid white', boxShadow:'0 2px 7px rgba(0,0,0,0.55)', transition:'bottom 0.4s ease' }}/>
              </div>
            </div>
          );
        })()}
        <div style={{ width:'100%', maxWidth:390, borderRadius:24, padding:'clamp(6px,1.8vw,10px)', background:'rgba(25,15,75,0.72)', boxShadow:'0 8px 36px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1)', backdropFilter:'blur(2px)' }}>
          <div
            onPointerMove={onGridPointerMove}
            onPointerUp={onGridPointerUp}
            onPointerLeave={onGridPointerUp}
            onPointerCancel={() => { dragRef.current = null; }}
            style={{ position:'relative', display:'grid', gridTemplateColumns:`repeat(${COLS},1fr)`, gap:'clamp(3px,1vw,5px)', touchAction:'none' }}>
            {/* 폭탄·아이템 사용 시 터지는 칸에 불길 효과 */}
            {flames.map(f => (
              <span key={f.id} style={{
                position:'absolute',
                left:`${((f.c+0.5)/COLS)*100}%`,
                top:`${((f.r+0.5)/ROWS)*100}%`,
                fontSize:'clamp(20px,5.5vw,30px)',
                lineHeight:1,
                pointerEvents:'none',
                zIndex:6,
                filter:'drop-shadow(0 0 7px rgba(255,110,0,0.95)) drop-shadow(0 0 3px rgba(255,210,0,0.9))',
                animation:'flameBurst 0.6s ease-out forwards',
              }}>🔥</span>
            ))}
            {sparks.map(f => (
              <span key={f.id} style={{
                position:'absolute',
                left:`${((f.c+0.5)/COLS)*100}%`,
                top:`${((f.r+0.5)/ROWS)*100}%`,
                fontSize:'clamp(22px,6vw,32px)',
                lineHeight:1,
                pointerEvents:'none',
                zIndex:7,
                filter:'drop-shadow(0 0 8px rgba(255,255,180,1)) drop-shadow(0 0 4px rgba(255,230,120,1))',
                animation:'sparkConverge 0.45s ease-out forwards',
              }}>✨</span>
            ))}
            {/* 가루(먼지) 파티클 */}
            {dust.map(d => (
              <span key={d.id} style={{
                position:'absolute',
                left:`${((d.c+0.5)/COLS)*100}%`,
                top:`${((d.r+0.5)/ROWS)*100}%`,
                width:7, height:7, borderRadius:'50%',
                background:d.color, pointerEvents:'none', zIndex:6,
                boxShadow:`0 0 5px ${d.color}`,
                '--dx':`${d.dx}px`, '--dy':`${d.dy}px`,
                animation:'dustFly 1.4s ease-out forwards',
              } as unknown as CSSProperties}>{''}</span>
            ))}
            {/* 클리어 피날레: 위에서 내려오는 빛 */}
            {lights.map(l => (
              <span key={l.id} style={{
                position:'absolute',
                left:`${((l.c+0.5)/COLS)*100}%`,
                top:`${((l.r+0.5)/ROWS)*100}%`,
                fontSize:'clamp(18px,5vw,26px)', lineHeight:1, pointerEvents:'none', zIndex:8,
                filter:'drop-shadow(0 0 10px rgba(255,255,150,1))',
                animation:'lightDive 0.32s ease-in forwards',
              }}>💫</span>
            ))}
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
                <button key={cell.id}
                  onPointerDown={(e)=>onTilePointerDown(e,row,col)}
                  disabled={phase==='end'}
                  style={{
                    aspectRatio:'1', position:'relative', overflow:'hidden', borderRadius:'50%', padding:0,
                    background: tile.bg,
                    touchAction:'none',
                    border: isSel
                      ? '3px solid white'
                      : isHint
                      ? '2.5px solid #FFE566'
                      : isSpecial
                      ? `2.5px solid ${SPECIAL_COLOR[cell.kind] ?? '#FF7043'}`
                      : `3px solid ${tile.glow}`,
                    boxShadow: isSel
                      ? `0 0 0 3px rgba(255,255,255,0.35), 0 0 18px white, 0 4px 10px rgba(0,0,0,0.4), inset 0 -4px 8px rgba(0,0,0,0.2), inset 0 4px 8px rgba(255,255,255,0.35)`
                      : isHint
                      ? `0 0 18px rgba(255,230,0,0.9), 0 3px 8px rgba(0,0,0,0.35), inset 0 -3px 6px rgba(0,0,0,0.15)`
                      : isSpecial
                      ? `0 0 13px ${SPECIAL_COLOR[cell.kind] ?? '#FF7043'}, 0 3px 8px rgba(0,0,0,0.35), inset 0 -3px 6px rgba(0,0,0,0.15), inset 0 3px 6px rgba(255,255,255,0.3)`
                      : `0 0 0 1.5px rgba(255,255,255,0.45), 0 0 8px ${tile.glow}99, 0 3px 8px rgba(0,0,0,0.35), inset 0 -3px 6px rgba(0,0,0,0.15), inset 0 3px 6px rgba(255,255,255,0.3)`,
                    transform: cell.hit ? undefined : isSel ? 'scale(1.15)' : 'scale(1)',
                    opacity: cell.hit ? undefined : 1,
                    transition: 'transform 0.12s ease',
                    cursor: 'pointer',
                    // 터질 때 자연스럽게 부풀었다 사라지는 효과(popOut)
                    animation: cell.hit
                      ? 'popOut 0.6s ease-out forwards'
                      : isHint && !isSel
                      ? 'hintGlow 0.75s ease infinite'
                      : undefined,
                  }}>
                  {/* 4개 이상 매치로 생성된 특수 블럭은 캐릭터 이미지 대신 전용 아이콘으로 교체 */}
                  {isSpecial ? (
                    <span style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize: (cell.kind==='row'||cell.kind==='col')?'clamp(28px,8vw,40px)':'clamp(24px,7vw,34px)', fontWeight:900, color:'white', lineHeight:1, filter:'drop-shadow(0 2px 4px rgba(0,0,0,0.8))', zIndex:2 }}>{SPECIAL_ICON[cell.kind] ?? '💥'}</span>
                  ) : (
                    <img src={tile.img} alt="" style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover', objectPosition:'center' }}/>
                  )}
                  <div style={{ position:'absolute', top:0, left:'5%', right:'5%', height:'48%', borderRadius:'0 0 50% 50%', background:'linear-gradient(180deg,rgba(255,255,255,0.62) 0%,rgba(255,255,255,0.05) 100%)', pointerEvents:'none', zIndex:1 }}/>
                  <div style={{ position:'absolute', bottom:0, left:0, right:0, height:'28%', borderRadius:'0 0 50% 50%', background:'linear-gradient(0deg,rgba(0,0,0,0.2) 0%,transparent 100%)', pointerEvents:'none', zIndex:1 }}/>
                  {isSel && <div style={{ position:'absolute', inset:0, background:'rgba(255,255,255,0.2)', borderRadius:'50%', zIndex:2 }}/>}
                  {/* 터질 때 강한 임팩트: 흰 섬광 */}
                  {cell.hit && <div style={{ position:'absolute', inset:'-20%', borderRadius:'50%', zIndex:4, pointerEvents:'none', background:`radial-gradient(circle, #fff 0%, ${tile.glow} 45%, transparent 70%)`, animation:'popFlash 0.32s ease-out forwards' }}/>}
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
            {(BOOSTERS.find(b=>b.kind===boosterMode)?.icon ?? '🔨')} 적용할 블럭 선택! (다시 탭하면 취소)
          </div>
        </div>
      )}

      {/* Booster bar — 두 줄 그리드 (SVG 아이콘) */}
      {phase==='play' && (
        <div style={{ flexShrink:0, position:'relative', zIndex:12, display:'grid', gridTemplateColumns:'repeat(4, minmax(0,1fr))', alignItems:'stretch', justifyContent:'center', gap:'clamp(4px,1.4vw,7px)', padding:'4px 10px calc(var(--sab) + 8px)', maxWidth:340, margin:'0 auto', width:'100%' }}>
          {BOOSTERS.map(b => {
            const cnt = boosters[b.kind];
            const armed = boosterMode === b.kind;
            return (
              <button key={b.kind}
                onClick={() => {
                  if (cnt <= 0) { setShowShop(true); return; }
                  if (b.kind === 'shuffle') { triggerShuffle(); return; }
                  if (b.kind === 'allClear') { const g=gRef.current; for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++) if(g[y]?.[x] && !g[y][x]!.hit){ triggerBooster('allClear',y,x); return; } return; }
                  setBoosterMode(armed ? null : b.kind);
                }}
                style={{
                  position:'relative', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:2,
                  height:48, borderRadius:14, cursor:'pointer',
                  background: armed ? 'linear-gradient(145deg,#FF8C00,#FFD700)' : 'rgba(255,255,255,0.92)',
                  border: armed ? '2.5px solid white' : '2px solid rgba(0,0,0,0.1)',
                  boxShadow: armed ? '0 0 16px rgba(255,180,0,0.9), 0 4px 0 rgba(0,0,0,0.15)' : '0 4px 0 rgba(0,0,0,0.15)',
                  opacity: cnt <= 0 ? 0.5 : 1, transition:'all 0.15s ease',
                }}>
                <Icon name={BOOSTER_ICON[b.kind]} size={20} color={armed ? '#3D1C00' : '#444'} />
                <span style={{ fontSize:8.5, fontWeight:800, color: armed ? '#3D1C00' : '#555', lineHeight:1 }}>{b.name}</span>
                <span style={{ position:'absolute', top:-6, right:-6, minWidth:18, height:18, padding:'0 4px', borderRadius:999,
                  background: cnt > 0 ? '#22AA55' : '#BBB', border:'1.5px solid white', color:'white', fontSize:10, fontWeight:900,
                  display:'flex', alignItems:'center', justifyContent:'center' }}>{cnt}</span>
              </button>
            );
          })}
          <button onClick={() => setShowShop(true)}
            style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:2,
              height:48, borderRadius:14, cursor:'pointer', background:'linear-gradient(145deg,#42A5F5,#1565C0)', border:'2px solid rgba(255,255,255,0.4)', boxShadow:'0 4px 0 #0D3B80' }}>
            <Icon name="shop" size={19} color="white" />
            <span style={{ fontSize:8.5, fontWeight:800, color:'white', lineHeight:1 }}>상점</span>
          </button>
        </div>
      )}

      {/* 일시정지 메뉴 오버레이 */}
      {phase==='play' && showPause && (
        <div style={{ position:'absolute', inset:0, zIndex:40, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(8,12,30,0.78)', backdropFilter:'blur(6px)', padding:'0 28px' }}>
          <div style={{ width:'100%', maxWidth:300, background:'linear-gradient(160deg,#ffffff,#eef2fb)', borderRadius:22, padding:'22px 20px', boxShadow:'0 16px 40px rgba(0,0,0,0.45)', display:'flex', flexDirection:'column', gap:12 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, marginBottom:2 }}>
              <Icon name="pause" size={22} color="#1565C0" />
              <span style={{ fontSize:20, fontWeight:900, color:'#1a1a2e' }}>일시정지</span>
            </div>
            <button onClick={()=>{ sfx.click(); pausedRef.current = false; setShowPause(false); }}
              style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, width:'100%', padding:'13px 0', borderRadius:14, border:'none', cursor:'pointer', color:'white', fontSize:16, fontWeight:900, background:'linear-gradient(145deg,#FF8C00,#FFB300)', boxShadow:'0 4px 0 #C46A00' }}>
              <Icon name="play" size={17} color="white" /> 계속하기
            </button>
            <button onClick={()=>{ sfx.click(); startLevel(lvlIdx); }}
              style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, width:'100%', padding:'11px 0', borderRadius:14, border:'none', cursor:'pointer', color:'#1a1a2e', fontSize:15, fontWeight:800, background:'#e7ebf5', boxShadow:'0 3px 0 rgba(0,0,0,0.12)' }}>
              <Icon name="refresh" size={16} color="#1a1a2e" /> 다시하기
            </button>
            <button onClick={()=>{ const m = toggleMuted(); setMutedState(m); if (!m) { sfx.click(); primeAudio(); startBgm(); } else stopBgm(); }}
              style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, width:'100%', padding:'11px 0', borderRadius:14, border:'none', cursor:'pointer', color:'#1a1a2e', fontSize:15, fontWeight:800, background:'#e7ebf5', boxShadow:'0 3px 0 rgba(0,0,0,0.12)' }}>
              <Icon name={muted ? 'mute' : 'sound'} size={16} color="#1a1a2e" /> {muted ? '소리 켜기' : '소리 끄기'}
            </button>
            <button onClick={()=>{ sfx.click(); pausedRef.current = false; setShowPause(false); setSelectedWorld(Math.floor(lvlIdx/STAGES_PER_WORLD)); setPhase('map'); }}
              style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, width:'100%', padding:'11px 0', borderRadius:14, border:'none', cursor:'pointer', color:'white', fontSize:15, fontWeight:800, background:'linear-gradient(145deg,#EF5350,#C62828)', boxShadow:'0 3px 0 #8E1818' }}>
              <Icon name="exit" size={16} color="white" /> 나가기
            </button>
          </div>
        </div>
      )}

      {renderModals()}

      {/* End overlay */}
      {phase==='end' && (
        <div style={{ position:'absolute', inset:0, zIndex:20, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:'clamp(8px,2vh,14px)', background:'rgba(10,10,60,0.88)', backdropFilter:'blur(8px)', padding:'0 clamp(16px,5vw,24px)', overflow:'hidden' }}>
          {/* 승리 색종이 */}
          {confetti.map(p => (
            <span key={p.id} style={{ position:'absolute', top:0, left:`${p.left}%`, fontSize:18, color:p.color, pointerEvents:'none', animation:`confettiFall ${1.6+p.delay}s ease-in ${p.delay}s forwards` }}>{p.e}</span>
          ))}
          {endStars===3 ? (
            <div style={{ textAlign:'center' }}>
              <div style={{ fontSize:'clamp(13px,3.6vw,16px)', fontWeight:900, letterSpacing:2, color:'#FFE566', marginBottom:2 }}>STAGE {lvlIdx+1}</div>
              <div style={{ fontSize:'clamp(30px,8.5vw,44px)', fontWeight:900, color:'#FFD700', WebkitTextStroke:'1.5px #FF8C00', textShadow:'0 4px 0 rgba(0,0,0,0.4), 0 0 28px rgba(255,200,0,0.9)', animation:'starPop 0.55s cubic-bezier(0.34,1.56,0.64,1) both' }}>
                {lvlIdx===LEVELS.length-1 ? '🏆 올 클리어! 🏆' : '🎉 클리어! 🎉'}
              </div>
            </div>
          ) : nearMiss ? (
            <div style={{ textAlign:'center', animation:'nearMissShake 0.5s ease 0.2s' }}>
              <div style={{ fontSize:'clamp(26px,7vw,34px)', fontWeight:900, color:'#FFD700', animation:'splashPulse 0.8s ease infinite' }}>😱 아깝다!</div>
              <div style={{ fontSize:'clamp(12px,3.2vw,14px)', color:'rgba(255,240,100,0.9)', marginTop:2 }}>조금만 더 하면 별을 딸 수 있어요!</div>
            </div>
          ) : (
            <h2 style={{ fontSize:'clamp(22px,6vw,30px)', fontWeight:900, color:'white', margin:0 }}>게임 종료! 🏆</h2>
          )}
          <div style={{ display:'flex', gap:'clamp(10px,3vw,18px)', fontSize:'clamp(48px,15vw,72px)' }}>
            {[1,2,3].map(s=>(
              <span key={s} style={{
                display:'inline-block',
                filter: s<=endStars ? 'drop-shadow(0 0 18px #FFD700) drop-shadow(0 0 8px #FF8C00)' : 'grayscale(1) opacity(0.22)',
                // 클리어 시 별이 하나씩 큼직하게 노란색으로 등장
                animation: s<=endStars ? `starPop 0.55s ${0.35 + (s-1)*0.45}s cubic-bezier(0.34,1.56,0.64,1) both` : undefined,
                opacity: s<=endStars ? undefined : 0.22,
              }}>⭐</span>
            ))}
          </div>
          <div style={{ textAlign:'center' }}>
            <div style={{ fontSize:'clamp(10px,2.8vw,12px)', color:'white', opacity:0.5, marginBottom:4 }}>{isTime?`⏱ ${(lvl as {sec?:number}).sec}초 도전`:`🎯 ${(lvl as {moves?:number}).moves}수 도전`}</div>
            <div style={{ fontSize:'clamp(12px,3.5vw,14px)', color:'white', opacity:0.6 }}>최종 점수 · 목표 {lvl.goal[0].toLocaleString()}</div>
            <div style={{ fontSize:'clamp(32px,10vw,48px)', fontWeight:900, color:'white', marginTop:4 }}>{score.toLocaleString()}</div>
            <div style={{ fontSize:'clamp(10px,2.8vw,12px)', color:'white', opacity:0.55, marginTop:2 }}>🧱 터트린 블럭 {blocksPopped.toLocaleString()}개</div>
            <div style={{ fontSize:'clamp(11px,3vw,12px)', color:'white', opacity:0.5, marginTop:8, lineHeight:1.6 }}>
              {nearMiss ? `목표까지 ${(lvl.goal[0]-score).toLocaleString()}점 남았어요!` : endStars===0?'아쉬워요… 다시 도전!':endStars===1?'좋아요! 더 잘할 수 있어요':endStars===2?'훌륭해요! 조금만 더!':'완벽해요! 대단해요! 🎉'}
            </div>
            {coinsEarned > 0 && (
              <div style={{ marginTop:8, display:'inline-flex', alignItems:'center', gap:6, padding:'7px 16px', borderRadius:999, background:'rgba(255,180,0,0.18)', border:'1.5px solid rgba(255,200,0,0.5)', animation:'starPop 0.5s 0.4s cubic-bezier(0.34,1.56,0.64,1) both' }}>
                <span style={{ fontSize:18 }}>🪙</span>
                <span style={{ fontSize:'clamp(15px,4.5vw,18px)', fontWeight:900, color:'#FFE566' }}>+{coinsEarned.toLocaleString()}</span>
                <span style={{ fontSize:10, color:'rgba(255,255,255,0.6)', fontWeight:700 }}>코인 획득!</span>
              </div>
            )}
            <div style={{ display:'flex', gap:8, marginTop:6, justifyContent:'center' }}>
              {lvl.goal.map((gv,i)=>(
                <div key={i} style={{ textAlign:'center', opacity: score>=gv ? 1 : 0.45 }}>
                  <div style={{ fontSize:10 }}>{'⭐'.repeat(i+1)}</div>
                  <div style={{ fontSize:11, fontWeight:700, color: score>=gv ? '#FFE566' : 'rgba(255,255,255,0.5)' }}>{gv.toLocaleString()}</div>
                </div>
              ))}
            </div>
            {endStars===3 && lvlIdx<LEVELS.length-1
              ? <div style={{ fontSize:'clamp(11px,3vw,12px)', color:'#FDE68A', marginTop:4, opacity:0.9 }}>다음 스테이지 해제됨! 🔓</div>
              : endStars<3 && <div style={{ fontSize:'clamp(11px,3vw,12px)', color:'#FFD7A0', marginTop:4, opacity:0.9 }}>⭐⭐⭐ 별 3개를 모아야 다음 스테이지로!</div>}
          </div>
          <div style={{ display:'flex', gap:'clamp(8px,2.5vw,12px)' }}>
            <button onClick={()=>tryStartLevel(lvlIdx)} style={{ padding:'clamp(10px,2.5vh,12px) clamp(18px,5vw,24px)', borderRadius:999, fontWeight:900, fontSize:'clamp(13px,3.8vw,16px)', color:'white', background: endStars<3 ? 'linear-gradient(135deg,#FF6F00,#FFD700)' : 'linear-gradient(135deg,#1565C0,#42A5F5)', boxShadow: endStars<3 ? '0 4px 0 #B84800' : '0 4px 0 #0D3B80', border:'none', cursor:'pointer' }}>
              {endStars<3 ? '다시 도전! 🔥' : '다시하기 🔄'}
            </button>
            {endStars===3 && lvlIdx<LEVELS.length-1
              ? <button onClick={()=>{ sfx.click(); tryStartLevel(lvlIdx+1); }} style={{ padding:'clamp(10px,2.5vh,12px) clamp(20px,5.5vw,28px)', borderRadius:999, fontWeight:900, fontSize:'clamp(14px,4vw,17px)', color:'white', background:'linear-gradient(135deg,#FF6F00,#FFB300)', border:'2px solid rgba(255,255,255,0.7)', animation:'luckyGlow 0.9s ease infinite', cursor:'pointer' }}>다음 스테이지 ▶</button>
              : <button onClick={()=>setPhase('main')} style={{ padding:'clamp(10px,2.5vh,12px) clamp(18px,5vw,24px)', borderRadius:999, fontWeight:900, fontSize:'clamp(13px,3.8vw,16px)', color:'white', background:'linear-gradient(135deg,#607D8B,#455A64)', boxShadow:'0 4px 0 #2C3940', border:'none', cursor:'pointer' }}>맵으로 🗺️</button>
            }
          </div>
        </div>
      )}
    </div>
  );
}
