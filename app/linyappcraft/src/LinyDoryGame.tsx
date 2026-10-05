import { useState, useEffect, useRef, useCallback, type CSSProperties, type ReactNode } from 'react';
import { loadCoins, spendCoins, addCoins, loadBoosters, saveBoosters, loadLives, spendLife, addLives, nextLifeMs, LIVES_MAX, questAddGameCleared, questUpdateMaxCombo, questAddSpecials, questAddBlocks, questClaim, loadQuests, QUESTS, type QuestSave, type BoosterKind } from './quest';
import { sGet, sSet } from './store';
import { onBackEvent, closeApp, lockPortrait, keepScreenAwake } from './platform';
import { purchase } from './billing';
import { loginGoogle, loginKakao, loginGuest, getAccountLabel } from './auth';
import { sfx, buzz, haptic, resetComboPitch, primeAudio, isMuted, toggleMuted, startBgm, stopBgm } from './sfx';
import { Icon } from './icons';
import { C, Panel, Ribbon, CloseBtn, Medal, GIcon, Petal, Spark, type GIconName } from './ui';
import { dailyPending } from './DailyReward';

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
const BOOSTER_ICON: Record<BoosterKind, GIconName> = {
  hammer: 'hammer', bomb: 'bomb', rowClear: 'rowclear',
  colClear: 'colclear', allClear: 'allclear', shuffle: 'shuffle',
};

// 코인 충전 패키지. sku는 앱인토스 콘솔에 등록한 상품 ID와 동일해야 실제 결제가 연결돼요.
const COIN_PACKS: { coins: number; cash: number; bonus?: string; sku: string }[] = [
  { coins: 1000,  cash: 1100,                sku: 'coins_1000'  },
  { coins: 3500,  cash: 3300,  bonus: '+16%', sku: 'coins_3500'  },
  { coins: 12000, cash: 11000, bonus: '+33%', sku: 'coins_12000' },
];
// 하트 가득 충전 상품 SKU (콘솔 등록 필요)
const SKU_HEARTS_FULL = 'hearts_full';

const ROWS = 7;
const COLS = 7;

const BASE = import.meta.env.BASE_URL;
// 블럭 캐릭터 — 투명 배경 얼굴 이미지(public/characters/face{n}.png), 동그라미 틀 없이 얼굴만 표시
const FACE = (n: number) => `${BASE}characters/face${n}.png`;
// 쉬운 판(색 4종)에서 헷갈리지 않도록 색감이 가장 다른 순서로 배치. glow = 파티클·섬광 색
const TILES = [
  { img: FACE(6), glow: '#FFC400' }, // 노랑 머리 안경
  { img: FACE(3), glow: '#FF6FAE' }, // 분홍 머리 진주
  { img: FACE(2), glow: '#8B5A2B' }, // 갈색 머리 검은 안경
  { img: FACE(1), glow: '#F0A878' }, // 올림머리 구슬핀
  { img: FACE(5), glow: '#D9A05B' }, // 황금 가시 리본
  { img: FACE(4), glow: '#6D4C41' }, // 갈색 가시 파란 눈
] as const;

// 특수 블럭 종류: 가로 1줄 / 세로 1줄 / 주변 폭탄 / 전체 제거
type TileKind = 'normal' | 'row' | 'col' | 'bomb' | 'rainbow' | 'rock' | 'crate' | 'ing';
// 화면에 보이는 문구에서 이모지 제거(손으로 그린 아이콘만 쓰기 위해)
const noEmoji = (t: string) => t.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\uFE0F\u200D]/gu, '').replace(/\s{2,}/g, ' ').trim();
const SPECIAL_GICON: Record<string, GIconName> = { row:'rowclear', col:'colclear', bomb:'bomb', rainbow:'allclear' };
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
  // 상하좌우 이웃이 하나도 없는 고립 칸은 스왑도 매치도 불가능 → 보드에서 제외
  const iso: [number, number][] = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++)
    if (base[r][c] && ![[r-1,c],[r+1,c],[r,c-1],[r,c+1]].some(([y,x]) => base[y]?.[x])) iso.push([r, c]);
  iso.forEach(([r, c]) => { base[r][c] = 0; });
  return base;
}

// 스테이지 난이도에 따른 장애물 배치 마스크 — 후반으로 갈수록 개수 증가
// 값: 0=없음, 1=돌(영구), 2=상자(여러 번 부숴야 열림). 15스테이지부터 일부가 상자.
// (초반 12스테이지는 0개, 이후 8스테이지마다 +1, 최대 9개). 시드 기반이라 같은 스테이지는 항상 동일 배치.
// 매치 가능한 칸 — 장애물·구멍이 아닌 칸이 가로 또는 세로로 3칸 이상 이어진 줄에 속하는지
// (젤리는 그 칸 위의 블럭이 매치로 터져야 지워지므로, 이런 칸에만 깔아야 깰 수 있어요)
function matchableMask(map: readonly (0|1)[][], obs?: readonly (0|1|2)[][]): boolean[][] {
  const ok = (r: number, c: number) => r >= 0 && r < ROWS && c >= 0 && c < COLS && !!map[r]?.[c] && !obs?.[r]?.[c];
  const m: boolean[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (!ok(r, c)) continue;
    let h = 1; for (let x = c - 1; ok(r, x); x--) h++; for (let x = c + 1; ok(r, x); x++) h++;
    let v = 1; for (let y = r - 1; ok(y, c); y--) v++; for (let y = r + 1; ok(y, c); y++) v++;
    m[r][c] = h >= 3 || v >= 3;
  }
  return m;
}
function genObstacles(i: number, map: (0|1)[][]): (0|1|2)[][] {
  const mask: (0|1|2)[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
  const count = i < 12 ? 0 : Math.min(9, 1 + Math.floor((i - 12) / 8));
  if (count === 0) return mask;
  const rnd = mulberry((i + 1) * 40503);
  const perCol: number[] = Array(COLS).fill(0);
  let placed = 0, attempts = 0;
  while (placed < count && attempts++ < 400) {
    const r = 1 + Math.floor(rnd() * (ROWS - 1));   // 맨 윗줄(0)은 비워 새 블럭 진입로 확보
    const c = Math.floor(rnd() * COLS);
    if (!map[r]?.[c] || mask[r][c]) continue;
    if (perCol[c] >= 2) continue;                   // 한 열에 최대 2개
    // 해당 열의 플레이 가능 칸 수보다 적게(최소 2칸은 색 블럭으로 남김)
    let colCells = 0; for (let rr = 0; rr < ROWS; rr++) colCells += map[rr]?.[c] ? 1 : 0;
    if (perCol[c] + 1 > colCells - 2) continue;
    mask[r][c] = (i >= 15 && rnd() < 0.45) ? 2 : 1;  // 15스테이지+부터 약 45%는 상자
    perCol[c]++; placed++;
  }
  // 상자는 옆 칸에서 매치가 일어나야 부서지므로, 이웃에 매치 가능한 칸이 없는 상자는 제거(깰 수 없는 목표 방지)
  const mm = matchableMask(map, mask);
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (mask[r][c] !== 2) continue;
    const nb = [[r-1,c],[r+1,c],[r,c-1],[r,c+1]].some(([y,x]) => mm[y]?.[x]);
    if (!nb) mask[r][c] = 0;
  }
  return mask;
}

// 미니맵(월드) 구성 — 스테이지·월드 모두 무한. 월드당 STAGES_PER_WORLD 스테이지
const STAGES_PER_WORLD = 10;

// 스테이지 설정은 번호로 그때그때 절차 생성(무한) — 블럭 종류↑, 수집 목표는 genTargets에서 생성
type LevelDef = { mode: 'time' | 'moves'; sec?: number; moves?: number; types: number; goal: readonly [number, number, number] };
const levelCache = new Map<number, LevelDef>();
function levelDef(i: number): LevelDef {
  const hit = levelCache.get(i); if (hit) return hit;
  // 난이도별 블럭 종류: 초반 4종 → 12스테이지부터 기본 5종, 5스테이지마다 오는 어려운 판은 +1종, 40스테이지 이후 +1종 (최대 6)
  const types = Math.min(6, 4 + (i >= 12 ? 1 : 0) + (i >= 5 && i % 5 === 4 ? 1 : 0) + (i >= 40 ? 1 : 0));
  const moves = 28 + ((i * 7) % 9) + ((i >= 14 && i % 4 === 3) ? 4 : 0); // 28 ~ 36 (도토리 판 +4)
  // 별 기준(목표 달성 후): goal[0] 이상 ⭐⭐, goal[1] 이상 ⭐⭐⭐ — 이동 수에 비례
  const g2 = moves * 450, g3 = moves * 800;
  const d: LevelDef = { mode: 'moves', moves, types, goal: [g2, g3, g3] };
  levelCache.set(i, d); return d;
}

// 스테이지 난이도 등급(블럭 종류 기준 — 표시용)
const difficultyOf = (idx: number): { label: string; stars: number; color: string } => {
  const t = levelDef(idx)?.types ?? 4;
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
type WorldDef = { name: string; from: number; to: number; color: string; emoji: string };
function worldOf(w: number): WorldDef {
  const t = WORLD_THEMES[w % WORLD_THEMES.length];
  const cycle = Math.floor(w / WORLD_NAMES.length);
  const name = WORLD_NAMES[w % WORLD_NAMES.length] + (cycle > 0 ? ` ${cycle + 1}` : '');
  return { name, from: w * STAGES_PER_WORLD, to: w * STAGES_PER_WORLD + STAGES_PER_WORLD, color: t.color, emoji: t.emoji };
}
// 현재 도전 스테이지 = 아직 별이 없는 첫 스테이지(진행 배열은 필요한 만큼만 길어짐)
const curStageOf = (p: readonly number[]) => { let i = 0; while ((p[i] ?? 0) >= 1) i++; return i; };
// 월드의 스테이지별 별(저장 안 된 스테이지는 0)
const worldStars = (p: readonly number[], w: WorldDef) => Array.from({ length: w.to - w.from }, (_, k) => p[w.from + k] ?? 0);

// 스테이지 첫 클리어(별3) 보상 — 하트 + 부스터 아이템
const BOOSTER_CYCLE = ['hammer', 'bomb', 'shuffle'] as const;
const stageReward = (i: number) => ({ hearts: 1, booster: BOOSTER_CYCLE[i % 3] });

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
  return Array.isArray(saved) ? saved.map(v => v ?? 0) : [];
};
const saveProg = (p: number[]) => sSet(LS_BASE, p);

const TUT_BASE = 'linydory_tutorial_v1';
// 일일 이벤트(출석·룰렛) 마지막 수령 날짜 저장 키
const ROU_BASE = 'linydory_roulette_v1';
const todayStr = () => new Date().toISOString().slice(0, 10);
const STREAK_BASE = 'linydory_streak_v1';   // 연승 횟수
const ROULETTE_PRIZES = [50, 100, 150, 200, 300, 500] as const;   // 룰렛 칸(시계방향, 맨 위부터)
const CHEST_BASE  = 'linydory_chest_v1';    // 별 보물상자 수령 횟수
const CHEST_EVERY = 30;                     // 별 30개마다 상자 1개
const loadTutorialDone = (): boolean => sGet<boolean>(TUT_BASE, false);
const saveTutorialDone = () => sSet(TUT_BASE, true);

// 시작 튜토리얼 단계
const TUTORIAL_STEPS = [
  { kind: 'intro'   as const, title: '리니와 도리의 가시소동!', desc: '같은 고슴도치 친구 블럭 3개 이상을 가로·세로로 맞추면 터져요. 화면을 채운 블럭을 터트려 점수를 모으는 퍼즐 게임이에요.' },
  { kind: 'drag'    as const, title: '① 드래그로 이동', desc: '옮길 블럭을 누른 채 바꾸고 싶은 방향(상하좌우)으로 살짝 끌면 옆 블럭과 자리가 바뀌어요. 탭해서 선택한 뒤 옆 칸을 탭해도 됩니다.' },
  { kind: 'match'   as const, title: '② 3개 맞춰 터트리기', desc: '같은 친구가 가로 또는 세로로 3개 이상 나란히 모이면 펑! 하고 터지고, 위 블럭이 내려와 빈자리를 채워요. 연쇄로 터지면 콤보 보너스!' },
  { kind: 'special' as const, title: '③ 특수 블럭 만들기', desc: '한 번에 4개 = ⚡라이트닝(가로·세로 줄 제거), 5개 이상 = 💣폭탄(주변 3×3 제거)! 2×2 정사각형으로 모아도 특수 블럭이 생겨요.' },
  { kind: 'goal'    as const, title: '④ 목표 블럭 모으기', desc: '화면 위에 보이는 목표(블럭·상자·분홍 젤리·🌰도토리)를 정해진 이동 안에 모두 달성하면 클리어! 젤리는 그 위 블럭을 터뜨리면 지워지고, 도토리는 맨 아래까지 떨어뜨리면 모아져요. 다음 스테이지가 열려요. 점수가 높을수록 별이 늘어나고, 연속 클리어하면 특수블럭을 들고 시작해요.' },
];

interface Cell { id: number; t: number; kind: TileKind; hit: boolean; hp?: number; }
type GridCell = Cell | null;
type Grid = GridCell[][];
type Phase = 'splash' | 'main' | 'worlds' | 'map' | 'play' | 'end';

let _uid = 0;
let _fid = 0;
const mk = (t: number, kind: TileKind = 'normal'): Cell => ({ id: _uid++, t, kind, hit: false });
// 장애물(돌) — 색이 없어 매치되지 않고, 인접한 블럭이 터지면 부서져요. hp만큼 맞아야 제거.
const mkRock = (hp = 1): Cell => ({ id: _uid++, t: -1, kind: 'rock', hit: false, hp });
// 상자(crate) — 여러 번 인접 매치로 부숴야 열리는 단계형 장애물
const mkCrate = (hp = 2): Cell => ({ id: _uid++, t: -2, kind: 'crate', hit: false, hp });
// 이동/매치 불가 고정 장애물(돌·상자 공통)
const isObstacle = (c: GridCell): boolean => !!c && (c.kind === 'rock' || c.kind === 'crate');
// 도토리(ing) — 매치·파괴 불가, 아래로 떨어뜨려 맨 아래(출구)에 닿으면 수집
const mkIng = (): Cell => ({ id: _uid++, t: -4, kind: 'ing', hit: false });
// 특수/부스터 효과로도 제거되지 않는 조각(돌·도토리)
const isHard = (c: GridCell): boolean => !!c && (c.kind === 'rock' || c.kind === 'ing');
// 특수블럭(라인·폭탄·레인보우)인지
const isSpecialCell = (c: GridCell): boolean => !!c && (c.kind === 'row' || c.kind === 'col' || c.kind === 'bomb' || c.kind === 'rainbow');
const rnd = (n: number) => Math.floor(Math.random() * n);
const wait = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
// 클리어 시 별 — 목표 달성 = 최소 1개, 점수 구간(goal[0]/goal[1])에 따라 2·3개
const clearStars = (score: number, goal: readonly [number,number,number]) =>
  score >= goal[1] ? 3 : score >= goal[0] ? 2 : 1;

// 수집 목표(Royal Match·애니팡4 스타일) — t: 블럭 색 인덱스(-2 = 상자), n: 모아야 할 개수
interface Target { t: number; n: number; }
interface TargetLive extends Target { left: number; }
// 스테이지 유형 — 젤리(10스테이지~, 4판마다) / 도토리 떨어뜨리기(15스테이지~, 4판마다)
const isJellyStage = (i: number) => i >= 9 && i % 4 === 1;
const isIngStage   = (i: number) => i >= 14 && i % 4 === 3;
// 젤리 배치(칸 단위) — 장애물 없는 칸에 시드 기반으로 깔기
function genJelly(i: number, map: readonly (0|1)[][], obs: readonly (0|1|2)[][]): boolean[][] {
  const jm: boolean[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
  if (!isJellyStage(i)) return jm;
  const mm = matchableMask(map, obs);   // 매치로 지울 수 있는 칸에만 젤리 배치
  const free: [number, number][] = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (mm[r][c]) free.push([r, c]);
  const want = Math.min(free.length, 6 + Math.floor(Math.min(i, 60) / 6));
  const rnd = mulberry((i + 1) * 15485863);
  for (let k = 0; k < want; k++) { const [r, c] = free.splice(Math.floor(rnd() * free.length), 1)[0]; jm[r][c] = true; }
  return jm;
}
// 도토리를 놓을 수 있는 열 — 돌·상자가 없는 열(막혀서 못 내려오는 일이 없도록)
function ingColumns(map: readonly (0|1)[][], obs: readonly (0|1|2)[][]): number[] {
  const cols: number[] = [];
  for (let c = 0; c < COLS; c++) {
    let active = 0, blocked = false;
    for (let r = 0; r < ROWS; r++) { if (map[r]?.[c]) active++; if (obs[r]?.[c]) blocked = true; }
    if (active >= 3 && !blocked) cols.push(c);
  }
  return cols;
}
function genTargets(i: number, types: number, map: readonly (0|1)[][], obs: readonly (0|1|2)[][]): Target[] {
  const r = mulberry((i + 1) * 7919);
  const special = isJellyStage(i) || isIngStage(i);
  const k = Math.max(0, (i < 15 ? 1 : i < 50 ? 2 : 3) - (special ? 1 : 0)); // 젤리/도토리 판은 색 목표 1개 줄임
  const f = 0.28 + Math.min(i, 100) / 100 * 0.27;            // 난이도 계수(완만하게 상승)
  const per = Math.max(7, Math.round(f * 130 / types));      // 색당 개수
  const pool = Array.from({ length: types }, (_, x) => x);
  const out: Target[] = [];
  for (let j = 0; j < k && pool.length; j++) out.push({ t: pool.splice(Math.floor(r() * pool.length), 1)[0], n: per });
  let crates = 0; for (const row of obs) for (const v of row) if (v === 2) crates++;
  if (crates > 0) out.push({ t: -2, n: crates });            // 상자가 있으면 '상자 부수기' 목표 추가
  let jelly = 0; for (const row of genJelly(i, map, obs)) for (const v of row) if (v) jelly++;
  if (jelly > 0) out.push({ t: -3, n: jelly });              // 젤리 지우기
  if (isIngStage(i)) {                                        // 도토리 떨어뜨리기
    const n = Math.min(ingColumns(map, obs).length, i < 30 ? 1 : i < 60 ? 2 : 3);   // 첫 도토리 판들은 1개로 쉽게 소개
    if (n > 0) out.push({ t: -4, n });
  }
  if (!out.length) out.push({ t: Math.floor(r() * types), n: per });   // 목표가 비지 않도록 안전장치
  return out;
}
const targetsForStage = (i: number) => { const m = genMap(i); return genTargets(i, levelDef(i).types, m, genObstacles(i, m)); };

// 셔플 — 색 블럭만 다시 섞고, 남아 있는 돌·상자·도토리는 제자리 유지(목표가 사라지지 않게)
function reshuffle(types: number, map: readonly (0|1)[][], old: Grid): Grid {
  let g = mkGrid(types, map);
  for (let t = 0; t < 40; t++) {
    g = mkGrid(types, map);
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const o = old[r]?.[c];
      if (o && !o.hit && (o.kind === 'rock' || o.kind === 'crate' || o.kind === 'ing')) g[r][c] = { ...o };
    }
    if (hasMoves(g)) break;
  }
  return g;
}

function mkGrid(types: number, map: readonly (0|1)[][], obMask?: readonly (0|1|2)[][]): Grid {
  const g: Grid = Array.from({ length: ROWS }, (_, r) =>
    Array.from({ length: COLS }, (_, c) =>
      map[r]?.[c] ? (obMask?.[r]?.[c] === 2 ? mkCrate(2) : obMask?.[r]?.[c] === 1 ? mkRock(1) : mk(rnd(types))) : null)
  );
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (!map[r]?.[c]) continue;
      let attempts = 0;
      while (attempts++ < 100) {
        const cell = g[r][c]; if (!cell) break;
        if (cell.kind !== 'normal') break;   // 장애물/특수 블럭은 매치 검사 제외
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
      const cur = g[r]?.[c];
      if (!cur || isObstacle(cur)) continue;        // 돌은 이동 불가
      const right = g[r]?.[c+1];
      if (c+1 < COLS && right && !isObstacle(right)) {
        const sw: Grid = g.map(row => [...row]);
        [sw[r][c], sw[r][c+1]] = [sw[r][c+1], sw[r][c]];
        if (hasAnyMatch(sw)) return true;
      }
      const down = g[r+1]?.[c];
      if (r+1 < ROWS && down && !isObstacle(down)) {
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
      const cur = g[r]?.[c];
      if (!cur || isObstacle(cur)) continue;
      const right = g[r]?.[c+1];
      if (c+1 < COLS && right && !isObstacle(right)) {
        const sw: Grid = g.map(row => [...row]);
        [sw[r][c], sw[r][c+1]] = [sw[r][c+1], sw[r][c]];
        if (hasAnyMatch(sw)) return [[r,c],[r,c+1]];
      }
      const down = g[r+1]?.[c];
      if (r+1 < ROWS && down && !isObstacle(down)) {
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
    if (cell && !isHard(cell) && !newSpec.has(key)) cell.hit=true;
  });
  newSpec.forEach((cell,key) => { const [r,c]=key.split(',').map(Number); nextG[r][c]=cell; });
  // 돌(rock)은 영구 장애물이라 제외. 상자(crate)만 인접 매치로 hp가 줄고 0이면 부서져요.
  const dmg = new Set<string>();
  for (const key of [...hits]) {
    const [r,c] = key.split(',').map(Number);
    for (const [dr,dc] of [[-1,0],[1,0],[0,-1],[0,1]] as const) {
      const nr=r+dr, nc=c+dc;
      if (nr<0||nr>=ROWS||nc<0||nc>=COLS) continue;
      const nk = `${nr},${nc}`;
      const nb = nextG[nr][nc];
      if (nb && nb.kind === 'crate' && !nb.hit && !dmg.has(nk)) {
        dmg.add(nk);
        nb.hp = (nb.hp ?? 1) - 1;
        if ((nb.hp ?? 0) <= 0) { nb.hit = true; hits.add(nk); }  // 다 부서짐 → 제거
      }
    }
  }
  return { hits, newSpec, nextG };
}

function applyFall(g: Grid, types: number, map: readonly (0|1)[][]): Grid {
  const n: Grid = g.map(row => row.map(cell => cell ? {...cell, hit:false} : null));
  for (let c = 0; c < COLS; c++) {
    const activeRows: number[] = [];
    for (let r=ROWS-1; r>=0; r--) if (map[r]?.[c]) activeRows.push(r);   // 아래→위
    if (!activeRows.length) continue;
    // 부서지지 않은 돌(rock)은 제자리에 고정되어 낙하 경계가 된다.
    const settle = (rows: number[]) => {
      if (!rows.length) return;
      const keep: Cell[] = [];
      for (const r of rows) { const cell = g[r][c]; if (cell && !cell.hit) keep.push({...cell, hit:false}); }
      for (let i=0; i<rows.length; i++) n[rows[i]][c] = i < keep.length ? keep[i] : mk(rnd(types));
    };
    let seg: number[] = [];
    for (const r of activeRows) {
      const cell = g[r][c];
      if (cell && isObstacle(cell) && !cell.hit) {  // 고정 장애물(돌·상자) = 경계
        settle(seg); seg = [];
        n[r][c] = {...cell, hit:false};
      } else {
        seg.push(r);                                    // 색 블럭/빈칸/부서진 돌 → 낙하 대상
      }
    }
    settle(seg);
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
    0%,100% { transform:scale(1.04); filter:drop-shadow(0 0 6px rgba(255,240,60,0.6)); }
    50%      { transform:scale(1.14); filter:drop-shadow(0 0 14px rgba(255,240,60,1)) drop-shadow(0 0 5px #ffc800); }
  }
  @keyframes homeBreath {
    0%,100% { transform:scale(1) translateY(0); }
    50%      { transform:scale(1.02) translateY(-7px); }
  }
  @keyframes homeStage {
    0%,100% { transform:scale(1); }
    50%      { transform:scale(1.04); }
  }
  @keyframes specialPulse {
    0%,100% { transform:scale(1); }
    50%      { transform:scale(1.07); }
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
  @keyframes idleBob {
    0%,100% { transform:translateY(0); }
    50%     { transform:translateY(-5px); }
  }
  @keyframes bgDrift {
    0%   { transform:scale(1.12) translate(0,0); }
    50%  { transform:scale(1.18) translate(-1.6%, -1.1%); }
    100% { transform:scale(1.12) translate(0,0); }
  }
  @keyframes petalFall {
    0%   { transform:translateY(-10%) translateX(0) rotate(0deg); opacity:0; }
    10%  { opacity:0.85; }
    90%  { opacity:0.85; }
    100% { transform:translateY(88vh) translateX(var(--px,24px)) rotate(400deg); opacity:0; }
  }
  @keyframes twinkle {
    0%,100% { opacity:0.15; transform:scale(0.6); }
    50%     { opacity:1; transform:scale(1.2); }
  }
  @keyframes avatarPop {
    0%,100% { transform:translateY(0) rotate(0deg); }
    25%     { transform:translateY(-4px) rotate(-3deg); }
    75%     { transform:translateY(-2px) rotate(3deg); }
  }
  @keyframes popIn {
    0%   { opacity:0; transform:scale(0.8) translateY(12px); }
    60%  { opacity:1; transform:scale(1.04) translateY(-2px); }
    100% { opacity:1; transform:scale(1) translateY(0); }
  }
  @keyframes badgeBounce {
    0%,100% { transform:translateY(0); }
    50%     { transform:translateY(-2px); }
  }
  @keyframes screenFlash {
    0%   { opacity:0; }
    30%  { opacity:1; }
    100% { opacity:0; }
  }
  @keyframes cloudDrift {
    0%   { transform:translateX(-6px); }
    50%  { transform:translateX(10px); }
    100% { transform:translateX(-6px); }
  }
  @keyframes tileIdle {
    0%,100% { transform:rotate(0deg); }
    50%     { transform:rotate(1.6deg); }
  }
  @keyframes spinCoin {
    0%   { transform:rotateY(0deg) scale(1); }
    80%  { transform:rotateY(1400deg) scale(1.1); }
    100% { transform:rotateY(1440deg) scale(1); }
  }
  @keyframes selectPop {
    0%   { transform:scale(1); }
    55%  { transform:scale(1.3); }
    100% { transform:scale(1.15); }
  }
  @keyframes vignettePulse {
    0%,100% { opacity:0.5; }
    50%     { opacity:1; }
  }
  @keyframes feverBadge {
    0%   { opacity:0; transform:scale(0.4) rotate(-10deg); }
    45%  { opacity:1; transform:scale(1.25) rotate(4deg); }
    70%  { transform:scale(0.95) rotate(-2deg); }
    100% { opacity:1; transform:scale(1) rotate(0deg); }
  }
  @keyframes feverBanner {
    0%,100% { transform:scale(1); filter:hue-rotate(0deg); }
    50%     { transform:scale(1.06); filter:hue-rotate(20deg); }
  }
  @keyframes ingDrop {
    0%   { transform:translateY(0) scale(1); opacity:1; }
    60%  { transform:translateY(35%) scale(1.15); opacity:1; }
    100% { transform:translateY(90%) scale(0.4); opacity:0; }
  }
  @keyframes scorePopUp {
    0%   { opacity:0; transform:translate(-50%,-50%) scale(0.6); }
    25%  { opacity:1; transform:translate(-50%,-72%) scale(1.15); }
    100% { opacity:0; transform:translate(-50%,-150%) scale(0.9); }
  }
`;

// 레퍼런스처럼 살짝 흐릿한 잔디·언덕 풍경 — 이미지 파일 없이 직접 그린 배경
function PlayBackdrop() {
  return (
    <svg aria-hidden viewBox="0 0 100 200" preserveAspectRatio="xMidYMid slice" style={{ position:'absolute', inset:0, width:'100%', height:'100%', zIndex:0, filter:'blur(2.2px)', transform:'scale(1.05)' }}>
      <defs>
        <linearGradient id="pb-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#4FAEEE" /><stop offset="0.5" stopColor="#8FD3F7" /><stop offset="1" stopColor="#CFEFFF" /></linearGradient>
        <linearGradient id="pb-g1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#9BD97A" /><stop offset="1" stopColor="#6DB852" /></linearGradient>
        <linearGradient id="pb-g2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#78C95B" /><stop offset="1" stopColor="#4F9E3B" /></linearGradient>
        <linearGradient id="pb-g3" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#5DB045" /><stop offset="1" stopColor="#3F8A32" /></linearGradient>
        <linearGradient id="pb-dirt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#C9985B" /><stop offset="1" stopColor="#A6733B" /></linearGradient>
      </defs>
      <rect width="100" height="200" fill="url(#pb-sky)" />
      <g style={{ animation:'cloudDrift 60s linear infinite' }} fill="#fff" opacity="0.9">
        <ellipse cx="18" cy="28" rx="17" ry="5.5" /><ellipse cx="28" cy="24" rx="11" ry="6" /><ellipse cx="66" cy="20" rx="15" ry="4.8" /><ellipse cx="74" cy="17" rx="9" ry="5" /><ellipse cx="86" cy="46" rx="13" ry="4" />
      </g>
      <path d="M0 100C18 86 38 96 58 88S90 90 100 82V200H0z" fill="url(#pb-g1)" />
      <g fill="#4E9B44" opacity="0.8"><circle cx="12" cy="94" r="4.6" /><circle cx="20" cy="92" r="3.6" /><circle cx="82" cy="86" r="4.2" /><circle cx="90" cy="84" r="3.4" /></g>
      <path d="M0 126C26 108 56 122 100 104V200H0z" fill="url(#pb-g2)" />
      <path d="M0 152C30 142 70 150 100 140V200H0z" fill="url(#pb-g3)" />
      <path d="M0 182C30 178 70 184 100 178V200H0z" fill="url(#pb-dirt)" />
      <g opacity="0.95">
        {[[10,166,'#FF8FB8'],[22,172,'#FFE066'],[38,168,'#fff'],[58,170,'#FF8FB8'],[74,164,'#FFE066'],[90,170,'#fff'],[16,190,'#FF8FB8'],[84,191,'#FFE066']].map(([x,y,c],i) => <circle key={i} cx={x as number} cy={y as number} r="1.6" fill={c as string} />)}
      </g>
    </svg>
  );
}

export default function LinyDoryGame() {
  // 플레이 화면 배율 — 360px 폭 기준으로 설계, 넓은 화면(태블릿·넓은 인앱 브라우저)에서는 HUD·아이템이 비례해 커져요
  const [uiK, setUiK] = useState(() => Math.min(1.6, Math.max(1, (document.getElementById('root')?.clientWidth || 360) / 360)));
  useEffect(() => {
    const on = () => setUiK(Math.min(1.6, Math.max(1, (document.getElementById('root')?.clientWidth || 360) / 360)));
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  const [phase, setPhase]         = useState<Phase>(import.meta.env.DEV ? 'main' : 'splash');
  const [loadPct, setLoadPct]     = useState(0);
  const [lvlIdx, setLvlIdx]       = useState(0);
  const [progress, setProgress]   = useState<number[]>(loadProg);
  const [grid, setGrid]           = useState<Grid>(() => mkGrid(levelDef(0).types, genMap(0)));
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
  const [flash, setFlash] = useState<{id:number;color:string}|null>(null); // 콤보 컬러 플래시
  const [scorePops, setScorePops] = useState<{id:number;r:number;c:number;text:string;big:boolean}[]>([]); // 위치별 점수 팝업
  const [confetti, setConfetti]   = useState<{id:number;left:number;delay:number;color:string;e:string}[]>([]);
  const [coinsEarned, setCoinsEarned] = useState(0);
  const [muted, setMutedState]    = useState(isMuted());
  const [floats, setFloats]       = useState<{id:number;text:string}[]>([]);
  const [hintPair, setHintPair]   = useState<[[number,number],[number,number]]|null>(null);
  const [nearMiss, setNearMiss]   = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [tutStep, setTutStep]     = useState(0);
  const [tutorialPlay, setTutorialPlay] = useState(false); // 실제 플레이 가이드 진행 중
  const [tutMatches, setTutMatches] = useState(0);
  const [lifeFly, setLifeFly]     = useState(false); // 하트 소모 시 날아가는 임팩트
  const [lifeLossToast, setLifeLossToast] = useState(false); // 스테이지 시작 시 하트 감소 강조(3초)
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
  const [showExit,    setShowExit]    = useState(false);
  const [stagePopup,  setStagePopup]  = useState<number|null>(null); // 시작 전 아이템 선택 팝업(스테이지 인덱스)
  const [showRoulette, setShowRoulette] = useState(false);
  const [targets, setTargets] = useState<TargetLive[]>([]);           // 수집 목표(남은 개수)
  const [goalsDone, setGoalsDone] = useState(false);
  const [jelly, setJelly] = useState<boolean[][]>([]);               // 젤리 칸
  const [streak, setStreak] = useState<number>(() => sGet<number>(STREAK_BASE, 0));
  const [chestClaimed, setChestClaimed] = useState<number>(() => sGet<number>(CHEST_BASE, 0));
  const [preBoost, setPreBoost] = useState<BoosterKind[]>([]);        // 시작 전 선택한 부스터
  const [rouletteSpin, setRouletteSpin] = useState(false);
  const [rouletteWin,  setRouletteWin]  = useState<number|null>(null);
  const [wheelRot,     setWheelRot]     = useState(0);   // 룰렛 바퀴 회전각
  const [showShop,    setShowShop]    = useState(false);
  const [showSettings,setShowSettings]= useState(false);
  const [shopTab,     setShopTab]     = useState<'coin'|'cash'>('coin');
  const [pay,         setPay]         = useState<{label:string;cash:number;onDone:()=>void}|null>(null);
  const [payStage,    setPayStage]    = useState<'confirm'|'processing'|'done'>('confirm');
  const [account,     setAccount]     = useState<string>(getAccountLabel());

  const gRef     = useRef<Grid>(grid);
  const scoreRef = useRef(0);
  const lvlRef   = useRef(0);
  const movesRef = useRef(0);
  const mapRef   = useRef<readonly (0|1)[][]>(genMap(0));
  const obstacleRef = useRef<readonly (0|1|2)[][]>(genObstacles(0, genMap(0)));
  const freeStartRef = useRef<number | null>(null);  // 클리어 직후 다음 스테이지 1회 무료 시작
  const popT     = useRef<ReturnType<typeof setTimeout>|null>(null);
  const hintTmr  = useRef<ReturnType<typeof setTimeout>|null>(null);
  // 연쇄 처리는 단일 리졸버가 항상 최신 보드(gRef)를 읽어 진행 — 입력은 잠그지 않음
  const resolvingRef = useRef(false);        // 리졸버 중복 실행 방지
  const dirtyRef     = useRef(false);        // 애니메이션 도중 새 스왑이 커밋되면 표시
  const comboRef     = useRef(0);            // 리졸버 세션 동안 누적 콤보
  const targetsRef   = useRef<TargetLive[]>([]);
  const goalsDoneRef = useRef(false);
  const jellyRef     = useRef<boolean[][]>([]);
  const preBoostRef  = useRef<BoosterKind[]>([]);
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
  const worldScrollRef     = useRef<HTMLDivElement>(null); // 홈 월드 목록 스크롤

  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { boostersRef.current = boosters; }, [boosters]);
  // 스테이지 선택 진입 시 현재 도전 스테이지가 보이도록 스크롤
  useEffect(() => {
    if (phase === 'map' && mapScrollRef.current) {
      const cur = curStageOf(progress);
      const w = worldOf(selectedWorld);
      const local = Math.max(0, Math.min(w.to - w.from - 1, cur - w.from));
      mapScrollRef.current.scrollTop = Math.max(0, local * MAP_ROW_GAP + 60 - 220);
    }
  }, [phase, progress, selectedWorld]);

  // 홈 진입 시 현재 도전 중인 월드가 보이도록 스크롤(월드가 무한히 늘어남)
  useEffect(() => {
    if (phase !== 'worlds') return;
    const el = worldScrollRef.current?.querySelector('[data-curworld]') as HTMLElement | null;
    if (el && worldScrollRef.current) worldScrollRef.current.scrollTop = Math.max(0, el.offsetTop - worldScrollRef.current.clientHeight / 2 + el.clientHeight / 2);
  }, [phase]);

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
    const gain = n;
    scoreRef.current += gain;
    setScore(scoreRef.current);
    const fid = ++_fid;
    const label = gain >= 1000 ? `+${(gain/1000).toFixed(1)}K` : `+${gain}`;
    setFloats(p => [...p.slice(-5), { id: fid, text: label }]);
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

  // 매칭 위치에서 위로 떠오르는 점수/콤보 팝업
  const spawnScorePop = useCallback((r: number, c: number, text: string, big = false) => {
    const id = ++_fid;
    setScorePops(p => [...p.slice(-8), { id, r, c, text, big }]);
    setTimeout(() => setScorePops(p => p.filter(s => s.id !== id)), 900);
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
    const playing = phase === 'main' || phase === 'worlds' || phase === 'map' || phase === 'play';
    if (playing && !muted) startBgm();
    else stopBgm();
    return () => stopBgm();
  }, [phase, muted]);

  // 오디오 잠금 해제(첫 제스처) — 게임 중이면 BGM 시작
  useEffect(() => {
    const unlock = () => { primeAudio(); const p = phaseRef.current; if ((p === 'main' || p === 'worlds' || p === 'map' || p === 'play') && !isMuted()) startBgm(); };
    window.addEventListener('pointerdown', unlock);
    return () => window.removeEventListener('pointerdown', unlock);
  }, []);

  // 로그인(계정 전환)으로 스코프가 바뀌면 계정별 저장 데이터를 다시 불러옴
  useEffect(() => {
    const onScope = () => {
      setAccount(getAccountLabel());
      setStreak(sGet<number>(STREAK_BASE, 0)); setChestClaimed(sGet<number>(CHEST_BASE, 0));
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
    const li = lvlRef.current;
    const done = goalsDoneRef.current;
    const s = done ? clearStars(scoreRef.current, levelDef(li).goal) : 0;
    const remain = targetsRef.current.reduce((a, x) => a + Math.max(0, x.left), 0);
    const total  = targetsRef.current.reduce((a, x) => a + x.n, 0);
    setNearMiss(!done && total > 0 && remain <= Math.max(3, Math.ceil(total * 0.2)));
    // 연승: 클리어하면 +1, 실패하면 0 (다음 판 시작 시 특수블럭 보너스)
    const ns = s >= 1 ? sGet<number>(STREAK_BASE, 0) + 1 : 0;
    sSet(STREAK_BASE, ns); setStreak(ns);
    // 클리어 시 다음 스테이지는 하트 차감 없이 시작할 수 있도록 무료 토큰 부여
    freeStartRef.current = s >= 1 ? li + 1 : null;
    // 일일 퀘스트 집계 반영
    questAddBlocks(sessionBlocksRef.current);     sessionBlocksRef.current = 0;
    questAddSpecials(sessionSpecialsRef.current); sessionSpecialsRef.current = 0;
    if (s >= 1) questAddGameCleared();
    setQuests(loadQuests());
    // 클리어 보상 코인 — 기록 갱신이면 전액, 재도전이면 25%
    const prevStars = progress[li] ?? 0;
    let earned: number = CLEAR_COINS[s];
    if (s > 0 && s <= prevStars) earned = Math.floor(earned * 0.25);
    if (s > 0 && prevStars === 0) earned += FIRST_CLEAR_BONUS;
    setCoinsEarned(earned);
    if (earned > 0) { addCoins(earned); setTimeout(() => sfx.coin(), 500); }
    // 첫 클리어 보상: 하트 + 부스터 아이템
    if (s >= 1 && prevStars < 1) {
      const rw = stageReward(li);
      addLives(rw.hearts); setLives(loadLives());
      setBoosters(prev => { const next={...prev, [rw.booster]: prev[rw.booster]+1}; saveBoosters(next); return next; });
    }
    // 승리/패배 사운드 & 색종이
    if (s > 0) {
      sfx.win(); haptic.success();
      // 별이 하나씩 켜질 때마다 '딩' 소리
      for (let i = 0; i < s; i++) setTimeout(() => { sfx.ding(i); buzz(18); }, 350 + i * 450);
      const palette = ['#FFD700','#FF6F00','#42A5F5','#66BB6A','#E040FB','#FF5252'];
      setConfetti(Array.from({ length: 26 }, (_, i) => ({
        id: i, left: Math.random()*100, delay: Math.random()*0.5,
        color: palette[i % palette.length], e: ['🎉','✨','⭐','🎊'][i % 4],
      })));
    } else { sfx.lose(); setConfetti([]); }
    setProgress(prev => { const next=[...prev]; while (next.length <= li) next.push(0); if (s>next[li]) next[li]=s; saveProg(next); return next; });
    setPhase('end');
  }, [clearHint, progress]);

  // 클리어 피날레 — 남은 이동 횟수가 빛처럼 날아와 블럭을 터트려 점수에 합산
  const runFinale = useCallback(async () => {
    resolvingRef.current = true;
    pausedRef.current = true;   // 목표 달성 — 타이머 멈춤

    const leftover = Math.max(0, movesRef.current);
    movesRef.current = 0;
    let remain = leftover;   // 화면의 남은 이동 — 하나 터질 때마다 1씩 줄어듦
    setMovesLeft(remain);
    if (leftover > 0) { pop(`🎉 남은 ${leftover}수 보너스!`, 'special'); sfx.special(); await wait(450); }
    while (remain > 0 && phaseRef.current === 'play') {
      const g = gRef.current;
      const cells: [number,number][] = [];
      for (let r=0;r<ROWS;r++) for (let c=0;c<COLS;c++) { const cc=g[r][c]; if (cc && !cc.hit && !isHard(cc)) cells.push([r,c]); }
      if (!cells.length) break;
      const [r,c] = cells[Math.floor(Math.random()*cells.length)];
      spawnLights([`${r},${c}`]); spawnSparks([`${r},${c}`]); // 빛이 위에서 블럭으로 날아옴
      sfx.swap();
      await wait(180);
      remain--; setMovesLeft(remain);
      const ng = g.map(row => row.map(x => x ? {...x} : null));
      if (ng[r][c]) ng[r][c]!.hit = true;
      push(ng); inc(300); sfx.pop(4); spawnDust([`${r},${c}`], g); buzz(8);  // 가루 터짐(#1과 동일)
      await wait(Math.max(60, 150 - leftover*4));
    }
    setMovesLeft(0);
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

  // 자동 셔플 감시 — 보드가 안정된 뒤 터트릴 수 있는 블럭(이동)이 하나도 없으면 자동으로 섞는다
  useEffect(() => {
    if (phase !== 'play') return;
    const id = setTimeout(() => {
      if (phaseRef.current !== 'play') return;
      if (resolvingRef.current || pausedRef.current) return;   // 연쇄 중/일시정지 중엔 대기
      if (tutorialPlayRef.current) return;                     // 튜토리얼 중엔 셔플 안 함
      if (anyHit(gRef.current)) return;                        // 아직 터지는 칸이 있으면 대기
      if (hasMoves(gRef.current)) return;                      // 움직일 수 있으면 OK
      // 터트릴 수 있는 블럭이 없음 → 자동 셔플. 셔플 후에는 장애물을 다시 만들지 않음
      const types = levelDef(lvlRef.current).types;
      const g = reshuffle(types, mapRef.current, gRef.current);
      if (!hasMoves(g)) return;   // 어떤 배치로도 움직임이 없는 맵이면 무한 셔플 방지(보류)
      pop('🔀 섞을 블럭이 없어 자동 셔플!', 'special');
      sfx.click();
      push(g);
      scheduleHint();
    }, 650);
    return () => clearTimeout(id);
  }, [grid, phase, push, pop, scheduleHint]);

  // 이어하기 수락 — 코인 차감 후 시간/이동 보충하고 재개
  const acceptContinue = useCallback(() => {
    const cost = CONTINUE_COSTS[continuesUsedRef.current];
    if (cost > 0 && !spendCoins(cost)) { pop('🪙 코인이 부족해요!', 'special'); setShowShop(true); return; }
    if (cost > 0) setCoins(loadCoins());
    continuesUsedRef.current++; setContinuesUsed(c => c+1);
    // 이동 +5 보충 후 재개 (시간 제한 없음 — 이동 횟수만 사용)
    movesRef.current += CONTINUE_MOVES; setMovesLeft(movesRef.current);
    pop(`▶ 이동 +${CONTINUE_MOVES}!`, 'special');
    setContinueOffer(false);
    pausedRef.current = false;
    sfx.coin();
    scheduleHint();
  }, [pop, scheduleHint]);

  const declineContinue = useCallback(() => {
    setContinueOffer(false);
    pausedRef.current = false;
    endGame();
  }, [endGame]);

  // 안드로이드 하드웨어/내비게이션 뒤로가기 처리
  //   열린 오버레이 닫기 → 게임 중 일시정지 토글 → 맵 → 메인 → 앱 종료 순으로 단계적 처리
  const backHandlerRef = useRef<() => void>(() => {});
  backHandlerRef.current = () => {
    sfx.click();
    if (showExit)      { setShowExit(false); return; }
    if (stagePopup !== null) { setStagePopup(null); return; }
    if (showRoulette)  { setShowRoulette(false); return; }
    if (showShop)      { setShowShop(false); return; }
    if (showSettings)  { setShowSettings(false); return; }
    if (showQuests)    { setShowQuests(false); return; }
    if (continueOffer) { declineContinue(); return; }
    const p = phaseRef.current;
    if (p === 'play') {
      if (showPause) { pausedRef.current = false; setShowPause(false); }
      else           { pausedRef.current = true;  setShowPause(true); }
      return;
    }
    if (p === 'map')  { setPhase('worlds'); return; }
    if (p === 'worlds') { setPhase('main'); return; }
    if (p === 'main') { setShowExit(true); return; }   // 메인에서 뒤로가기 → 종료 확인 모달(검수 필수)
  };
  useEffect(() => {
    const off = onBackEvent(() => backHandlerRef.current());
    return off;
  }, []);

  // 세로 방향 고정(앱 진입 시 1회)
  useEffect(() => { lockPortrait(); }, []);

  // 게임 플레이 중에는 화면이 꺼지지 않도록 유지, 벗어나면 복구
  useEffect(() => {
    keepScreenAwake(phase === 'play');
    return () => { keepScreenAwake(false); };
  }, [phase]);

  useEffect(() => {
    if (phase !== 'play') { clearHint(); }
  }, [phase, clearHint]);

  const startLevel = useCallback((idx: number) => {
    const lvl = levelDef(idx);
    const map = genMap(idx);
    mapRef.current = map;
    const obs = genObstacles(idx, map);
    obstacleRef.current = obs;
    _uid = 0;
    let g = mkGrid(lvl.types, map, obs);
    for (let t = 0; t < 30 && !hasMoves(g); t++) g = mkGrid(lvl.types, map, obs); // 시작 보드는 움직임 보장
    // 수집 목표
    const tg: TargetLive[] = genTargets(idx, lvl.types, map, obs).map(x => ({ ...x, left: x.n }));
    targetsRef.current = tg; setTargets(tg); goalsDoneRef.current = false; setGoalsDone(false);
    const jm = genJelly(idx, map, obs); jellyRef.current = jm; setJelly(jm);
    // 도토리: 돌·상자 없는 열의 맨 위 칸에 배치
    const ingT = tg.find(x => x.t === -4);
    if (ingT) {
      const cols = ingColumns(map, obs);
      for (let k = 0; k < ingT.n && cols.length; k++) {
        const c = cols.splice(Math.floor(Math.random() * cols.length), 1)[0];
        const act: number[] = []; for (let r = 0; r < ROWS; r++) if (map[r]?.[c]) act.push(r);
        const r = act[Math.floor(act.length / 2)];             // 열의 가운데쯤에서 시작(떨어뜨릴 거리 단축)
        if (r !== undefined) g[r][c] = mkIng();
      }
    }
    // 연승 보너스(1: 라인, 2: +폭탄, 3: +레인보우) + 시작 전 선택한 부스터 → 시작 시 특수블럭 배치
    const bonus: TileKind[] = (['row', 'bomb', 'rainbow'] as TileKind[]).slice(0, Math.min(3, sGet<number>(STREAK_BASE, 0)));
    const pb = preBoostRef.current; preBoostRef.current = [];
    const PB_KIND: Partial<Record<BoosterKind, TileKind>> = { rowClear: 'row', colClear: 'col', bomb: 'bomb', allClear: 'rainbow' };
    pb.forEach(k => { const tk = PB_KIND[k]; if (tk) bonus.push(tk); });
    if (pb.length) setBoosters(prev => { const next = { ...prev }; pb.forEach(k => { next[k] = Math.max(0, next[k] - 1); }); saveBoosters(next); return next; });
    if (bonus.length) {
      const cand: [number, number][] = [];
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) { const x = g[r][c]; if (x && x.kind === 'normal') cand.push([r, c]); }
      bonus.forEach(kd => { if (!cand.length) return; const [r, c] = cand.splice(Math.floor(Math.random() * cand.length), 1)[0]; g[r][c] = mk(g[r][c]!.t, kd); });
    }
    gRef.current=g; scoreRef.current=0; lvlRef.current=idx;
    resolvingRef.current=false; dirtyRef.current=false; comboRef.current=0;
    lastSwapRef.current=null; dragRef.current=null;
    continuesUsedRef.current=0; pausedRef.current=false;
    sessionBlocksRef.current=0; sessionSpecialsRef.current=0;
    tutorialPlayRef.current=false; setTutorialPlay(false); setTutMatches(0); tutMatchesRef.current=0;
    setFlames([]); setSparks([]); setDust([]); setLights([]); setScreenShake(false); setConfetti([]); setCoinsEarned(0);
    setContinuesUsed(0); setContinueOffer(false); setBlocksPopped(0);
    // 콤보음 초기화
    setScorePops([]); resetComboPitch();
    primeAudio();
    const mv = (lvl as {moves?:number}).moves ?? 0; movesRef.current=mv;
    setLvlIdx(idx); setGrid(g); setScore(0); setTime((lvl as {sec?:number}).sec ?? 0);
    setMovesLeft(mv); setSel(null); setPopup(null); setFloats([]);
    setNearMiss(false);
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
    // 클리어 직후 '다음 스테이지'는 하트 차감 없이 시작
    if (freeStartRef.current === idx) {
      freeStartRef.current = null;
      startLevel(idx);
      return;
    }
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

  // 터진 칸을 수집 목표에 반영 — 낙하(applyFall)로 사라지기 직전에 호출
  const collectHits = useCallback((g: Grid) => {
    const cur = targetsRef.current;
    if (!cur.length || goalsDoneRef.current) return;
    const next = cur.map(x => ({ ...x }));
    let changed = false, jChanged = false;
    const jm = jellyRef.current.map(row => [...row]);
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const cell = g[r]?.[c];
      if (!cell || !cell.hit || cell.kind === 'rock') continue;
      const tg = next.find(x => x.t === cell.t && x.left > 0);
      if (tg) { tg.left--; changed = true; }
      // 젤리 칸 위의 블럭이 터지면 젤리 제거(도토리 도착은 제외)
      if (cell.kind !== 'ing' && jm[r]?.[c]) {
        jm[r][c] = false; jChanged = true;
        const jt = next.find(x => x.t === -3 && x.left > 0);
        if (jt) { jt.left--; changed = true; }
      }
    }
    if (jChanged) { jellyRef.current = jm; setJelly(jm); }
    if (!changed) return;
    targetsRef.current = next; setTargets(next);
    if (next.every(x => x.left <= 0)) {
      goalsDoneRef.current = true; setGoalsDone(true);
      pausedRef.current = true;               // 목표 달성 → 입력·타이머 정지 후 피날레
      pop('🎯 목표 달성!', 'special');
    }
  }, [pop]);

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
            collectHits(gRef.current); push(applyFall(gRef.current, levelDef(lvlRef.current).types, mapRef.current));
            await wait(200);
            continue;
          }
          // 도토리가 출구(열의 맨 아래 2칸 안, 또는 바로 아래가 돌)에 닿으면 수집
          { let arrived: [number, number][] = [];
            for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
              const x = g[r]?.[c]; if (!x || x.kind !== 'ing' || x.hit) continue;
              let below = 0; for (let rr = r + 1; rr < ROWS; rr++) if (mapRef.current[rr]?.[c]) below++;
              let nb = r + 1; while (nb < ROWS && !mapRef.current[nb]?.[c]) nb++;
              if (below <= 1 || g[nb]?.[c]?.kind === 'rock') arrived.push([r, c]);
            }
            if (arrived.length) {
              const ng = g.map(row => row.map(x => x ? { ...x } : null));
              arrived.forEach(([r, c]) => { ng[r][c]!.hit = true; spawnScorePop(r, c, '+500', true); spawnSparks([`${r},${c}`]); });
              push(ng); inc(500 * arrived.length); sfx.coin(); haptic.medium();
              arrived = [];
              continue;
            } }
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
          // 매칭 위치에 점수/콤보 팝업
          { const arr=[...res.hits]; if (arr.length) { const [mr,mc]=arr[Math.floor(arr.length/2)].split(',').map(Number); const shown = pts>=1000 ? `${(pts/1000).toFixed(1)}K` : `${pts}`; spawnScorePop(mr, mc, combo>=2 ? `${combo}x +${shown}` : `+${shown}`, combo>=4); } }
          // 사운드/햅틱
          sfx.pop(combo); if (combo >= 4) haptic.medium(); else haptic.light();
          if (combo >= 4) kickScreen();
          if (res.newSpec.size > 0) {
            const k = [...res.newSpec.values()][0].kind;
            sfx.special();
            pop(`${SPECIAL_ICON[k] ?? '✨'} 특수 블럭 생성!`, 'special');
          } else if (combo >= 2) {
            sfx.combo(combo);
            const grade = combo>=8 ? 'AMAZING!' : combo>=6 ? 'EXCELLENT!' : combo>=4 ? 'GREAT!' : `${combo}x COMBO!`;
            pop(`${grade} +${pts.toLocaleString()}`, combo>=4 ? 'special' : 'combo');
            if (combo>=4) {
              const fc = combo>=8 ? 'rgba(255,193,7,0.5)' : combo>=6 ? 'rgba(186,104,255,0.45)' : 'rgba(66,165,245,0.4)';
              const fid = ++_fid; setFlash({ id:fid, color:fc });
              setTimeout(() => setFlash(f => f?.id===fid ? null : f), 420);
            }
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
          collectHits(gRef.current); push(applyFall(gRef.current, levelDef(lvlRef.current).types, mapRef.current));
          await wait(200);
        }
        // 막힌 보드면 셔플(완전히 정착된 뒤에만) — 움직임이 생기는 보드가 나올 때까지 재생성
        if (phaseRef.current === 'play' && !anyHit(gRef.current) && !hasMoves(gRef.current)) {
          pop('🔀 셔플!', 'special');
          await wait(700);
          const types = levelDef(lvlRef.current).types;
          const g = reshuffle(types, mapRef.current, gRef.current);   // 남은 장애물·도토리는 유지(부서진 건 재생성 안 함)
          push(g);
        }
        if (!dirtyRef.current) break; // 애니메이션 도중 새 입력이 없었으면 종료
      }
    } finally {
      comboRef.current = 0;
      resolvingRef.current = false;
    }
    if (phaseRef.current === 'play') {
      // 수집 목표 달성 → 스테이지 클리어(남은 이동은 피날레 보너스)
      if (goalsDoneRef.current) {
        if (!tutorialPlayRef.current && movesRef.current > 0) { runFinale(); return; }
        endGame(); return;
      }
      if (levelDef(lvlRef.current).mode === 'moves' && movesRef.current <= 0) { outOfResource(); return; }
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
    if (isObstacle(a) || isObstacle(b)) return; // 장애물(돌·상자)은 이동 불가
    const sw: Grid = g.map(row => row.map(x => x ? {...x} : null));
    [sw[sr][sc], sw[r][c]] = [sw[r][c], sw[sr][sc]];
    const srcSpec = isSpecialCell(sw[r][c]);
    const dstSpec = isSpecialCell(sw[sr][sc]);
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
    if (levelDef(lvlRef.current).mode === 'moves') {
      movesRef.current = Math.max(0, movesRef.current-1);
      setMovesLeft(movesRef.current);
    }
    sfx.swap(); buzz(8);
    // 특수 블럭이 관여하면 매치 여부와 무관하게 항상 즉시 발동
    if (srcSpec && dstSpec) {
      // 두 특수블럭 조합 → 초대형 효과
      const ka = sw[r][c]?.kind, kb = sw[sr][sc]?.kind;
      const set = new Set<string>();
      const add = (rr:number, cc:number) => { const t=sw[rr]?.[cc]; if (rr>=0&&rr<ROWS&&cc>=0&&cc<COLS&&t&&!isHard(t)) set.add(`${rr},${cc}`); };
      const both = (x:TileKind, y:TileKind) => (ka===x&&kb===y)||(ka===y&&kb===x);
      if (ka==='rainbow'||kb==='rainbow') {
        for (let y=0;y<ROWS;y++) for (let x=0;x<COLS;x++) add(y,x);            // 레인보우 조합 → 전체 제거
      } else if (ka==='bomb'&&kb==='bomb') {
        for (let dr=-2;dr<=2;dr++) for (let dc=-2;dc<=2;dc++) add(r+dr,c+dc);  // 폭탄+폭탄 → 5x5
      } else if (both('bomb','row')||both('bomb','col')) {
        for (let x=0;x<COLS;x++){ add(r-1,x); add(r,x); add(r+1,x); }          // 폭탄+라인 → 3줄 십자
        for (let y=0;y<ROWS;y++){ add(y,c-1); add(y,c); add(y,c+1); }
      } else {
        for (let x=0;x<COLS;x++) add(r,x);                                     // 라인 조합 → 십자
        for (let y=0;y<ROWS;y++) add(y,c);
        if (ka==='row'&&kb==='row') for (let x=0;x<COLS;x++){ add(r-1,x); add(r+1,x); }
        if (ka==='col'&&kb==='col') for (let y=0;y<ROWS;y++){ add(y,c-1); add(y,c+1); }
      }
      set.forEach(key => { const [rr,cc]=key.split(',').map(Number); const cell=sw[rr][cc]; if(cell&&!isHard(cell)) cell.hit=true; });
      inc(set.size*150);
      setBlocksPopped(n => n + set.size); sessionBlocksRef.current += set.size;
      spawnFlames(set); spawnDust([...set], sw); kickScreen(); sfx.explode(); haptic.heavy();
      const fid=++_fid; setFlash({ id:fid, color:'rgba(255,120,0,0.5)' }); setTimeout(()=>setFlash(f=>f?.id===fid?null:f),460);
      pop('💥 초대형 폭발!', 'special');
    } else if (srcSpec || dstSpec) {
      const hits = new Set<string>();
      if (srcSpec) hits.add(`${r},${c}`);
      if (dstSpec) hits.add(`${sr},${sc}`);
      expandSpecials(hits, sw);
      hits.forEach(key => { const [rr,cc]=key.split(',').map(Number); const cell=sw[rr][cc]; if(cell&&!isHard(cell)) cell.hit=true; });
      inc(hits.size*120);
      setBlocksPopped(n => n + hits.size); sessionBlocksRef.current += hits.size;
      spawnFlames(hits); spawnDust([...hits], sw); kickScreen(); sfx.explode(); haptic.heavy();
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
    hits.forEach(key => { const [rr,cc]=key.split(',').map(Number); const cell2=sw[rr][cc]; if(cell2 && !isHard(cell2)) cell2.hit=true; });
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
    push(reshuffle(levelDef(lvlRef.current).types, mapRef.current, gRef.current));   // 남은 장애물·도토리는 유지
    pop('🔀 셔플!', 'special');
    scheduleHint();
  }, [push, pop, clearHint, scheduleHint]);

  // ── 입력(탭/드래그) ───────────────────────────────────
  const handleTap = (r: number, c: number) => {
    if (phaseRef.current !== 'play' || pausedRef.current) return;
    const cell = gRef.current[r]?.[c];
    if (!cell || cell.hit) return;
    if (boosterMode) { triggerBooster(boosterMode, r, c); return; }
    if (isObstacle(cell)) return;   // 장애물은 스왑 선택 불가
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
    if (isObstacle(cell) && !boosterMode) return;   // 장애물은 드래그 불가
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

  // ── 결제: 토스 앱이면 실제 인앱결제(IAP), 그 외(브라우저/데모)는 시뮬레이션 ──
  const startPay = (label: string, cash: number, onDone: () => void, sku?: string) => {
    if (sku) {
      // 콘솔에 등록된 상품(sku)만 실제 결제 시도. 토스 앱이 아니면 시뮬레이션으로 폴백.
      purchase(sku, () => onDone()).then(res => {
        if (res.ok) return;                      // 결제 성공 — onDone은 지급 단계에서 이미 실행됨
        if (res.reason === 'NOT_AVAILABLE') {    // 스토어 결제 미연동 → 시뮬레이션 결제 모달
          setPay({ label, cash, onDone }); setPayStage('confirm');
        } else if (res.reason !== 'USER_CANCELED') {
          pop('결제에 실패했어요. 다시 시도해주세요', 'special');
        }
      });
      return;
    }
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

  const buyCoinPack = (coins: number, cash: number, sku: string) => {
    startPay(`코인 ${coins.toLocaleString()}개`, cash, () => {
      addCoins(coins);
      pop(`🪙 +${coins.toLocaleString()} 충전 완료!`, 'special');
    }, sku);
  };

  // ── 토스 로그인 ──────────────────────────────────────
  const handleLogin = async (provider: 'google' | 'kakao') => {
    const label = provider === 'google' ? 'Google' : '카카오';
    const r = provider === 'google' ? await loginGoogle() : await loginKakao();
    if (r.ok) { pop(`✅ ${label} 로그인 완료!`, 'special'); return; }
    if (r.reason === 'NOT_CONFIGURED') pop(`${label} 로그인은 키 연동 후 사용할 수 있어요`, 'special');
    else pop(`${label} 로그인을 완료하지 못했어요`, 'special');
  };
  const handleGuest = () => { loginGuest(); pop('게스트로 전환했어요', 'special'); };

  // ── 홈 이벤트: 룰렛 ────────────────────────────
  // 별 보물상자 — 별 CHEST_EVERY개마다 1회 수령
  const claimChest = () => {
    const total = progress.reduce((a, b) => a + b, 0);
    if (Math.floor(total / CHEST_EVERY) <= chestClaimed) {
      pop(`⭐ ${CHEST_EVERY - (total - chestClaimed * CHEST_EVERY)}개 더 모으면 상자가 열려요`, 'special'); return;
    }
    const n = chestClaimed + 1; sSet(CHEST_BASE, n); setChestClaimed(n);
    addCoins(300); setCoins(loadCoins());
    setBoosters(prev => { const next = { ...prev, bomb: prev.bomb + 1, rowClear: prev.rowClear + 1 }; saveBoosters(next); return next; });
    sfx.win(); haptic.success();
    pop('보물상자! 코인 300 + 폭탄 + 가로 아이템', 'special');
  };
  const openRoulette = () => { setRouletteWin(null); setRouletteSpin(false); setWheelRot(0); setShowRoulette(true); };
  const spinRoulette = () => {
    if (rouletteSpin) return;
    if (sGet<string>(ROU_BASE, '') === todayStr()) { pop('오늘 룰렛은 이미 돌렸어요', 'special'); return; }
    setRouletteSpin(true); setRouletteWin(null);
    const k = Math.floor(Math.random() * ROULETTE_PRIZES.length);
    setWheelRot(360 * 6 - (k * 60 + 30));   // 화살표(맨 위)가 당첨 칸 한가운데를 가리키도록
    setTimeout(() => { const win = ROULETTE_PRIZES[k]; sSet(ROU_BASE, todayStr()); addCoins(win); setCoins(loadCoins()); setRouletteWin(win); setRouletteSpin(false); sfx.coin(); haptic.success(); }, 3500);
  };

  const lvl      = levelDef(lvlIdx);
  const isTime   = lvl.mode === 'time';
  // 플레이 중 별: 목표 달성 전엔 점수 구간(0~2), 달성 후엔 클리어 별(1~3)
  const scoreTier = (score >= lvl.goal[1] ? 1 : 0) + (score >= lvl.goal[0] ? 1 : 0);
  const curStars = goalsDone ? clearStars(score, lvl.goal) : scoreTier;
  const endStars = goalsDone ? clearStars(scoreRef.current, lvl.goal) : 0;
  const remainTotal = targets.reduce((a, x) => a + Math.max(0, x.left), 0);
  const targetIcon = (t: number, size: number) => t === -2
    ? <GIcon name="crate" size={size * 1.05} />
    : t === -3
    ? <span style={{ display:'inline-block', width: size * 0.86, height: size * 0.86, borderRadius: size * 0.24, background:'linear-gradient(145deg,#FF9AD5,#E0479E)', border:'2px solid #fff', boxShadow:'0 0 6px rgba(255,105,180,0.7), inset 0 2px 4px rgba(255,255,255,0.6)' }}/>
    : t === -4
    ? <GIcon name="acorn" size={size * 1.05} />
    : <img src={TILES[t]?.img} alt="" style={{ width: size * 1.12, height: size * 1.12, objectFit: 'contain', filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.45))' }}/>;
  const condLabel = isTime ? `${time}` : `${movesLeft}`;
  const curMap = genMap(lvlIdx);

  const renderModals = () => (
    <>
      {/* 행운 룰렛 — 직접 그린 바퀴 */}
      {showRoulette && (() => {
        const SL = ['#FF7A6B', '#FFB44A', '#FFE066', '#7BDC6B', '#55B8FF', '#B58CFF'];
        const pt = (deg: number, r: number) => `${100 + r * Math.sin(deg * Math.PI / 180)} ${100 - r * Math.cos(deg * Math.PI / 180)}`;
        const spent = sGet<string>(ROU_BASE, '') === todayStr() && rouletteWin === null && !rouletteSpin;
        return (
          <div style={{ position:'absolute', inset:0, zIndex:66, background:'rgba(14,34,84,0.72)', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
            <Panel maxWidth={330} style={{ padding:'38px 16px 18px', textAlign:'center', animation:'popIn 0.34s cubic-bezier(0.34,1.56,0.64,1) both' }}>
              <div style={{ position:'absolute', top:-26, left:0, right:0, display:'flex', justifyContent:'center' }}><Ribbon size={22}>행운 룰렛</Ribbon></div>
              <CloseBtn onClick={() => { if (!rouletteSpin) setShowRoulette(false); }} />
              <div style={{ position:'relative', width:250, height:250, margin:'4px auto 0' }}>
                <svg viewBox="0 0 200 200" width="250" height="250" style={{ position:'absolute', inset:0, overflow:'visible' }}>
                  <circle cx="100" cy="100" r="99" fill={C.gold} stroke={C.ink} strokeWidth="3" />
                  <g style={{ transformOrigin:'100px 100px', transform:`rotate(${wheelRot}deg)`, transition: wheelRot ? 'transform 3.4s cubic-bezier(0.12,0.62,0.12,1)' : 'none' }}>
                    {ROULETTE_PRIZES.map((v, i) => (
                      <g key={i}>
                        <path d={`M100 100 L${pt(i*60, 88)} A88 88 0 0 1 ${pt((i+1)*60, 88)} Z`} fill={SL[i]} stroke={C.ink} strokeWidth="2.4" strokeLinejoin="round" />
                        <g transform={`rotate(${i*60+30} 100 100)`}>
                          <text x="100" y="44" textAnchor="middle" fontSize="19" fill="#fff" stroke={C.ink} strokeWidth="3.2" paintOrder="stroke" style={{ fontFamily:'inherit' }}>{v}</text>
                          <circle cx="100" cy="62" r="6.5" fill={C.gold} stroke={C.ink} strokeWidth="2" />
                        </g>
                      </g>
                    ))}
                    {Array.from({ length: 12 }, (_, i) => <circle key={i} cx={100 + 94 * Math.sin(i*30*Math.PI/180)} cy={100 - 94 * Math.cos(i*30*Math.PI/180)} r="2.6" fill="#fff" stroke={C.ink} strokeWidth="1" />)}
                  </g>
                  <circle cx="100" cy="100" r="17" fill="#fff" stroke={C.ink} strokeWidth="3" /><circle cx="100" cy="100" r="9" fill={C.red} stroke={C.ink} strokeWidth="2" />
                  <path d="M100 18 L88 -4 L112 -4 Z" fill={C.red} stroke={C.ink} strokeWidth="3" strokeLinejoin="round" transform="translate(0 10)" />
                </svg>
              </div>
              <div style={{ minHeight:32, marginTop:10, fontSize:20, color:C.brown, display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
                {rouletteWin != null ? <><GIcon name="coin" size={28} /> +{rouletteWin.toLocaleString()} 당첨!</> : rouletteSpin ? '두구두구…' : spent ? '오늘은 이미 돌렸어요' : '하루 한 번 무료로 돌려요'}
              </div>
              <button className={`gbtn ${rouletteWin != null ? 'green' : 'orange'}`} onClick={rouletteWin != null ? () => setShowRoulette(false) : spinRoulette} disabled={rouletteSpin || spent}
                style={{ marginTop:8, width:'100%', height:58, fontSize:26, letterSpacing:1 }}>
                {rouletteWin != null ? '받기' : rouletteSpin ? '돌리는 중…' : '돌리기'}
              </button>
            </Panel>
          </div>
        );
      })()}

      {/* 스테이지 시작 전 팝업 — 레퍼런스처럼 크림 패널 + 빨간 리본 */}
      {stagePopup !== null && (() => {
        const idx = stagePopup;
        const L = levelDef(idx);
        const diff = difficultyOf(idx);
        const mv = (L as {moves?:number}).moves ?? 0;
        const lbl: Record<string, string> = { '-2': '상자', '-3': '젤리', '-4': '도토리' };
        return (
          <div style={{ position:'absolute', inset:0, zIndex:66, background:'rgba(14,34,84,0.72)', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
            <Panel maxWidth={338} style={{ padding:'40px 16px 18px', animation:'popIn 0.34s cubic-bezier(0.34,1.56,0.64,1) both' }}>
              <div style={{ position:'absolute', top:-28, left:0, right:0, display:'flex', justifyContent:'center' }}><Ribbon size={26}>STAGE {idx+1}</Ribbon></div>
              <CloseBtn onClick={() => { sfx.click(); setPreBoost([]); setStagePopup(null); }} />
              {/* 목표 — 오목한 칸 */}
              <div style={{ background:C.creamDeep, border:`3px solid ${C.creamLine}`, borderRadius:20, padding:'10px 8px 12px', boxShadow:'inset 0 4px 0 rgba(0,0,0,0.07)', textAlign:'center' }}>
                <div style={{ fontSize:16, color:C.brownSoft, marginBottom:6 }}>목표를 모두 모으세요</div>
                <div style={{ display:'flex', justifyContent:'center', gap:16, flexWrap:'wrap' }}>
                  {targetsForStage(idx).map((x, i) => (
                    <div key={i} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:1, minWidth:54 }}>
                      <div style={{ height:50, display:'flex', alignItems:'center', justifyContent:'center' }}>{x.t === -3 ? <GIcon name="jelly" size={46} /> : x.t === -2 ? <GIcon name="crate" size={46} /> : x.t === -4 ? <GIcon name="acorn" size={46} /> : targetIcon(x.t, 48)}</div>
                      <span style={{ fontSize:22, color:C.brown, lineHeight:1 }}>{x.n}</span>
                      {lbl[String(x.t)] && <span style={{ fontSize:11, color:C.brownSoft }}>{lbl[String(x.t)]}</span>}
                    </div>
                  ))}
                </div>
                <div style={{ display:'flex', justifyContent:'center', gap:10, marginTop:10, fontSize:15, color:C.brown }}>
                  <span style={{ padding:'1px 12px 3px', borderRadius:999, background:'#fff', border:`2px solid ${C.creamLine}` }}>이동 <b style={{ color:C.rimDark, fontWeight:400 }}>{mv}</b></span>
                  <span style={{ padding:'1px 12px 3px', borderRadius:999, background:'#fff', border:`2px solid ${C.creamLine}` }}>난이도 <b style={{ color:diff.color, fontWeight:400 }}>{diff.label}</b></span>
                </div>
              </div>
              {streak > 0 && (
                <div style={{ marginTop:10, padding:'5px 10px 7px', borderRadius:14, background:'#FFE9B5', border:'3px solid #F2B84B', fontSize:15, color:'#8A4B00', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
                  <GIcon name="flame" size={26} /> {streak}연승 보너스 · 특수블럭 {Math.min(3, streak)}개로 시작
                </div>
              )}
              {/* 시작 아이템 */}
              <div style={{ marginTop:14, textAlign:'center' }}>
                <div style={{ fontSize:17, color:C.brown, marginBottom:8 }}>아이템을 선택하세요</div>
                <div style={{ display:'flex', justifyContent:'center', flexWrap:'wrap', gap:12 }}>
                  {(['rowClear','colClear','bomb','allClear'] as BoosterKind[]).map(k => {
                    const cnt = boosters[k]; const on = preBoost.includes(k);
                    return (
                      <button key={k} disabled={cnt <= 0} onClick={() => { sfx.click(); setPreBoost(p => on ? p.filter(x => x !== k) : [...p, k]); }}
                        style={{ position:'relative', width:62, height:62, borderRadius:18, padding:0, cursor: cnt>0?'pointer':'default', display:'flex', alignItems:'center', justifyContent:'center',
                          background: on ? '#CFF3C2' : '#fff', border:`4px solid ${on ? '#58C94A' : C.creamLine}`, boxShadow: on ? '0 0 0 2px #2B8B25, 0 4px 0 2px #2B8B25' : `0 4px 0 ${C.creamLine}`, opacity: cnt>0?1:0.45 }}>
                        <GIcon name={BOOSTER_ICON[k]} size={38} />
                        <span style={{ position:'absolute', bottom:-8, right:-8, minWidth:24, height:24, padding:'0 5px', borderRadius:999, background: on ? '#2B8B25' : C.orange, border:'3px solid #fff', boxShadow:`0 0 0 2px ${C.ink}`, color:'#fff', fontSize:13, display:'flex', alignItems:'center', justifyContent:'center' }}>{on ? '✓' : cnt}</span>
                      </button>
                    );
                  })}
                </div>
                <div style={{ fontSize:12, color:C.brownSoft, marginTop:14 }}>고른 아이템은 시작할 때 보드에 특수블럭으로 놓여요</div>
              </div>
              <button className="gbtn blue" onClick={()=>{ const i=idx; preBoostRef.current = preBoost; setPreBoost([]); setStagePopup(null); sfx.click(); tryStartLevel(i); }}
                style={{ marginTop:14, width:'100%', height:64, borderRadius:24, fontSize:30, letterSpacing:2 }}>게임시작</button>
            </Panel>
          </div>
        );
      })()}

      {/* 이어하기 제안 (이동 소진) */}
      {continueOffer && (() => {
        const cost = CONTINUE_COSTS[Math.min(continuesUsed, MAX_CONTINUES-1)];
        const afford = coins >= cost;
        return (
          <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(14,34,84,0.78)', padding:20, zIndex:65 }}>
            <Panel maxWidth={320} style={{ padding:'38px 16px 16px', textAlign:'center', animation:'popIn 0.34s cubic-bezier(0.34,1.56,0.64,1) both' }}>
              <div style={{ position:'absolute', top:-26, left:0, right:0, display:'flex', justifyContent:'center' }}><Ribbon size={22}>이동을 다 썼어요!</Ribbon></div>
              <div style={{ display:'flex', justifyContent:'center', marginBottom:4 }}><GIcon name="bolt" size={58} /></div>
              <div style={{ fontSize:19, color:C.brown, lineHeight:1.35 }}>이동 <b style={{ color:C.rimDark, fontWeight:400 }}>+{CONTINUE_MOVES}수</b> 받고<br/>이어서 도전할 수 있어요!</div>
              <div style={{ margin:'10px 0 14px', display:'inline-block', padding:'2px 14px 4px', borderRadius:999, background:C.creamDeep, border:`3px solid ${C.creamLine}`, fontSize:15, color:C.brown }}>남은 목표 <b style={{ color:C.red, fontWeight:400 }}>{remainTotal}개</b></div>
              <div style={{ display:'flex', gap:10 }}>
                <button className="gbtn cream" onClick={declineContinue} style={{ flex:1, height:54, fontSize:18, borderRadius:18 }}>포기하기</button>
                <button className="gbtn green" onClick={acceptContinue} style={{ flex:1.6, height:54, fontSize:18, borderRadius:18, display:'flex', alignItems:'center', justifyContent:'center', gap:5, opacity: (cost===0 || afford) ? 1 : 0.75 }}>
                  {cost===0 ? '무료 이어하기' : afford ? <><GIcon name="coin" size={24} />{cost} 이어하기</> : <><GIcon name="coin" size={24} />{cost} · 충전</>}
                </button>
              </div>
              <div style={{ fontSize:12, color:C.brownSoft, marginTop:10 }}>남은 이어하기 {MAX_CONTINUES - continuesUsed}회 · 보유 코인 {coins.toLocaleString()}</div>
            </Panel>
          </div>
        );
      })()}

      {/* 일일 퀘스트 (완료 시 난이도별 하트 지급) */}
      {showQuests && (
        <div style={{ position:'absolute', inset:0, zIndex:50, background:'rgba(14,34,84,0.72)', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
          <Panel maxWidth={350} style={{ padding:'38px 12px 14px', animation:'popIn 0.34s cubic-bezier(0.34,1.56,0.64,1) both' }}>
            <div style={{ position:'absolute', top:-26, left:0, right:0, display:'flex', justifyContent:'center' }}><Ribbon size={22}>일일 퀘스트</Ribbon></div>
            <CloseBtn onClick={() => setShowQuests(false)} />
            <div style={{ display:'flex', flexDirection:'column', gap:8, maxHeight:'62vh', overflowY:'auto', padding:'2px 2px 4px' }}>
              {QUESTS.map(qd => {
                const current = qd.metric(quests);
                const claimed = quests.claimed[qd.key];
                const done = current >= qd.target;
                const qIcon: Record<string, GIconName> = { clear1:'star', clear3:'flame', combo5:'bolt', special5:'bomb', blocks200:'crate' };
                const diffColor = qd.difficulty==='쉬움' ? '#58B04A' : qd.difficulty==='보통' ? '#E8932A' : '#E0412D';
                return (
                  <div key={qd.key} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 10px', borderRadius:16, background: claimed ? '#E9E3D3' : C.creamDeep, border:`3px solid ${done && !claimed ? C.orange : C.creamLine}`, opacity: claimed ? 0.7 : 1, boxShadow: done && !claimed ? '0 0 10px rgba(255,170,40,0.6)' : 'none' }}>
                    <Medal hue="#DDEBFF" size={46}><GIcon name={qIcon[qd.key] ?? 'star'} size={28} /></Medal>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:6, color:C.brown, fontSize:16 }}>
                        <span style={{ whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{qd.label}</span>
                        <span style={{ fontSize:11, color:'#fff', background:diffColor, borderRadius:999, padding:'0 7px 1px', whiteSpace:'nowrap' }}>{qd.difficulty}</span>
                      </div>
                      <div style={{ position:'relative', marginTop:4, height:15, borderRadius:999, background:'#B79F78', border:`2px solid ${C.ink}`, overflow:'hidden' }}>
                        <div style={{ position:'absolute', left:0, top:0, bottom:0, width:`${Math.min((current/qd.target)*100,100)}%`, background:'linear-gradient(180deg,#8DE57A,#42B432)', transition:'width 0.3s' }}/>
                        <span style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, color:'#fff', textShadow:`0 1px 0 ${C.ink}` }}>{Math.min(current, qd.target)} / {qd.target}</span>
                      </div>
                    </div>
                    {done && !claimed ? (
                      <button className="gbtn green" onClick={() => { const r = questClaim(qd.key); if (r.success) { setQuests(loadQuests()); setLives(loadLives()); pop(`하트 ${r.reward}개 획득!`, 'special'); } }} style={{ height:44, padding:'0 12px', borderRadius:14, fontSize:15, display:'flex', alignItems:'center', gap:4 }}>
                        <img src={`${BASE}characters/life.png`} alt="" style={{ width:20, height:20, borderRadius:'50%', border:'2px solid #fff' }}/>{qd.hearts} 받기
                      </button>
                    ) : claimed ? (
                      <span style={{ width:34, height:34, borderRadius:'50%', background:'#58B04A', border:'3px solid #fff', boxShadow:`0 0 0 2px ${C.ink}`, display:'flex', alignItems:'center', justifyContent:'center' }}><GIcon name="check" size={18} /></span>
                    ) : (
                      <span style={{ display:'flex', alignItems:'center', gap:3, fontSize:15, color:C.brown, minWidth:38 }}><img src={`${BASE}characters/life.png`} alt="" style={{ width:22, height:22, borderRadius:'50%', border:`2px solid ${C.ink}` }}/>{qd.hearts}</span>
                    )}
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop:8, textAlign:'center', fontSize:12, color:C.brownSoft }}>매일 0시에 초기화돼요 · 완료하면 난이도에 따라 하트를 드려요</div>
          </Panel>
        </div>
      )}

      {/* 튜토리얼 (첫 실행 / 설정에서 다시 보기) */}
      {showTutorial && (() => {
        const step = TUTORIAL_STEPS[tutStep];
        const last = tutStep >= TUTORIAL_STEPS.length - 1;
        const Tile = ({ t, size = 40, glow = false }: { t: number; size?: number; glow?: boolean }) => (
          <img src={TILES[t].img} alt="" style={{ width:size, height:size, objectFit:'contain', flexShrink:0, filter: glow ? `drop-shadow(0 0 8px ${TILES[t].glow}) drop-shadow(0 2px 3px rgba(0,0,0,0.5))` : 'drop-shadow(0 2px 3px rgba(0,0,0,0.5))' }}/>
        );
        const Special = ({ icon, size = 34 }: { icon: string; size?: number }) => (
          <span style={{ width:size, height:size, borderRadius:'50%', background:'radial-gradient(circle at 35% 30%, #fff 0%, #E040FB 75%)', border:'3px solid #fff', boxShadow:`0 0 0 2px ${C.ink}, 0 0 12px rgba(224,64,251,0.8)`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:size*0.46, flexShrink:0, color:'#fff', textShadow:'0 1px 2px rgba(0,0,0,0.6)' }}>{icon}</span>
        );
        const arrow = <span style={{ fontSize:22, color:C.orangeDark }}>▶</span>;
        const cap = (txt: string) => <div style={{ fontSize:14, color:C.brownSoft, marginTop:4 }}>{txt}</div>;
        const visual =
          step.kind === 'intro' ? (
            <div style={{ display:'flex', gap:4 }}>{[0,1,2,3,4].map(t => <Tile key={t} t={t} size={48}/>)}</div>
          ) : step.kind === 'drag' ? (
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:6 }}>
              <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                <Tile t={0} size={58} glow/><span style={{ fontSize:28, color:C.rimDark }}>⇆</span><Tile t={1} size={58}/>
              </div>
              {cap('끌어서 옆 블럭과 자리 바꾸기')}
            </div>
          ) : step.kind === 'match' ? (
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:6 }}>
              <div style={{ display:'flex', alignItems:'center', gap:4 }}><Tile t={2} size={52} glow/><Tile t={2} size={52} glow/><Tile t={2} size={52} glow/><span style={{ marginLeft:4 }}><GIcon name="bolt" size={34} /></span></div>
              {cap('같은 친구 3개 → 펑! 터짐')}
            </div>
          ) : step.kind === 'special' ? (
            <div style={{ display:'flex', flexDirection:'column', gap:10, width:'100%' }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:3 }}>{[0,1,2,3].map(i => <Tile key={i} t={3} size={30}/>)}{arrow}<Special icon="↔" size={36}/><span style={{ fontSize:13, color:C.brownSoft, marginLeft:4 }}>4개</span></div>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:3 }}>{[0,1,2,3,4].map(i => <Tile key={i} t={4} size={30}/>)}{arrow}<Special icon="●" size={36}/><span style={{ fontSize:13, color:C.brownSoft, marginLeft:4 }}>5개+</span></div>
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:8 }}>
              <div style={{ display:'flex', gap:12 }}><GIcon name="crate" size={44} /><GIcon name="jelly" size={44} /><GIcon name="acorn" size={44} /></div>
              {cap('목표를 모두 달성하면 클리어!')}
            </div>
          );
        return (
          <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(14,34,84,0.78)', padding:20, zIndex:70 }}>
            <Panel maxWidth={340} style={{ padding:'38px 16px 16px', animation:'popIn 0.34s cubic-bezier(0.34,1.56,0.64,1) both' }}>
              <div style={{ position:'absolute', top:-26, left:0, right:0, display:'flex', justifyContent:'center' }}><Ribbon size={20}>튜토리얼 {tutStep+1}/{TUTORIAL_STEPS.length}</Ribbon></div>
              <CloseBtn onClick={closeTutorial} />
              <div style={{ minHeight:122, display:'flex', alignItems:'center', justifyContent:'center', background:C.creamDeep, border:`3px solid ${C.creamLine}`, borderRadius:20, padding:12, boxShadow:'inset 0 4px 0 rgba(0,0,0,0.07)' }}>{visual}</div>
              <div style={{ fontSize:22, color:C.brown, margin:'12px 0 4px', textAlign:'center' }}>{step.title}</div>
              <div style={{ fontSize:15, color:C.brownSoft, lineHeight:1.5, minHeight:92, textAlign:'center' }}>{noEmoji(step.desc)}</div>
              <div style={{ display:'flex', justifyContent:'center', gap:6, padding:'2px 0 12px' }}>
                {TUTORIAL_STEPS.map((_,i) => <span key={i} style={{ width:i===tutStep?20:9, height:9, borderRadius:999, background:i===tutStep?C.orange:C.creamLine, border:`2px solid ${i===tutStep?C.orangeDark:'#C9AE75'}`, transition:'all 0.2s' }}/>)}
              </div>
              <div style={{ display:'flex', gap:10 }}>
                {tutStep > 0 && <button className="gbtn cream" onClick={() => setTutStep(s => Math.max(0, s-1))} style={{ flex:1, height:52, fontSize:18, borderRadius:18 }}>이전</button>}
                <button className={`gbtn ${last ? 'green' : 'blue'}`} onClick={() => last ? startTutorialPlay() : setTutStep(s => s+1)} style={{ flex:2, height:52, fontSize:20, borderRadius:18 }}>{last ? '직접 해보기' : '다음'}</button>
              </div>
            </Panel>
          </div>
        );
      })()}

      {/* 상점 */}
      {showShop && (() => {
        const row = (icon: ReactNode, title: ReactNode, desc: string, btn: ReactNode, key?: string | number) => (
          <div key={key} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 10px', borderRadius:16, background:C.creamDeep, border:`3px solid ${C.creamLine}` }}>
            <span style={{ width:46, height:46, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center' }}>{icon}</span>
            <div style={{ flex:1, minWidth:0, color:C.brown }}>
              <div style={{ fontSize:17, lineHeight:1.15 }}>{title}</div>
              <div style={{ fontSize:12, color:C.brownSoft, marginTop:1 }}>{desc}</div>
            </div>
            {btn}
          </div>
        );
        const price = (n: number, ok: boolean, onClick: () => void) => (
          <button className="gbtn orange" disabled={!ok} onClick={onClick} style={{ height:44, padding:'0 12px', borderRadius:14, fontSize:16, display:'flex', alignItems:'center', gap:4 }}><GIcon name="coin" size={22} />{n}</button>
        );
        return (
          <div style={{ position:'absolute', inset:0, zIndex:40, background:'rgba(14,34,84,0.72)', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
            <Panel maxWidth={360} style={{ padding:'38px 12px 14px', maxHeight:'86vh', display:'flex', flexDirection:'column', animation:'popIn 0.34s cubic-bezier(0.34,1.56,0.64,1) both' }}>
              <div style={{ position:'absolute', top:-26, left:0, right:0, display:'flex', justifyContent:'center' }}><Ribbon size={22}>상점</Ribbon></div>
              <CloseBtn onClick={() => setShowShop(false)} />
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                <div style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'0 12px 2px 6px', borderRadius:999, background:'#fff', border:`3px solid ${C.rim}`, color:C.brown, fontSize:17 }}><GIcon name="coin" size={24} />{coins.toLocaleString()}</div>
                <div style={{ flex:1 }}/>
                {([['coin','코인으로'],['cash','충전·결제']] as const).map(([k,label]) => (
                  <button key={k} className={`gbtn ${shopTab===k ? 'blue' : 'cream'}`} onClick={() => setShopTab(k)} style={{ height:38, padding:'0 12px', borderRadius:14, fontSize:15, borderWidth:3 }}>{label}</button>
                ))}
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:8, overflowY:'auto', padding:'2px 2px 6px' }}>
                {shopTab === 'coin' ? (
                  <>
                    {row(<img src={`${BASE}characters/life.png`} alt="" style={{ width:42, height:42, borderRadius:'50%', objectFit:'cover', border:`3px solid #fff`, boxShadow:`0 0 0 2px ${C.ink}` }}/>,
                      <>하트 5개 <span style={{ fontSize:12, color:C.brownSoft }}>보유 {lives}/{LIVES_MAX}</span></>, '게임 플레이에 필요한 하트를 채워요',
                      price(250, coins >= 250 && lives < LIVES_MAX, () => {
                        if (lives >= LIVES_MAX) { pop('하트가 이미 가득 찼어요', 'special'); return; }
                        if (!spendCoins(250)) { pop('코인이 부족해요', 'special'); setShopTab('cash'); return; }
                        addLives(5); setLives(loadLives()); pop('하트 +5!', 'special');
                      }), 'heart')}
                    {BOOSTERS.map(b => row(<GIcon name={BOOSTER_ICON[b.kind]} size={42} />,
                      <>{b.name} <span style={{ fontSize:12, color:C.brownSoft }}>보유 {boosters[b.kind]}</span></>, b.desc,
                      price(b.price, coins >= b.price, () => {
                        if (!spendCoins(b.price)) { pop('코인이 부족해요. 충전 탭에서 결제하세요', 'special'); setShopTab('cash'); return; }
                        setBoosters(prev => { const next={...prev,[b.kind]:prev[b.kind]+1}; saveBoosters(next); return next; });
                        pop(`${b.name} 구매!`, 'special');
                      }), b.kind))}
                    <div style={{ textAlign:'center', fontSize:12, color:C.brownSoft, padding:'2px 0' }}>코인은 출석·일일 퀘스트·룰렛으로 모을 수 있어요</div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize:15, color:C.brownSoft, padding:'0 4px' }}>코인 충전</div>
                    {COIN_PACKS.map((p,i) => row(<GIcon name="coin" size={42} />,
                      <>{p.coins.toLocaleString()} 코인 {p.bonus && <span style={{ fontSize:12, color:'#fff', background:C.red, borderRadius:999, padding:'0 7px 1px' }}>{p.bonus}</span>}</>, '',
                      <button className="gbtn blue" onClick={() => buyCoinPack(p.coins, p.cash, p.sku)} style={{ height:44, padding:'0 12px', borderRadius:14, fontSize:16 }}>₩{p.cash.toLocaleString()}</button>, i))}
                    <div style={{ fontSize:15, color:C.brownSoft, padding:'4px 4px 0' }}>하트 충전</div>
                    {row(<img src={`${BASE}characters/life.png`} alt="" style={{ width:42, height:42, borderRadius:'50%', objectFit:'cover', border:`3px solid #fff`, boxShadow:`0 0 0 2px ${C.ink}` }}/>, `하트 가득 채우기 (${LIVES_MAX})`, '지금 바로 최대치로',
                      <button className="gbtn red" onClick={() => startPay('하트 가득 채우기', 1500, () => { addLives(LIVES_MAX); setLives(loadLives()); pop('하트 가득 충전!', 'special'); }, SKU_HEARTS_FULL)} style={{ height:44, padding:'0 12px', borderRadius:14, fontSize:16 }}>₩1,500</button>, 'hf')}
                    <button className="gbtn cream" onClick={() => setShopTab('coin')} style={{ height:46, fontSize:15, borderRadius:16 }}>부스터 아이템은 코인으로 살 수 있어요 ▶</button>
                    <div style={{ fontSize:11, color:C.brownSoft, textAlign:'center' }}>* 현재 결제는 시뮬레이션으로 동작해요 (스토어 결제 연동 예정)</div>
                  </>
                )}
              </div>
            </Panel>
          </div>
        );
      })()}

      {/* 설정 */}
      {showSettings && (() => {
        const card: CSSProperties = { padding:'10px 12px', borderRadius:16, background:C.creamDeep, border:`3px solid ${C.creamLine}` };
        const stat = (icon: GIconName, v: ReactNode, label: string) => (
          <div style={{ textAlign:'center', color:C.brown }}><div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:3, fontSize:20 }}><GIcon name={icon} size={26} />{v}</div><div style={{ fontSize:12, color:C.brownSoft }}>{label}</div></div>
        );
        return (
          <div style={{ position:'absolute', inset:0, zIndex:40, background:'rgba(14,34,84,0.72)', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
            <Panel maxWidth={350} style={{ padding:'38px 12px 14px', maxHeight:'88vh', display:'flex', flexDirection:'column', animation:'popIn 0.34s cubic-bezier(0.34,1.56,0.64,1) both' }}>
              <div style={{ position:'absolute', top:-26, left:0, right:0, display:'flex', justifyContent:'center' }}><Ribbon size={22}>설정</Ribbon></div>
              <CloseBtn onClick={() => setShowSettings(false)} />
              <div style={{ display:'flex', flexDirection:'column', gap:8, overflowY:'auto', padding:'2px 2px 4px' }}>
                {/* 계정 */}
                <div style={card}>
                  <div style={{ fontSize:12, color:C.brownSoft }}>계정</div>
                  <div style={{ fontSize:17, color:C.brown, margin:'1px 0 8px' }}>{account}</div>
                  <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
                    <button className="gbtn cream" onClick={() => handleLogin('google')} style={{ height:44, fontSize:16, borderRadius:14 }}><span style={{ color:'#4285F4', marginRight:6 }}>G</span>Google로 로그인</button>
                    <button className="gbtn" onClick={() => handleLogin('kakao')} style={{ height:44, fontSize:16, borderRadius:14, ['--t' as string]:'#FFEB59', ['--b' as string]:'#F6D100', ['--e' as string]:'#A88F00', color:'#3A1D1D', textShadow:'none' } as CSSProperties}>카카오로 로그인</button>
                    <button className="gbtn cream" onClick={handleGuest} style={{ height:42, fontSize:15, borderRadius:14 }}>게스트로 시작</button>
                  </div>
                  <div style={{ fontSize:11, color:C.brownSoft, marginTop:6 }}>로그인하면 진행도·코인·아이템이 계정별로 저장돼요 (Google·카카오는 키 연동 후 활성화)</div>
                </div>
                {/* 진행도 요약 */}
                <div style={{ ...card, display:'flex', justifyContent:'space-around' }}>
                  {stat('star', totalStars, '총 별')}{stat('coin', coins.toLocaleString(), '코인')}{stat('gift', BOOSTERS.reduce((a,b)=>a+boosters[b.kind],0), '아이템')}
                </div>
                {/* 사운드 */}
                <button className={`gbtn ${muted ? 'cream' : 'green'}`} onClick={() => { const m = toggleMuted(); setMutedState(m); if (!m) { sfx.click(); primeAudio(); const p=phaseRef.current; if (p==='main'||p==='worlds'||p==='map'||p==='play') startBgm(); } else stopBgm(); }}
                  style={{ height:46, fontSize:17, borderRadius:16, display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                  <Icon name={muted ? 'mute' : 'sound'} size={22} color={muted ? C.brown : '#fff'} /> {muted ? '소리 꺼짐 · 탭하면 켜기' : '소리 켜짐 · 탭하면 끄기'}
                </button>
                <button className="gbtn blue" onClick={() => { setShowSettings(false); setTutStep(0); setShowTutorial(true); }} style={{ height:46, fontSize:17, borderRadius:16 }}>튜토리얼 다시 보기</button>
                <button className="gbtn red" onClick={() => {
                    if (confirm('이 계정의 진행도·코인·아이템을 모두 초기화할까요?')) {
                      saveProg([]); setProgress([]);
                      saveBoosters({hammer:0,bomb:0,shuffle:0,rowClear:0,colClear:0,allClear:0}); setBoosters({hammer:0,bomb:0,shuffle:0,rowClear:0,colClear:0,allClear:0});
                      sSet('linydory_coins_v1', 0); setCoins(0); window.dispatchEvent(new Event('coins-updated'));
                      pop('진행도를 초기화했어요', 'special'); setShowSettings(false);
                    }
                  }} style={{ height:42, fontSize:15, borderRadius:14 }}>진행도 초기화</button>
                <div style={{ fontSize:11, color:C.brownSoft, textAlign:'center' }}>리니와도리의 가시소동 · v1.0</div>
              </div>
            </Panel>
          </div>
        );
      })()}

      {/* 결제 모달(시뮬레이션) */}
      {pay && (
        <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(14,34,84,0.78)', padding:20, zIndex:60 }}>
          <Panel maxWidth={310} style={{ padding:'38px 16px 16px', textAlign:'center' }}>
            <div style={{ position:'absolute', top:-26, left:0, right:0, display:'flex', justifyContent:'center' }}><Ribbon size={20}>리니 페이</Ribbon></div>
            {payStage === 'done' ? (
              <div style={{ padding:'6px 0 4px' }}>
                <span style={{ width:64, height:64, borderRadius:'50%', background:'#58B04A', border:'4px solid #fff', boxShadow:`0 0 0 3px ${C.ink}`, display:'inline-flex', alignItems:'center', justifyContent:'center' }}><GIcon name="check" size={34} /></span>
                <div style={{ fontSize:24, color:C.brown, marginTop:10 }}>결제 완료!</div>
              </div>
            ) : payStage === 'processing' ? (
              <div style={{ padding:'6px 0 4px' }}>
                <div style={{ display:'inline-block', animation:'spinCoin 1.1s linear infinite' }}><GIcon name="coin" size={60} /></div>
                <div style={{ fontSize:20, color:C.brownSoft, marginTop:8 }}>결제 처리 중…</div>
              </div>
            ) : (
              <>
                <div style={{ fontSize:17, color:C.brownSoft }}>{pay.label}</div>
                <div style={{ fontSize:38, color:C.brown, margin:'2px 0 14px' }}>₩{pay.cash.toLocaleString()}</div>
                <div style={{ display:'flex', gap:10 }}>
                  <button className="gbtn cream" onClick={() => setPay(null)} style={{ flex:1, height:52, fontSize:18, borderRadius:18 }}>취소</button>
                  <button className="gbtn blue" onClick={runPay} style={{ flex:1.6, height:52, fontSize:20, borderRadius:18 }}>결제하기</button>
                </div>
                <div style={{ fontSize:12, color:C.brownSoft, marginTop:10 }}>시뮬레이션 결제 · 실제 청구되지 않아요</div>
              </>
            )}
          </Panel>
        </div>
      )}
    </>
  );

  // ── Splash ────────────────────────────────────────────────────────────────────
  if (phase === 'splash') return (
    <div style={{ position:'relative', width:'100%', height:'100%', overflow:'hidden', userSelect:'none' }}>
      <style>{GAME_CSS}</style>
      <video
        src={`${BASE}loading.mp4`}
        poster={`${BASE}characters/MAIN.png`}
        autoPlay muted loop playsInline preload="auto"
        aria-label="리니와도리의 가시소동"
        style={{ position:'absolute', top:0, left:0, width:'100%', height:'100%', objectFit:'cover', objectPosition:'top center' }}
      />
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
  const isUnlocked = (i:number) => i===0 || progress[i-1]>=1;
  const totalStars = progress.reduce((a, b) => a + b, 0);
  // 상단 알약 — 왼쪽에 아이콘이 살짝 튀어나온 스티커풍
  const hudPill = (icon: ReactNode, text: ReactNode, onClick: () => void, minW: number, anim?: string) => (
    <button onClick={() => { sfx.click(); onClick(); }} style={{ position:'relative', display:'flex', alignItems:'center', justifyContent:'space-between', gap:6, height:38, minWidth:minW, padding:'0 4px 0 34px', borderRadius:999, border:'2px solid #8EC2FF', cursor:'pointer', background:'linear-gradient(180deg,#2457B8,#133880)', boxShadow:'inset 0 2px 0 rgba(255,255,255,0.28), 0 4px 8px rgba(8,26,80,0.4)', color:'#fff', fontSize:19, animation:anim }}>
      <span style={{ position:'absolute', left:-8, top:'50%', transform:'translateY(-50%)', display:'flex' }}>{icon}</span>
      <span style={{ display:'flex', alignItems:'baseline', gap:5, fontVariantNumeric:'tabular-nums', textShadow:'0 2px 0 rgba(0,0,0,0.35)' }}>{text}</span>
      <GIcon name="plus" size={28} />
    </button>
  );
  const heartIcon = <img src={`${BASE}characters/life.png`} alt="하트" style={{ width:38, height:38, borderRadius:'50%', objectFit:'cover', border:'3px solid #fff', boxShadow:'0 3px 6px rgba(8,26,80,0.45)' }}/>;
  const heartText = <>{lives}<span style={{ fontSize:12, opacity:0.7 }}>/{LIVES_MAX}</span>{lives < LIVES_MAX && lifeTimer > 0 && <span style={{ fontSize:12, color:'#B8F5A8' }}>{Math.floor(lifeTimer/60)}:{String(lifeTimer%60).padStart(2,'0')}</span>}</>;
  const topBar = (
    <div style={{ flexShrink:0, position:'relative', zIndex:20, padding:'calc(var(--sat) + clamp(44px,8vh,52px)) 12px 8px', display:'flex', alignItems:'center', gap:14 }}>
      {hudPill(heartIcon, heartText, () => setShowShop(true), 92, lifeFly ? 'lifeChipPulse 0.5s ease' : undefined)}
      {hudPill(<GIcon name="coin" size={40} />, <span style={{ color:'#FFE27A' }}>{coins.toLocaleString()}</span>, () => { setShopTab('cash'); setShowShop(true); }, 96)}
      <div style={{ flex:1 }}/>
      <button onClick={() => { sfx.click(); setQuests(loadQuests()); setShowQuests(true); }} aria-label="퀘스트" className="gbtn green" style={{ position:'relative', width:46, height:46, padding:0, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center' }}>
        <GIcon name="clip" size={28} />
        {(() => { const cnt = QUESTS.filter(qd => qd.metric(quests) >= qd.target && !quests.claimed[qd.key]).length; return cnt > 0 ? <span style={{ position:'absolute', top:-7, right:-7, minWidth:22, height:22, padding:'0 4px', borderRadius:999, background:C.red, border:'3px solid #fff', boxShadow:`0 0 0 2px ${C.ink}`, fontSize:12, color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', animation:'questBadge 1s ease infinite' }}>{cnt}</span> : null; })()}
      </button>
    </div>
  );
  const bottomNav = (
    <div style={{ flexShrink:0, position:'relative', zIndex:25, paddingBottom:'var(--sab)', background:'linear-gradient(180deg,#58B8F2 0%,#2E86D6 100%)', borderTop:`4px solid #fff`, boxShadow:`0 -3px 0 ${C.rimDark}, 0 -8px 16px rgba(0,0,0,0.3)`, display:'flex', alignItems:'stretch', minHeight:'clamp(66px,9vh,80px)' }}>
      {([
        {icon:'shop' as const, label:'상점',   fn:()=>setShowShop(true),     active:false},
        {icon:'home' as const, label:'홈',     fn:()=>setPhase('main'),      active: phase==='main'},
        {icon:'map'  as const, label:'월드맵', fn:()=>setPhase('worlds'),    active: phase==='worlds' || phase==='map'},
        {icon:'gear' as const, label:'설정',   fn:()=>setShowSettings(true), active:false},
      ]).map((item,i)=>(
        <button key={i} onClick={()=>{ sfx.click(); item.fn(); }} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:1, border:'none', cursor:'pointer', padding:'4px 0',
          background: item.active ? 'linear-gradient(180deg,rgba(255,255,255,0.5),rgba(255,255,255,0.12))' : 'transparent',
          boxShadow: item.active ? 'inset 0 -5px 0 #FFD54A' : 'none' }}>
          <span style={{ display:'flex', transform: item.active ? 'translateY(-3px) scale(1.14)' : 'none', transition:'transform 0.15s', filter:'drop-shadow(0 3px 3px rgba(10,40,120,0.35))' }}><GIcon name={item.icon} size={40} /></span>
          <span style={{ fontSize:13, color:'#fff', textShadow:`0 2px 0 ${C.rimDark}, 0 0 4px ${C.rimDark}` }}>{item.label}</span>
        </button>
      ))}
    </div>
  );

  // ── 홈(메인): 애니팡식 — 꽉 찬 일러스트 + 상단 바 + 좌우 이벤트 + 큰 STAGE 버튼 ───────────
  if (phase === 'main') {
    const curStage = curStageOf(progress);
    const questCnt = QUESTS.filter(qd => qd.metric(quests) >= qd.target && !quests.claimed[qd.key]).length;
    const chestLeft = Math.max(0, Math.min(CHEST_EVERY, totalStars - chestClaimed * CHEST_EVERY));
    type RailItem = { icon: GIconName; label: string; fn: () => void; tone: [string, string, string]; badge?: string | boolean };
    const rail = (it: RailItem, ix: number) => (
      <button key={it.label + ix} onClick={() => { sfx.click(); it.fn(); }}
        style={{ position:'relative', width:76, display:'flex', flexDirection:'column', alignItems:'center', gap:3, background:'none', border:'none', padding:0, cursor:'pointer', animation:`idleBob ${2.4 + ix * 0.37}s ease-in-out ${ix * 0.23}s infinite` }}>
        <span style={{ position:'relative', display:'flex', width:66, height:66, filter:'drop-shadow(0 6px 5px rgba(8,26,80,0.35))' }}>
          <GIcon name={it.icon} size={66} />
          {it.badge && <span style={{ position:'absolute', top:-4, right:-4, minWidth:24, height:24, padding:'0 5px', borderRadius:999, background:'linear-gradient(180deg,#FF7A68,#E0382A)', border:'2.5px solid #fff', boxShadow:'0 2px 5px rgba(10,30,90,0.45)', fontSize:13, color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', animation:'questBadge 1s ease infinite' }}>{it.badge === true ? '!' : it.badge}</span>}
        </span>
        <span style={{ padding:'1px 11px 3px', borderRadius:999, background:`linear-gradient(180deg,${it.tone[0]},${it.tone[1]})`, border:'2px solid rgba(255,255,255,0.92)', boxShadow:`0 3px 0 ${it.tone[2]}, 0 6px 8px rgba(8,26,80,0.3)`, color:'#fff', fontSize:13, whiteSpace:'nowrap', letterSpacing:0.5, textShadow:`0 1px 0 ${it.tone[2]}` }}>{it.label}</span>
      </button>
    );
    const leftRail: RailItem[] = [
      { icon:'calendar', label:'출석', tone:['#FF7A68','#E0382A','#9E2418'], fn:()=>window.dispatchEvent(new Event('open-daily-reward')), badge: dailyPending() },
      { icon:'slot',     label:'룰렛', tone:['#A98BF7','#7B4CE0','#4F2DA6'], fn:openRoulette,    badge: sGet<string>(ROU_BASE,'') !== todayStr() },
      { icon:'gift',     label:`${chestLeft}/${CHEST_EVERY}`, tone:['#FFB75A','#F2780F','#A8530A'], fn:claimChest, badge: Math.floor(totalStars / CHEST_EVERY) > chestClaimed },
    ];
    const rightRail: RailItem[] = [
      { icon:'clip',  label:'퀘스트', tone:['#7BDC5C','#35A52E','#1F6B1B'], fn:()=>{ setQuests(loadQuests()); setShowQuests(true); }, badge: questCnt > 0 ? String(questCnt) : false },
      { icon:'flame', label: streak > 0 ? `${streak}연승` : '연승', tone:['#FFB04A','#F2780F','#A8530A'], fn:()=>pop(streak > 0 ? `${streak}연승 중! 다음 판에 특수블럭을 들고 시작해요` : '연속으로 클리어하면 특수블럭을 들고 시작해요!', 'special') },
      { icon:'tag',   label:'세일', tone:['#5DB4FF','#2A6CE8','#143E9C'], fn:()=>{ setShopTab('cash'); setShowShop(true); } },
    ];
    const sideBtn = (icon: GIconName, label: string, fn: () => void) => (
      <button onClick={() => { sfx.click(); fn(); }} className="gbtn blue" style={{ width:68, height:68, flexShrink:0, padding:0, borderRadius:20, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:0 }}>
        <GIcon name={icon} size={34} />
        <span style={{ fontSize:13, lineHeight:1.1 }}>{label}</span>
      </button>
    );
    return (
      <div style={{ position:'relative', display:'flex', flexDirection:'column', width:'100%', height:'100%', overflow:'hidden', userSelect:'none', background:'linear-gradient(180deg,#0758c2 0%,#2372cc 14%,#473717 80%,#1b2a5e 100%)', containerType:'inline-size' } as CSSProperties}>
        <style>{GAME_CSS}</style>
        {/* 배경: 일러스트(제목·캐릭터)를 화면 폭보다 살짝 크게 깔고 위·아래는 이미지 가장자리 색 그라데이션으로 이어붙여요. 천천히 숨쉬듯 움직여요 */}
        <img src={`${BASE}characters/MAIN.png`} alt="리니와도리의 가시소동" draggable={false} style={{ position:'absolute', left:'-9%', width:'118%', maxWidth:'none', top:'calc(var(--sat) + 76px)', pointerEvents:'none', WebkitMaskImage:'linear-gradient(180deg, transparent 0, #000 7%, #000 76%, transparent 100%)', maskImage:'linear-gradient(180deg, transparent 0, #000 7%, #000 76%, transparent 100%)', animation:'homeBreath 6s ease-in-out infinite' }}/>
        <div aria-hidden style={{ position:'absolute', left:0, right:0, bottom:0, height:'38%', background:'linear-gradient(180deg, transparent 0%, rgba(10,44,110,0.55) 100%)', pointerEvents:'none' }}/>
        {/* 떠다니는 꽃잎·반짝임 */}
        <div aria-hidden style={{ position:'absolute', inset:0, pointerEvents:'none', overflow:'hidden', zIndex:2 }}>
          {[0,1,2,3,4,5].map(i => (
            <span key={i} style={{ position:'absolute', top:'-6%', left:`${8+i*16}%`, fontSize:`${14+(i%3)*5}px`, opacity:0.85, animation:`petalFall ${10+i*1.9}s linear ${i*1.5}s infinite` }}>{i===3 ? <Spark size={16} /> : <Petal color={i%3===1 ? 'green' : i===2 ? 'yellow' : 'pink'} size={14 + (i%3)*5} />}</span>
          ))}
        </div>
        {/* 상단 바: 프로필 · 하트 · 코인 · 설정 */}
        <div style={{ position:'absolute', top:0, left:0, right:0, zIndex:20, padding:'calc(var(--sat) + clamp(44px,8vh,52px)) 10px 0', display:'flex', alignItems:'center', gap:14 }}>
          <button onClick={() => { sfx.click(); setShowSettings(true); }} aria-label="프로필" style={{ width:50, height:50, flexShrink:0, borderRadius:15, border:'3px solid #fff', overflow:'hidden', padding:0, cursor:'pointer', background:'radial-gradient(circle at 50% 30%, #FFF3D6, #FFD98A)', boxShadow:'0 5px 9px rgba(8,26,80,0.45)' }}>
            <img src={`${BASE}characters/face6.png`} alt="" style={{ width:'112%', height:'112%', margin:'-6%', objectFit:'contain' }}/>
          </button>
          {hudPill(heartIcon, heartText, () => setShowShop(true), 92, lifeFly ? 'lifeChipPulse 0.5s ease' : undefined)}
          {hudPill(<GIcon name="coin" size={40} />, <span style={{ color:'#FFE27A' }}>{coins.toLocaleString()}</span>, () => { setShopTab('cash'); setShowShop(true); }, 96)}
          <div style={{ flex:1 }}/>
          <button onClick={() => { sfx.click(); setShowSettings(true); }} aria-label="설정" className="gbtn blue" style={{ width:44, height:44, flexShrink:0, padding:0, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <GIcon name="gear" size={28} />
          </button>
        </div>
        {/* 좌우 이벤트 아이콘 */}
        <div style={{ position:'absolute', left:6, top:'calc(var(--sat) + 82px + 47cqw)', zIndex:15, display:'flex', flexDirection:'column', gap:12 }}>{leftRail.map(rail)}</div>
        <div style={{ position:'absolute', right:6, top:'calc(var(--sat) + 82px + 47cqw)', zIndex:15, display:'flex', flexDirection:'column', gap:12 }}>{rightRail.map(rail)}</div>
        {/* 큰 STAGE 버튼 */}
        <div style={{ position:'absolute', left:0, right:0, bottom:'calc(var(--sab) + clamp(62px,8.5vh,76px) + 16px)', zIndex:20, display:'flex', alignItems:'center', justifyContent:'center', gap:10, padding:'0 12px' }}>
          {sideBtn('map', '월드맵', () => setPhase('worlds'))}
          <button onClick={() => { sfx.click(); setSelectedWorld(Math.floor(curStage / STAGES_PER_WORLD)); setStagePopup(curStage); }} className="gbtn blue"
            style={{ flex:1, maxWidth:260, height:74, borderRadius:38, fontSize:34, letterSpacing:1.5, textShadow:`0 3px 0 ${'#143E9C'}, 0 0 14px rgba(120,200,255,0.7)`, animation:'homeStage 1.6s ease-in-out infinite' }}>
            STAGE {curStage + 1}
          </button>
          {sideBtn('shop', '상점', () => setShowShop(true))}
        </div>
        <div style={{ flex:1 }}/>
        {bottomNav}
        {renderModals()}
      </div>
    );
  }

  // ── 월드(미니맵) 선택 화면 ──────────────────────────────────────────────────
  if (phase === 'worlds') {
    // 월드는 무한 — 현재 월드 + 다음 2개까지 표시(최소 10개)
    const curWorld = Math.floor(curStageOf(progress) / STAGES_PER_WORLD);
    const worldCount = Math.max(10, curWorld + 3);
    const curStage = curStageOf(progress);
    return (
      <div style={{ position:'relative', display:'flex', flexDirection:'column', width:'100%', height:'100%', userSelect:'none', background:'linear-gradient(180deg,#4FB0EE 0%,#8CD3F6 40%,#A9DC7C 100%)', overflow:'hidden' }}>
        <style>{GAME_CSS}</style>
        {topBar}
        <div style={{ flexShrink:0, display:'flex', flexDirection:'column', alignItems:'center', padding:'8px 0 12px' }}>
          <Ribbon size={22}>월드맵</Ribbon>
          <span style={{ marginTop:8, display:'inline-flex', alignItems:'center', gap:5, padding:'0 12px 2px 6px', borderRadius:999, background:C.cream, border:`3px solid ${C.rim}`, color:C.brown, fontSize:17 }}><GIcon name="star" size={24} />{totalStars}</span>
        </div>
        <div ref={worldScrollRef} style={{ flex:1, minHeight:0, overflowY:'auto', padding:'6px 12px 12px', display:'grid', gridTemplateColumns:'repeat(2,1fr)', gridAutoRows:'min-content', gap:14, alignContent:'start' }}>
          {Array.from({ length: worldCount }, (_, k) => worldOf(k)).map((w, wi) => {
            const unlocked = isUnlocked(w.from);
            const ws = worldStars(progress, w);
            const wStars = ws.reduce((a,b)=>a+b,0);
            const wMax = (w.to - w.from) * 3;
            const cleared = ws.every(x => x >= 1);
            const cur = wi === curWorld;
            return (
              <button key={wi} data-curworld={cur ? '1' : undefined} disabled={!unlocked} onClick={() => { if(!unlocked) return; sfx.click(); setSelectedWorld(wi); setPhase('map'); }}
                style={{ position:'relative', display:'flex', flexDirection:'column', alignItems:'center', gap:6, padding:'10px 8px 9px', borderRadius:22, cursor: unlocked?'pointer':'default', background: unlocked ? C.cream : '#D9DDE6',
                  border:`4px solid ${cur ? C.orange : unlocked ? C.rim : '#A9B1C2'}`, boxShadow: cur ? `0 0 0 2px ${C.orangeDark}, 0 5px 0 2px ${C.orangeDark}, 0 0 16px rgba(255,170,40,0.8)` : `0 0 0 2px ${unlocked ? C.rimDark : '#7B849A'}, 0 5px 0 2px ${unlocked ? C.rimDark : '#7B849A'}`, animation: cur ? 'idleBob 2s ease-in-out infinite' : undefined }}>
                <span style={{ position:'relative', width:'100%', aspectRatio:'1.15', borderRadius:14, overflow:'hidden', border:`3px solid ${C.ink}`, background:'#223' }}>
                  <img src={worldImg(wi)} alt="" loading="lazy" style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover', filter: unlocked ? 'none' : 'grayscale(1) brightness(0.55)' }}/>
                  {!unlocked && <span style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center' }}><GIcon name="lock" size={42} /></span>}
                  {cleared && <span style={{ position:'absolute', top:4, right:4, width:28, height:28, borderRadius:'50%', background:'#58B04A', border:'3px solid #fff', boxShadow:`0 0 0 2px ${C.ink}`, display:'flex', alignItems:'center', justifyContent:'center' }}><GIcon name="check" size={16} /></span>}
                </span>
                <span style={{ fontSize:16, color: unlocked ? C.brown : '#6B7488', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth:'100%' }}>{wi+1}. {w.name}</span>
                <span style={{ display:'inline-flex', alignItems:'center', gap:3, fontSize:14, color: unlocked ? C.brownSoft : '#8A93A6' }}><GIcon name="star" size={18} />{wStars}/{wMax}</span>
              </button>
            );
          })}
        </div>
        <div style={{ flexShrink:0, padding:'4px 14px 12px' }}>
          <button onClick={() => { sfx.click(); setSelectedWorld(Math.floor(curStage / STAGES_PER_WORLD)); setStagePopup(curStage); }} className="gbtn blue" style={{ width:'100%', height:62, borderRadius:32, fontSize:28, letterSpacing:1.5 }}>STAGE {curStage + 1} 도전</button>
        </div>
        {bottomNav}
        {renderModals()}
      </div>
    );
  }

  // ── 스테이지 선택 (선택한 월드) ─────────────────────────────────────────────
  if (phase === 'map') {
    const w = worldOf(selectedWorld);
    const ids = Array.from({ length: w.to - w.from }, (_, k) => w.from + k);
    const localY = (k:number) => k * MAP_ROW_GAP + 60;
    const wHeight = ids.length * MAP_ROW_GAP + 90;
    const curIdx = curStageOf(progress);
    const numStyle: CSSProperties = { color:'#fff', fontSize:27, lineHeight:1, textShadow:`-1.5px -1.5px 0 ${C.ink}, 1.5px -1.5px 0 ${C.ink}, -1.5px 1.5px 0 ${C.ink}, 1.5px 1.5px 0 ${C.ink}, 0 3px 0 ${C.ink}` };
    return (
      <div style={{ position:'relative', display:'flex', flexDirection:'column', width:'100%', height:'100%', userSelect:'none', background:`linear-gradient(180deg, rgba(255,255,255,0.12) 0%, rgba(24,64,140,0.5) 100%), url(${worldImg(selectedWorld)}) center top / cover no-repeat`, overflow:'hidden' }}>
        <style>{GAME_CSS}</style>
        {topBar}
        <div style={{ flexShrink:0, display:'flex', alignItems:'center', justifyContent:'space-between', padding:'2px 12px 8px', gap:8 }}>
          <button onClick={()=>{ sfx.click(); setPhase('worlds'); }} aria-label="월드 목록" className="gbtn blue" style={{ width:44, height:44, padding:0, borderRadius:14, display:'flex', alignItems:'center', justifyContent:'center' }}><Icon name="back" size={22} color="#fff" /></button>
          <Ribbon size={19}>{w.name}</Ribbon>
          <span style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'0 10px 2px 5px', borderRadius:999, background:C.cream, border:`3px solid ${C.rim}`, color:C.brown, fontSize:15, whiteSpace:'nowrap' }}><GIcon name="star" size={22} />{worldStars(progress, w).reduce((a,b)=>a+b,0)}/{(w.to-w.from)*3}</span>
        </div>
        <div style={{ flex:1, display:'flex', gap:6, margin:'0 8px 8px', minHeight:0 }}>
        <div ref={mapScrollRef} style={{ flex:1, overflowY:'auto', borderRadius:20, background:'rgba(255,255,255,0.12)', border:'3px solid rgba(255,255,255,0.55)', boxShadow:'inset 0 0 24px rgba(10,40,110,0.35)' }}>
          <div style={{ position:'relative', width:'100%', height: wHeight }}>
            <svg style={{ position:'absolute', inset:0, width:'100%', height:'100%', zIndex:1 }}>
              {ids.slice(0,-1).map((gi,k)=>{
                const done = (progress[gi] ?? 0) >= 1;
                const pts = { x1:`${mapNodeX(k)}%`, y1:localY(k), x2:`${mapNodeX(k+1)}%`, y2:localY(k+1) };
                return done
                  ? <g key={gi}><line {...pts} stroke={C.ink} strokeWidth="13" strokeLinecap="round"/><line {...pts} stroke="#FFD54A" strokeWidth="8" strokeLinecap="round"/></g>
                  : <line key={gi} {...pts} stroke="#fff" strokeWidth="7" strokeDasharray="1 14" strokeLinecap="round" opacity="0.9"/>;
              })}
            </svg>
            {ids.map((gi,k)=>{
              const unlocked=isUnlocked(gi); const s=progress[gi]??0; const isCur = gi === curIdx;
              const diff = difficultyOf(gi); const rw = stageReward(gi); const earned = s>=1;
              const fill = !unlocked ? 'linear-gradient(180deg,#B5C0D6,#8593B0)' : isCur ? 'linear-gradient(180deg,#FFD070 0%,#FFB347 48%,#F58A1F 52%,#F2780F 100%)' : 'linear-gradient(180deg,#8CE873 0%,#6FDB55 48%,#35A52E 52%,#2E9628 100%)';
              return (
                <div key={gi}>
                  <button onClick={()=>{ if(unlocked){ sfx.click(); setStagePopup(gi); } }} disabled={!unlocked}
                    style={{ position:'absolute', width:68, height:68, left:`calc(${mapNodeX(k)}% - 34px)`, top:localY(k)-34, zIndex:2, borderRadius:'50%', cursor:unlocked?'pointer':'default', display:'flex', alignItems:'center', justifyContent:'center', padding:0,
                      background:fill, border:'4px solid #fff', boxShadow: isCur ? `0 0 0 3px ${C.orangeDark}, 0 6px 0 3px ${C.orangeDark}, 0 0 22px rgba(255,200,60,0.95)` : `0 0 0 3px ${C.ink}, 0 6px 0 3px ${C.ink}`, animation: isCur ? 'homeStage 1.2s ease-in-out infinite' : undefined }}>
                    {unlocked ? <span style={numStyle}>{gi+1}</span> : <GIcon name="lock" size={34} />}
                  </button>
                  {/* 별 칸 */}
                  {unlocked && earned && (
                    <div style={{ position:'absolute', left:`calc(${mapNodeX(k)}% - 32px)`, top:localY(k)+27, zIndex:3, width:64, display:'flex', justifyContent:'center', gap:0, pointerEvents:'none' }}>
                      {[1,2,3].map(n=><GIcon key={n} name="star" size={22} style={{ opacity: n<=s ? 1 : 0.28, filter: n<=s ? 'none' : 'grayscale(1)', marginTop: n===2 ? 4 : 0 }} />)}
                    </div>
                  )}
                  {unlocked && isCur && (
                    <span style={{ position:'absolute', left:`calc(${mapNodeX(k)}% - 30px)`, top:localY(k)+30, zIndex:3, width:60, textAlign:'center', padding:'0 0 2px', borderRadius:999, background:C.red, border:'2.5px solid #fff', boxShadow:`0 0 0 2px ${C.ink}`, color:'#fff', fontSize:13, pointerEvents:'none' }}>도전!</span>
                  )}
                  {/* 보상 표시: 하트 + 아이템 */}
                  {unlocked && (
                    <div style={{ position:'absolute', left:`calc(${mapNodeX(k)}% + 40px)`, top:localY(k)-22, zIndex:3, display:'flex', flexDirection:'column', gap:4, opacity: earned?0.5:1, pointerEvents:'none' }}>
                      <span style={{ display:'flex', alignItems:'center', gap:3, background:C.cream, borderRadius:999, padding:'0 8px 0 3px', border:`2.5px solid ${C.rim}` }}>
                        <img src={`${BASE}characters/life.png`} alt="" style={{ width:18, height:18, borderRadius:'50%', objectFit:'cover' }}/>
                        <span style={{ fontSize:13, color:C.brown }}>+{rw.hearts}</span>
                      </span>
                      <span style={{ display:'flex', alignItems:'center', gap:2, background:C.cream, borderRadius:999, padding:'0 8px 0 2px', border:`2.5px solid ${C.rim}` }}>
                        <GIcon name={BOOSTER_ICON[rw.booster]} size={20} />
                        <span style={{ fontSize:13, color:C.brown }}>+1</span>
                      </span>
                    </div>
                  )}
                  <span style={{ display:'none' }}>{diff.label}</span>
                </div>
              );
            })}
          </div>
        </div>
        {/* 우측 진행 막대 — 이 월드에서 클리어한 만큼 아래→위로 */}
        {(() => {
          const count = w.to - w.from;
          const clearedN = worldStars(progress, w).filter(x => x >= 1).length;
          const frac = count > 0 ? clearedN / count : 0;
          return (
            <div style={{ width:34, flexShrink:0, display:'flex', justifyContent:'center', padding:'8px 0' }}>
              <div style={{ position:'relative', width:14, borderRadius:999, background:C.cream, border:`3px solid ${C.ink}` }}>
                <div style={{ position:'absolute', left:0, right:0, bottom:0, height:`${frac*100}%`, borderRadius:999, background:'linear-gradient(0deg,#35A52E,#8CE873)', transition:'height 0.4s ease' }}/>
                <span style={{ position:'absolute', left:'50%', top:-14, transform:'translateX(-50%)' }}><GIcon name="star" size={26} /></span>
                <img src={`${BASE}characters/face6.png`} alt="" style={{ position:'absolute', left:'50%', bottom:`${frac*100}%`, transform:'translate(-50%,50%)', width:36, height:36, maxWidth:'none', objectFit:'contain', filter:'drop-shadow(0 3px 2px rgba(0,0,0,0.5))', transition:'bottom 0.4s ease' }}/>
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
    <div style={{ display:'flex', flexDirection:'column', width:'100%', height:'100%', overflow:'hidden', position:'relative', background:'#5DA8E8', userSelect:'none', animation: screenShake ? 'screenShake 0.32s ease' : undefined }}>
      <style>{GAME_CSS}</style>

      {/* 풍경 배경(직접 그림) */}
      <PlayBackdrop />
      {/* 떠다니는 장식(꽃잎·반짝임) */}
      <div aria-hidden style={{ position:'absolute', inset:0, zIndex:1, pointerEvents:'none', overflow:'hidden' }}>
        {[0,1,2,3,4,5].map(i => (
          <span key={i} style={{ position:'absolute', top:'-8%', left:`${7+i*15}%`, fontSize:`${13+(i%3)*5}px`, opacity:0.85, animation:`petalFall ${9+i*1.7}s linear ${i*1.3}s infinite` }}>{i===3 ? <Spark size={16} /> : <Petal color={i%3===1 ? 'green' : i===2 ? 'yellow' : 'pink'} size={14 + (i%3)*5} />}</span>
        ))}
        {[0,1,2,3].map(i => (
          <span key={`t${i}`} style={{ position:'absolute', top:`${13+i*21}%`, left:`${i%2?86:9}%`, fontSize:12, animation:`twinkle ${1.8+i*0.4}s ease-in-out ${i*0.5}s infinite` }}><Spark size={14} /></span>
        ))}
      </div>
      {/* 콤보 컬러 플래시 */}
      {flash && <div key={flash.id} aria-hidden style={{ position:'absolute', inset:0, zIndex:35, pointerEvents:'none', background:`radial-gradient(circle at 50% 45%, transparent 25%, ${flash.color} 100%)`, animation:'screenFlash 0.42s ease-out forwards' }}/>}
      {/* 상단 HUD — 3칸 패널: 남은 이동 · STAGE 리본+목표 · 별+점수 진행 */}
      <div style={{ flexShrink:0, position:'relative', zIndex:10, margin:'calc(var(--sat) + 40px) 10px 0', zoom:uiK }}>
        <div style={{ display:'flex', alignItems:'stretch', gap:8, padding:8, background:C.cream, borderRadius:28, border:`5px solid ${C.rim}`, boxShadow:`0 0 0 2px ${C.rimDark}, 0 6px 0 2px ${C.rimDark}, 0 14px 22px rgba(10,30,90,0.35), inset 0 0 0 2px #fff` }}>
          {/* 남은 이동 */}
          <div style={{ flexShrink:0, width:86, borderRadius:20, background:'linear-gradient(180deg,#FFFFFF,#EEF0F5)', border:'3px solid #DCE1EA', boxShadow:'inset 0 -5px 0 #D5DBE6', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'2px 0 4px' }}>
            <span style={{ fontSize:50, lineHeight:1, color: movesLeft<=5 ? '#E5483A' : '#46AE2C', WebkitTextStroke:'2px #fff', paintOrder:'stroke fill', textShadow:'0 3px 0 rgba(0,0,0,0.13)', animation: movesLeft<=5 ? 'pulseWarn 0.6s ease infinite' : undefined }}>{condLabel}</span>
            <span style={{ fontSize:11, color:C.brownSoft, marginTop:-2 }}>남은 이동</span>
          </div>
          {/* STAGE 리본 + 목표 */}
          <div style={{ position:'relative', flex:1, minWidth:0, borderRadius:20, background:'linear-gradient(180deg,#D6E8F8,#C3DCF0)', border:'3px solid #B2CFE8', boxShadow:'inset 0 3px 0 rgba(255,255,255,0.65)', padding:'22px 6px 6px', display:'flex', justifyContent:'center', alignItems:'center', gap:12 }}>
            <div style={{ position:'absolute', top:-13, left:0, right:0, display:'flex', justifyContent:'center' }}><Ribbon size={14}>STAGE {lvlIdx+1}</Ribbon></div>
            {targets.map((x, i) => (
              <div key={i} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:1, minWidth:34 }}>
                <div style={{ height:38, display:'flex', alignItems:'center' }}>{targetIcon(x.t, 36)}</div>
                {x.left > 0
                  ? <span style={{ fontSize:20, lineHeight:1, color:C.brown, fontVariantNumeric:'tabular-nums', WebkitTextStroke:'1.5px #fff', paintOrder:'stroke fill' }}>{x.left}</span>
                  : <span style={{ width:20, height:20, borderRadius:'50%', background:'#58B04A', display:'flex', alignItems:'center', justifyContent:'center', animation:'starPop 0.5s cubic-bezier(0.34,1.56,0.64,1) both' }}><GIcon name="check" size={13} /></span>}
              </div>
            ))}
          </div>
          {/* 별 + 점수 진행 */}
          <div style={{ position:'relative', flexShrink:0, width:100, borderRadius:20, background:'linear-gradient(180deg,#FFFFFF,#EEF0F5)', border:'3px solid #DCE1EA', boxShadow:'inset 0 -5px 0 #D5DBE6', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:5, padding:'4px 6px' }}>
            <div style={{ display:'flex', alignItems:'flex-end', gap:0 }}>
              {[1,2,3].map(n => (
                <span key={n} style={{ display:'flex', marginBottom: n===2 ? 4 : 0, filter: n<=curStars ? 'drop-shadow(0 0 5px rgba(255,200,0,0.9))' : 'grayscale(1) brightness(1.2)', opacity: n<=curStars ? 1 : 0.55, transition:'filter 0.3s, opacity 0.3s, transform 0.3s', transform: n<=curStars ? 'scale(1.12)' : 'scale(1)' }}><GIcon name="star" size={n===2 ? 30 : 26} /></span>
              ))}
            </div>
            <div style={{ position:'relative', width:'100%', height:13, borderRadius:999, background:'#2B3358', boxShadow:'inset 0 2px 3px rgba(0,0,0,0.5)', overflow:'hidden' }}>
              <div style={{ position:'absolute', left:0, top:0, bottom:0, width:`${Math.min((score/lvl.goal[1])*100,100)}%`, borderRadius:999, background:'linear-gradient(180deg,#FFE27A,#FFB300)', transition:'width 0.3s ease' }}/>
              {[lvl.goal[0]].map((gv,i) => <div key={i} style={{ position:'absolute', top:0, bottom:0, left:`${(gv/lvl.goal[1])*100}%`, width:2, background:'rgba(255,255,255,0.7)' }}/>)}
            </div>
            <span style={{ fontSize:15, lineHeight:1, color:C.brown, fontVariantNumeric:'tabular-nums' }}>{score.toLocaleString()}</span>
            {/* 점수 떠오르는 숫자 */}
            <div style={{ position:'absolute', top:-6, left:0, right:0, display:'flex', justifyContent:'center', pointerEvents:'none', zIndex:20 }}>
              {floats.map(f => (
                <span key={f.id} style={{ position:'absolute', fontSize:'clamp(15px,4.2vw,18px)', color:'#FF8A00', textShadow:'0 2px 0 #fff, 0 0 8px rgba(255,170,0,0.7)', animation:'floatUp 1.1s ease-out both', whiteSpace:'nowrap' }}>{f.text}</span>
              ))}
            </div>
          </div>
        </div>
        {/* 헤더 우상단 정지 버튼 */}
        <button onClick={()=>{ sfx.click(); pausedRef.current = true; setShowPause(true); }} aria-label="일시정지" className="gbtn blue" style={{ position:'absolute', top:-13, right:-6, width:42, height:42, padding:0, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', zIndex:12 }}>
          <Icon name="pause" size={20} color="#fff" />
        </button>
      </div>

      {/* Hint button */}
      {phase==='play' && (
        <div style={{ position:'absolute', top:'calc(var(--sat) + 8px)', right:10, zIndex:15, pointerEvents:'none' }}>
          {hintPair && (
            <div style={{ fontSize:9, fontWeight:800, color:'rgba(255,220,0,0.9)', textShadow:'0 1px 4px rgba(0,0,0,0.6)', letterSpacing:1, animation:'splashPulse 1s ease infinite', paddingTop:2 }}>HINT</div>
          )}
        </div>
      )}

      {/* 하트 감소 강조 토스트 (스테이지 시작 시 3초) */}
      {phase==='play' && lifeLossToast && (
        <div style={{ position:'absolute', top:`calc(var(--sat) + ${Math.round(215*uiK)}px)`, left:0, right:0, zIndex:27, display:'flex', justifyContent:'center', pointerEvents:'none' }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, padding:'3px 18px 5px 6px', borderRadius:999, background:'linear-gradient(180deg,#FF8576 0%,#FF8576 48%,#E5483A 52%,#E5483A 100%)', border:'4px solid #fff', boxShadow:`0 0 0 3px ${C.ink}, 0 6px 0 3px ${C.ink}, 0 10px 16px rgba(0,0,0,0.35)`, animation:'comboIn 0.4s cubic-bezier(0.34,1.56,0.64,1) both' }}>
            <img src={`${BASE}characters/life.png`} alt="" style={{ width:30, height:30, borderRadius:'50%', objectFit:'cover', border:'2px solid #fff' }}/>
            <span style={{ fontSize:20, color:'#fff', textShadow:'0 2px 0 #8E2217' }}>하트 −1</span>
            <span style={{ fontSize:15, color:'#FFE3DC', textShadow:'0 1px 0 #8E2217' }}>남은 {lives}/{LIVES_MAX}</span>
          </div>
        </div>
      )}

      {/* 튜토리얼 코칭 배너 (실제 플레이 가이드) */}
      {phase==='play' && tutorialPlay && (
        <div style={{ position:'absolute', top:'calc(var(--sat) + 92px)', left:0, right:0, zIndex:26, display:'flex', flexDirection:'column', alignItems:'center', gap:6, padding:'0 16px', pointerEvents:'none' }}>
          <div style={{ maxWidth:340, padding:'10px 16px', borderRadius:16, background:'linear-gradient(135deg,#1565C0,#0D47A1)', border:'2px solid #FFE566', boxShadow:'0 6px 20px rgba(0,0,0,0.5)', color:'white', fontSize:13, fontWeight:800, textAlign:'center', lineHeight:1.45, animation:'splashPulse 1.4s ease infinite' }}>
            {tutMatches===0 ? '반짝이는 두 블럭을 드래그해 같은 친구 3개를 맞춰보세요!'
              : tutMatches===1 ? '잘했어요! 계속 3개 이상 맞춰볼까요?'
              : tutMatches===2 ? '한 번에 4개를 맞추면 특수 블럭이 생겨요!'
              : '위의 목표 블럭을 모아보세요'}
            <div style={{ marginTop:6, display:'flex', justifyContent:'center', gap:4 }}>
              {Array.from({length:TUT_GOAL_MATCHES}).map((_,i)=>(
                <span key={i} style={{ width:8, height:8, borderRadius:'50%', background: i<tutMatches ? '#FFE566' : 'rgba(255,255,255,0.3)' }}/>
              ))}
            </div>
          </div>
          <button onClick={()=>{ tutorialPlayRef.current=false; setTutorialPlay(false); }} style={{ pointerEvents:'auto', background:'rgba(0,0,0,0.5)', border:'1px solid rgba(255,255,255,0.3)', color:'rgba(255,255,255,0.85)', fontSize:11, fontWeight:800, borderRadius:999, padding:'4px 12px', cursor:'pointer' }}>튜토리얼 건너뛰기</button>
        </div>
      )}

      {/* Combo / Special popup */}
      {popup && (
        <div style={{ position:'absolute', zIndex:30, pointerEvents:'none', display:'flex', justifyContent:'center', top:'23%', left:0, right:0 }}>
          <div key={popup} style={{
            padding: popKind==='special' ? '6px 28px 9px' : '5px 22px 8px',
            borderRadius: 999,
            fontSize: popKind==='special' ? 'clamp(20px,5.4vw,25px)' : 'clamp(17px,4.6vw,21px)',
            color: '#fff', letterSpacing: 0.5,
            background: popKind==='special' ? 'linear-gradient(180deg,#FF8576 0%,#FF8576 48%,#E5483A 52%,#E5483A 100%)' : 'linear-gradient(180deg,#FFC25A 0%,#FFC25A 48%,#F58A1F 52%,#F58A1F 100%)',
            border: '4px solid #fff',
            boxShadow: `0 0 0 3px ${C.ink}, 0 6px 0 3px ${C.ink}, 0 12px 18px rgba(0,0,0,0.35)`,
            textShadow: `0 2px 0 ${popKind==='special' ? '#8E2217' : '#A8530A'}`,
            whiteSpace: 'nowrap',
            animation: 'comboIn 0.38s cubic-bezier(0.34,1.56,0.64,1) both',
          }}>{noEmoji(popup)}</div>
        </div>
      )}

      {/* Grid */}
      <div style={{ flex:1, minHeight:0, display:'flex', alignItems:'center', justifyContent:'center', position:'relative', zIndex:10, padding:'6px 6px clamp(8px,2vh,14px)' }}>
        {/* 보드: 정사각. 컬럼 폭과 세로 가용공간 중 작은 값에 맞춰 리사이징(index.css .board-fit) — 모든 폰·태블릿 대응 */}
        <div className="board-fit" style={{ padding:'clamp(5px,1.4vw,8px)', ['--rsv' as string]: `${Math.round(300*uiK)}px` }}>
          <div
            onPointerMove={onGridPointerMove}
            onPointerUp={onGridPointerUp}
            onPointerLeave={onGridPointerUp}
            onPointerCancel={() => { dragRef.current = null; }}
            style={{ position:'relative', display:'grid', gridTemplateColumns:`repeat(${COLS},1fr)`, gap:'var(--g)', touchAction:'none', ['--g' as string]:'clamp(1px,0.5vw,3px)' } as CSSProperties}>
            {/* 판: 블럭이 있는 칸(레벨 모양)만 회색 칸으로, 칸들이 이어진 모양 둘레에 밝은 테두리 — 젤리 칸은 분홍 */}
            <div aria-hidden style={{ position:'absolute', inset:0, zIndex:0, pointerEvents:'none' }}>
              {(['rim','base','tile'] as const).map(layer => (
                <div key={layer} style={{ position:'absolute', inset:0, display:'grid', gridTemplateColumns:`repeat(${COLS},1fr)`, gap:'var(--g)' }}>
                  {Array.from({ length: ROWS * COLS }, (_, i) => {
                    const r = Math.floor(i / COLS), c = i % COLS;
                    if (curMap[r]?.[c] !== 1) return <div key={i} style={{ aspectRatio:'1' }}/>;
                    if (layer === 'rim')  return <div key={i} style={{ aspectRatio:'1', borderRadius:11, background:'#E4EAF3', boxShadow:'0 0 0 calc(var(--g) + 4px) #E4EAF3, 0 6px 14px 4px rgba(10,30,90,0.3)' }}/>;
                    if (layer === 'base') return <div key={i} style={{ aspectRatio:'1', borderRadius:11, background:'#2E343E', boxShadow:'0 0 0 var(--g) #2E343E' }}/>;
                    return jelly[r]?.[c]
                      ? <div key={i} style={{ aspectRatio:'1', borderRadius:11, background:'linear-gradient(145deg, rgba(255,150,208,0.95), rgba(214,64,150,0.95))', boxShadow:'inset 0 3px 0 rgba(255,255,255,0.45), 0 0 12px 2px rgba(255,90,175,0.8)' }}/>
                      : <div key={i} style={{ aspectRatio:'1', borderRadius:11, background:'linear-gradient(180deg,#505865,#3F4651)', boxShadow:'inset 0 2px 0 rgba(255,255,255,0.12), inset 0 -3px 0 rgba(0,0,0,0.18)' }}/>;
                  })}
                </div>
              ))}
            </div>
            {/* 폭탄·아이템 사용 시 터지는 칸에 불길 효과 */}
            {flames.map(f => (
              <span key={f.id} style={{
                position:'absolute',
                left:`${((f.c+0.5)/COLS)*100}%`,
                top:`${((f.r+0.5)/ROWS)*100}%`,
                width:'clamp(22px,6vw,32px)', height:'clamp(22px,6vw,32px)',
                lineHeight:1,
                pointerEvents:'none',
                zIndex:6,
                filter:'drop-shadow(0 0 7px rgba(255,110,0,0.95)) drop-shadow(0 0 3px rgba(255,210,0,0.9))',
                animation:'flameBurst 0.6s ease-out forwards',
              }}><GIcon name="flame" size="100%" /></span>
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
              }}><Spark size={26} /></span>
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
              }}><Spark size={24} /></span>
            ))}
            {/* 도토리 출구 표시 — 도토리가 있는 열의 맨 아래 칸 아래쪽에 ⬇ (블럭 위 레이어) */}
            {Array.from({ length: COLS }, (_, c) => {
              if (!grid.some(row => row[c]?.kind === 'ing')) return null;
              let lowest = -1; for (let rr = ROWS - 1; rr >= 0; rr--) if (curMap[rr]?.[c]) { lowest = rr; break; }
              if (lowest < 0) return null;
              return (
                <span key={`exit${c}`} aria-hidden style={{ position:'absolute', left:`${((c+0.5)/COLS)*100}%`, top:`${((lowest+1)/ROWS)*100}%`, transform:'translate(-50%,-55%)', zIndex:9, pointerEvents:'none',
                  fontSize:'clamp(16px,4.6vw,22px)', lineHeight:1, color:'#FFD54A', fontWeight:900, textShadow:'0 0 6px #000, 0 0 10px rgba(255,200,0,0.95)', animation:'idleBob 0.9s ease-in-out infinite' }}>⬇</span>
              );
            })}
            {/* 위치별 점수/콤보 팝업 */}
            {scorePops.map(s => (
              <span key={s.id} style={{
                position:'absolute',
                left:`${((s.c+0.5)/COLS)*100}%`,
                top:`${((s.r+0.5)/ROWS)*100}%`,
                fontWeight:900,
                fontSize: s.big ? 'clamp(15px,4.6vw,21px)' : 'clamp(12px,3.6vw,15px)',
                color: s.big ? '#FFD54A' : '#ffffff',
                textShadow:'0 2px 4px rgba(0,0,0,0.65), 0 0 10px rgba(255,180,0,0.6)',
                pointerEvents:'none', zIndex:9, whiteSpace:'nowrap',
                animation:'scorePopUp 0.9s ease-out forwards',
              }}>{s.text}</span>
            ))}
            {Array.from({ length: ROWS * COLS }, (_, idx) => {
              const row = Math.floor(idx / COLS);
              const col = idx % COLS;
              const cell = grid[row]?.[col] ?? null;
              const active = curMap[row]?.[col] === 1;

              if (!active) {
                // 블럭이 없는 칸은 틀 없이 비워 둬요(자리만 유지)
                return <div key={`hole-${row}-${col}`} style={{ aspectRatio:'1' }}/>;
              }

              if (!cell) return <div key={`empty-${row}-${col}`} style={{ aspectRatio:'1' }}/>;

              // 장애물(돌) — 이동 불가, 인접 블럭이 터지면 부서져요
              if (cell.kind === 'rock') {
                return (
                  <div key={cell.id} style={{
                    aspectRatio:'1', position:'relative', overflow:'hidden', borderRadius:'30%',
                    background:'linear-gradient(150deg,#9aa3ad 0%,#6b7480 55%,#4a525c 100%)',
                    border:'3px solid #3b424b',
                    boxShadow:'inset 0 4px 8px rgba(255,255,255,0.35), inset 0 -5px 10px rgba(0,0,0,0.5), 0 3px 8px rgba(0,0,0,0.45)',
                    display:'flex', alignItems:'center', justifyContent:'center',
                    animation: cell.hit ? 'popOut 0.6s ease-out forwards' : undefined,
                  }}>
                    <span style={{ width:'78%', height:'78%', display:'flex' }}><GIcon name="rock" size="100%" /></span>
                    {cell.hit && <div style={{ position:'absolute', inset:'-20%', borderRadius:'50%', zIndex:4, pointerEvents:'none', background:'radial-gradient(circle, #fff 0%, #b0b8c0 45%, transparent 70%)', animation:'popFlash 0.32s ease-out forwards' }}/>}
                  </div>
                );
              }

              // 장애물(상자) — 인접 매치로 hp가 줄고, 다 부수면 열려요(단계형)
              if (cell.kind === 'crate') {
                const hp = cell.hp ?? 1;
                return (
                  <div key={cell.id} style={{
                    aspectRatio:'1', position:'relative', overflow:'hidden', borderRadius:'22%',
                    background: hp >= 2 ? 'linear-gradient(150deg,#D8A263 0%,#A9723C 60%,#7E5227 100%)' : 'linear-gradient(150deg,#E7BE86 0%,#C08A4E 60%,#8E5F2E 100%)',
                    border:'3px solid #6E4520',
                    boxShadow:'inset 0 4px 8px rgba(255,255,255,0.3), inset 0 -5px 10px rgba(0,0,0,0.45), 0 3px 8px rgba(0,0,0,0.4)',
                    display:'flex', alignItems:'center', justifyContent:'center',
                    animation: cell.hit ? 'popOut 0.6s ease-out forwards' : undefined,
                  }}>
                    <span style={{ width:'74%', height:'74%', display:'flex' }}><GIcon name="crate" size="100%" /></span>
                    {hp < 2 && <span style={{ position:'absolute', inset:0, pointerEvents:'none', background:'repeating-linear-gradient(48deg, transparent 0 7px, rgba(0,0,0,0.16) 7px 9px)' }}/>}
                    <span style={{ position:'absolute', bottom:2, right:3, fontSize:9, fontWeight:900, color:'#fff', textShadow:'0 1px 2px rgba(0,0,0,0.7)' }}>{hp}</span>
                    {cell.hit && <div style={{ position:'absolute', inset:'-20%', borderRadius:'50%', zIndex:4, pointerEvents:'none', background:'radial-gradient(circle, #fff 0%, #e0b070 45%, transparent 70%)', animation:'popFlash 0.32s ease-out forwards' }}/>}
                  </div>
                );
              }

              // 도토리 — 스왑으로만 이동, 출구에 닿으면 수집
              if (cell.kind === 'ing') {
                const sel2 = sel?.[0]===row && sel?.[1]===col;
                return (
                  <button key={cell.id} onPointerDown={(e)=>onTilePointerDown(e,row,col)} disabled={phase==='end'} aria-label="도토리"
                    style={{ aspectRatio:'1', position:'relative', borderRadius:'50%', padding:0, touchAction:'none', cursor:'pointer',
                      background:'radial-gradient(circle at 50% 35%, #FFF1C9, #F2B455)', border: sel2 ? '3px solid white' : '3px solid #B86A1F',
                      boxShadow:'0 0 12px rgba(255,190,80,0.75), inset 0 -3px 6px rgba(0,0,0,0.2)', display:'flex', alignItems:'center', justifyContent:'center',
                      transform: cell.hit ? undefined : sel2 ? 'scale(1.15)' : 'scale(1)',
                      animation: cell.hit ? 'ingDrop 0.6s ease-in forwards' : 'tileIdle 2.4s ease-in-out infinite' }}>
                    <span style={{ width:'80%', height:'80%', display:'flex' }}><GIcon name="acorn" size="100%" /></span>
                  </button>
                );
              }

              const tile = TILES[cell.t];
              const isSel = sel?.[0]===row && sel?.[1]===col;
              const isSpecial = cell.kind !== 'normal';
              const isHint = phase==='play' && hintPair !== null && (
                (hintPair[0][0]===row && hintPair[0][1]===col) ||
                (hintPair[1][0]===row && hintPair[1][1]===col)
              );

              const sc = SPECIAL_COLOR[cell.kind] ?? '#FF7043';
              const faceFilter = isSel
                ? 'drop-shadow(0 0 10px #fff) drop-shadow(0 0 4px #fff)'
                : isSpecial
                ? `drop-shadow(0 0 9px ${sc}) drop-shadow(0 0 4px ${sc}) drop-shadow(0 3px 3px rgba(0,0,0,0.45))`
                : 'drop-shadow(0 3px 3px rgba(0,0,0,0.5))';
              return (
                <button key={cell.id}
                  onPointerDown={(e)=>onTilePointerDown(e,row,col)}
                  disabled={phase==='end'}
                  aria-label="블럭"
                  style={{
                    aspectRatio:'1', position:'relative', padding:0, border:'none', background:'transparent', overflow:'visible',
                    touchAction:'none', cursor:'pointer',
                    transform: cell.hit ? undefined : isSel ? 'scale(1.16)' : 'scale(1)',
                    transition: 'transform 0.12s ease',
                    zIndex: isSel || isHint ? 3 : 1,
                    animation: cell.hit
                      ? 'popOut 0.6s ease-out forwards'
                      : isSel
                      ? 'selectPop 0.3s ease-out'
                      : isHint
                      ? 'hintGlow 0.75s ease infinite'
                      : isSpecial
                      ? 'specialPulse 1.1s ease-in-out infinite'
                      : `tileIdle 2.8s ease-in-out ${((row*COLS+col)%9)*0.17}s infinite`,
                  }}>
                  {isSpecial ? (
                    /* 특수 블럭 — 고슴도치와 완전히 분리된 아이콘 블럭(얼굴 없음) */
                    <span style={{ position:'absolute', inset:'4%', borderRadius:'26%', display:'flex', alignItems:'center', justifyContent:'center', pointerEvents:'none',
                      background:`radial-gradient(circle at 35% 25%, #fff 0%, ${sc} 62%, ${sc} 100%)`, border:'3px solid #fff',
                      boxShadow: isSel ? '0 0 14px #fff, 0 4px 8px rgba(0,0,0,0.4)' : `0 0 12px ${sc}, 0 4px 8px rgba(0,0,0,0.4), inset 0 -5px 8px rgba(0,0,0,0.22)` }}>
                      <span aria-hidden style={{ position:'absolute', top:'5%', left:'14%', width:'72%', height:'34%', borderRadius:'50%', background:'linear-gradient(180deg,rgba(255,255,255,0.75),rgba(255,255,255,0))' }}/>
                      <span style={{ width:'68%', height:'68%', display:'flex', position:'relative' }}><GIcon name={SPECIAL_GICON[cell.kind] ?? 'bolt'} bare size="100%" /></span>
                    </span>
                  ) : (
                    /* 캐릭터 얼굴만 — 칸보다 살짝 크게 그려 애니팡처럼 꽉 차 보이게 */
                    <img src={tile.img} alt="" draggable={false} style={{ position:'absolute', left:'-6%', top:'-6%', width:'112%', height:'112%', objectFit:'contain', pointerEvents:'none', filter: faceFilter }}/>
                  )}
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
            <GIcon name={BOOSTER_ICON[boosterMode]} size={24} /> 적용할 블럭 선택! (다시 탭하면 취소)
          </div>
        </div>
      )}

      {/* 하단 — 캐릭터 아바타(좌) + 파란 유리 구슬 아이템(우) */}
      {phase==='play' && (
        <div style={{ flexShrink:0, position:'relative', zIndex:12, display:'flex', alignItems:'flex-end', gap:6, padding:'4px 12px calc(var(--sab) + 12px) 12px', width:'100%', boxSizing:'border-box', zoom:uiK }}>
          <div style={{ flexShrink:0, width:48, aspectRatio:'1', borderRadius:16, overflow:'hidden', border:'4px solid #fff', boxShadow:'0 6px 12px rgba(10,30,90,0.4)', background:'radial-gradient(circle at 50% 30%, #FFF3D6, #FFD98A)', animation:'avatarPop 3.2s ease-in-out infinite' }}>
            <img src={`${BASE}characters/face6.png`} alt="" style={{ width:'112%', height:'112%', margin:'-6%', maxWidth:'none', objectFit:'contain' }}/>
          </div>
          <div style={{ flex:1, display:'flex', flexWrap:'wrap', justifyContent:'flex-end', gap:'8px 6px' }}>
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
                aria-label={b.name}
                style={{
                  position:'relative', width:50, aspectRatio:'1', borderRadius:'50%', padding:0, cursor:'pointer',
                  display:'flex', alignItems:'center', justifyContent:'center',
                  background: armed ? 'radial-gradient(circle at 35% 25%, #FFF3C4 0%, #FFC25A 55%, #F58A1F 100%)' : 'radial-gradient(circle at 35% 25%, #DDF2FF 0%, #6FBFF6 52%, #2C80D8 100%)',
                  border:'3px solid rgba(255,255,255,0.95)',
                  boxShadow: armed ? '0 0 18px rgba(255,170,40,0.95), 0 6px 9px rgba(10,30,90,0.4)' : '0 6px 9px rgba(10,30,90,0.4), inset 0 -6px 9px rgba(20,70,170,0.4)',
                  opacity: cnt <= 0 ? 0.62 : 1, transition:'all 0.15s ease', transform: armed ? 'translateY(-5px) scale(1.06)' : 'none',
                }}>
                <span aria-hidden style={{ position:'absolute', top:'5%', left:'16%', width:'68%', height:'38%', borderRadius:'50%', background:'linear-gradient(180deg,rgba(255,255,255,0.8),rgba(255,255,255,0))', pointerEvents:'none' }}/>
                <span style={{ display:'flex', position:'relative', zIndex:1 }}><GIcon name={BOOSTER_ICON[b.kind]} bare size={30} /></span>
                <span style={{ position:'absolute', bottom:-6, right:-6, minWidth:24, height:24, padding:'0 5px', borderRadius:999, zIndex:2,
                  background: cnt > 0 ? 'linear-gradient(180deg,#FFB347,#F2780F)' : '#9AA3B2', border:'3px solid #fff', boxShadow:'0 2px 4px rgba(10,30,90,0.4)', color:'#fff', fontSize:14,
                  display:'flex', alignItems:'center', justifyContent:'center' }}>{cnt}</span>
              </button>
            );
          })}
          <button onClick={() => setShowShop(true)} aria-label="상점"
            style={{ position:'relative', width:50, aspectRatio:'1', borderRadius:'50%', padding:0, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center',
              background:'radial-gradient(circle at 35% 25%, #FFF3C4 0%, #FFC25A 55%, #F58A1F 100%)', border:'3px solid rgba(255,255,255,0.95)', boxShadow:'0 6px 9px rgba(10,30,90,0.4), inset 0 -6px 9px rgba(180,90,10,0.35)' }}>
            <span aria-hidden style={{ position:'absolute', top:'5%', left:'16%', width:'68%', height:'38%', borderRadius:'50%', background:'linear-gradient(180deg,rgba(255,255,255,0.8),rgba(255,255,255,0))', pointerEvents:'none' }}/>
            <span style={{ display:'flex', position:'relative', zIndex:1 }}><GIcon name="shop" size={30} /></span>
          </button>
          </div>
        </div>
      )}

      {/* 일시정지 */}
      {phase==='play' && showPause && (
        <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(14,34,84,0.78)', padding:20, zIndex:40 }}>
          <Panel maxWidth={310} style={{ padding:'38px 16px 16px', display:'flex', flexDirection:'column', gap:10, animation:'popIn 0.3s cubic-bezier(0.34,1.56,0.64,1) both' }}>
            <div style={{ position:'absolute', top:-26, left:0, right:0, display:'flex', justifyContent:'center' }}><Ribbon size={22}>일시정지</Ribbon></div>
            <button className="gbtn green" onClick={()=>{ sfx.click(); pausedRef.current = false; setShowPause(false); }} style={{ height:58, fontSize:24, borderRadius:20 }}>계속하기</button>
            <button className="gbtn blue" onClick={()=>{ sfx.click(); sSet(STREAK_BASE, 0); setStreak(0); startLevel(lvlIdx); }} style={{ height:48, fontSize:19, borderRadius:16 }}>다시하기</button>
            <button className="gbtn cream" onClick={()=>{ const m = toggleMuted(); setMutedState(m); if (!m) { sfx.click(); primeAudio(); startBgm(); } else stopBgm(); }} style={{ height:48, fontSize:18, borderRadius:16, display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}><Icon name={muted ? 'mute' : 'sound'} size={20} color={C.brown} /> {muted ? '소리 켜기' : '소리 끄기'}</button>
            <button className="gbtn red" onClick={()=>{ sfx.click(); sSet(STREAK_BASE, 0); setStreak(0); pausedRef.current = false; setShowPause(false); setSelectedWorld(Math.floor(lvlIdx/STAGES_PER_WORLD)); setPhase('map'); }} style={{ height:48, fontSize:18, borderRadius:16 }}>나가기</button>
          </Panel>
        </div>
      )}

      {/* 앱 종료 확인 모달 (안드로이드 뒤로가기 시 종료 확인) */}
      {showExit && (
        <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(14,34,84,0.78)', padding:20, zIndex:70 }}>
          <Panel maxWidth={300} style={{ padding:'26px 16px 16px', textAlign:'center' }}>
            <div style={{ fontSize:21, color:C.brown, lineHeight:1.4 }}>리니와도리의 가시소동을<br/>종료할까요?</div>
            <div style={{ display:'flex', gap:10, marginTop:16 }}>
              <button className="gbtn cream" onClick={()=>{ sfx.click(); setShowExit(false); }} style={{ flex:1, height:52, fontSize:18, borderRadius:18 }}>닫기</button>
              <button className="gbtn blue" onClick={()=>{ setShowExit(false); closeApp(); }} style={{ flex:1, height:52, fontSize:18, borderRadius:18 }}>종료하기</button>
            </div>
          </Panel>
        </div>
      )}

      {renderModals()}

      {/* 결과 화면 */}
      {phase==='end' && (
        <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(14,34,84,0.78)', padding:20, zIndex:20, overflow:'hidden' }}>
          {/* 색종이 */}
          {confetti.map(p => (
            <span key={p.id} style={{ position:'absolute', top:0, left:`${p.left}%`, width: 8 + (p.id % 3) * 3, height: 12 + (p.id % 2) * 6, borderRadius: p.id % 2 ? 2 : 6, background:p.color, border:`1.5px solid ${C.ink}`, pointerEvents:'none', animation:`confettiFall ${1.6+p.delay}s ease-in ${p.delay}s forwards` }}/>
          ))}
          <Panel maxWidth={340} style={{ padding:'40px 16px 16px', textAlign:'center', animation:'popIn 0.4s cubic-bezier(0.34,1.56,0.64,1) both' }}>
            <div style={{ position:'absolute', top:-28, left:0, right:0, display:'flex', justifyContent:'center' }}>
              <Ribbon size={24}>{endStars>=1 ? `STAGE ${lvlIdx+1} 클리어!` : nearMiss ? '아깝다!' : '게임 종료'}</Ribbon>
            </div>
            <div style={{ display:'flex', justifyContent:'center', alignItems:'flex-end', gap:6, margin:'2px 0 6px' }}>
              {[1,2,3].map(n => (
                <GIcon key={n} name="star" size={n===2 ? 78 : 62} style={{ marginBottom: n===2 ? 6 : 0, filter: n<=endStars ? 'drop-shadow(0 0 10px rgba(255,200,0,0.9))' : 'grayscale(1) brightness(1.15)', opacity: n<=endStars ? 1 : 0.4, animation: n<=endStars ? `starPop 0.55s ${0.3 + (n-1)*0.4}s cubic-bezier(0.34,1.56,0.64,1) both` : undefined }} />
              ))}
            </div>
            <div style={{ fontSize:14, color:C.brownSoft }}>최종 점수</div>
            <div style={{ fontSize:46, color:C.brown, lineHeight:1.05 }}>{score.toLocaleString()}</div>
            <div style={{ fontSize:14, color:C.brownSoft, marginTop:2 }}>터트린 블럭 {blocksPopped.toLocaleString()}개</div>
            <div style={{ fontSize:16, color: nearMiss ? C.red : C.brown, margin:'8px 0 4px', lineHeight:1.35 }}>
              {nearMiss ? `목표까지 ${remainTotal}개 남았어요!` : endStars===0 ? '목표를 모두 모으면 다음 스테이지가 열려요!' : endStars===1 ? '클리어! 점수를 더 모으면 별이 늘어요' : endStars===2 ? '훌륭해요! 조금만 더!' : '완벽해요! 대단해요!'}
            </div>
            {coinsEarned > 0 && (
              <div style={{ margin:'6px 0', display:'inline-flex', alignItems:'center', gap:6, padding:'1px 16px 3px 8px', borderRadius:999, background:'#FFF0B8', border:`3px solid ${C.orange}`, color:C.brown, fontSize:20, animation:'starPop 0.5s 0.4s cubic-bezier(0.34,1.56,0.64,1) both' }}>
                <GIcon name="coin" size={30} />+{coinsEarned.toLocaleString()}
              </div>
            )}
            <div style={{ display:'flex', justifyContent:'center', gap:14, margin:'4px 0 12px', fontSize:13, color:C.brownSoft }}>
              {[lvl.goal[0], lvl.goal[1]].map((gv,i)=>(
                <span key={i} style={{ display:'inline-flex', alignItems:'center', gap:2, opacity: score>=gv ? 1 : 0.5 }}>{Array.from({length:i+2}, (_,k)=><GIcon key={k} name="star" size={14} />)} {gv.toLocaleString()}</span>
              ))}
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <button className={`gbtn ${endStars===0 ? 'orange' : 'cream'}`} onClick={()=>tryStartLevel(lvlIdx)} style={{ flex:1, height:56, fontSize:18, borderRadius:18 }}>{endStars===0 ? '다시 도전' : '다시하기'}</button>
              {endStars>=1
                ? <button className="gbtn green" onClick={()=>{ sfx.click(); tryStartLevel(lvlIdx+1); }} style={{ flex:1.4, height:56, fontSize:20, borderRadius:18, animation:'homeStage 1.2s ease-in-out infinite' }}>다음 스테이지</button>
                : <button className="gbtn blue" onClick={()=>{ setSelectedWorld(Math.floor(lvlIdx/STAGES_PER_WORLD)); setPhase('map'); }} style={{ flex:1, height:56, fontSize:18, borderRadius:18 }}>맵으로</button>}
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
}
