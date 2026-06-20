// 가벼운 사운드 엔진 — Web Audio API로 효과음을 합성한다(음원 파일 불필요).
// 모바일 자동재생 정책 때문에 첫 사용자 제스처에서 primeAudio()로 컨텍스트를 깨운다.
import { sGet, sSet } from './store';

const MUTE_BASE = 'linydory_muted_v1';
let muted = sGet<boolean>(MUTE_BASE, false);
let ctx: AudioContext | null = null;

export const isMuted = () => muted;
export function setMuted(m: boolean) { muted = m; sSet(MUTE_BASE, m); if (m) stopBgm(); }
export function toggleMuted(): boolean { setMuted(!muted); return muted; }

type WinAudioContext = typeof AudioContext;

function ac(): AudioContext | null {
  if (muted || typeof window === 'undefined') return null;
  if (!ctx) {
    const AC: WinAudioContext | undefined =
      window.AudioContext || (window as unknown as { webkitAudioContext?: WinAudioContext }).webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC(); } catch { return null; }
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

// 첫 제스처에서 호출 — 오디오 컨텍스트 활성화
export function primeAudio() { ac(); }

function tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.2, when = 0, slideTo?: number) {
  const c = ac(); if (!c) return;
  const t0 = c.currentTime + when;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.03);
}

// 짧은 노이즈 버스트(팡/폭발용)
function noise(dur: number, vol: number, when = 0, freq = 1100, q = 0.8) {
  const c = ac(); if (!c) return;
  const t0 = c.currentTime + when;
  const n = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, n, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = c.createBufferSource(); src.buffer = buf;
  const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
  const g = c.createGain(); g.gain.value = vol;
  src.connect(f).connect(g).connect(c.destination);
  src.start(t0);
}

// 짧은 모바일 진동(있을 때만)
export function buzz(ms = 12) {
  if (muted) return;
  try { if ('vibrate' in navigator) navigator.vibrate(ms); } catch { /* noop */ }
}

// ── 배경음악(BGM) — Web Audio로 합성한 귀여운 뮤직박스 루프 ──────────
let bgmTimer: ReturnType<typeof setInterval> | null = null;
let bgmStep = 0;
const STEP_MS = 200;            // 빠르고 통통 튀는 템포
// C장조의 밝고 깜찍한 멜로디(32스텝, 0은 쉼표) — I-vi-IV-V 진행
const C5=523.25, D5=587.33, E5=659.25, F5=698.46, G5=783.99, A5=880.0, C6=1046.5;
const BGM_MELODY = [
  E5, G5, C6, G5,  A5, G5, E5, 0,
  D5, E5, F5, E5,  D5, C5, 0,  0,
  E5, D5, C5, D5,  E5, E5, D5, 0,
  C5, E5, G5, C6,  A5, G5, E5, 0,
];
// 각 4스텝(마디)마다 베이스 음 — C, Am, F, G ×2
const BGM_BASS = [130.81, 110.0, 87.31, 98.0, 130.81, 110.0, 87.31, 98.0];

export function isBgmOn() { return bgmTimer !== null; }

// 뮤직박스 톤: 빠른 어택 + 부드러운 감쇠 + 한 옥타브 위 반짝임
function bgmNote(c: AudioContext, t0: number, f: number, vol: number, dur: number) {
  const osc = c.createOscillator(); const g = c.createGain();
  osc.type = 'triangle'; osc.frequency.value = f;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(c.destination); osc.start(t0); osc.stop(t0 + dur + 0.03);
  // 옥타브 위 사인으로 반짝(뮤직박스 느낌)
  const s = c.createOscillator(); const sg = c.createGain();
  s.type = 'sine'; s.frequency.value = f * 2;
  sg.gain.setValueAtTime(0.0001, t0);
  sg.gain.exponentialRampToValueAtTime(vol * 0.35, t0 + 0.01);
  sg.gain.exponentialRampToValueAtTime(0.0001, t0 + dur * 0.6);
  s.connect(sg).connect(c.destination); s.start(t0); s.stop(t0 + dur);
}

export function startBgm() {
  if (muted || bgmTimer) return;
  if (!ac()) return; // 컨텍스트 준비 안되면(제스처 전) 시작 보류
  bgmStep = 0;
  bgmTimer = setInterval(() => {
    const c = ac(); if (!c) return;
    const t0 = c.currentTime;
    const step = bgmStep % 32;
    const bar = Math.floor(step / 4);
    bgmStep++;
    // 멜로디(쉼표면 건너뜀)
    const f = BGM_MELODY[step];
    if (f) bgmNote(c, t0, f, 0.05, 0.26);
    // 마디 첫 스텝에 통통 튀는 베이스
    if (step % 4 === 0) {
      const b = c.createOscillator(); const bg = c.createGain();
      b.type = 'sine'; b.frequency.value = BGM_BASS[bar];
      bg.gain.setValueAtTime(0.0001, t0);
      bg.gain.exponentialRampToValueAtTime(0.05, t0 + 0.03);
      bg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.42);
      b.connect(bg).connect(c.destination); b.start(t0); b.stop(t0 + 0.45);
    }
    // 엇박(홀수 스텝)에 살짝 '톡' 하이햇 — 통통 튀는 리듬감
    if (step % 2 === 1) noise(0.03, 0.012, 0, 7000, 1.2);
  }, STEP_MS);
}

export function stopBgm() {
  if (bgmTimer) { clearInterval(bgmTimer); bgmTimer = null; }
}

export const sfx = {
  swap()        { tone(520, 0.06, 'sine', 0.10); },
  invalid()     { tone(200, 0.10, 'square', 0.10, 0, 130); },
  // 귀여운 "팡!" — 살짝 떨어지는 블립 + 반짝 + 톡 터지는 노이즈
  pop(combo = 1){
    const base = 680 + Math.min(combo, 10) * 60;
    tone(base, 0.10, 'sine', 0.20, 0, base * 0.55);
    tone(base * 1.8, 0.05, 'triangle', 0.10, 0.0);
    noise(0.06, 0.10, 0, 1600, 0.7);
  },
  combo(n: number) { const f = 520 + Math.min(n, 10) * 60; tone(f, 0.13, 'triangle', 0.2); tone(f * 1.5, 0.13, 'sine', 0.12, 0.03); },
  special()     { tone(300, 0.16, 'sawtooth', 0.16); tone(660, 0.20, 'square', 0.12, 0.05); noise(0.1, 0.12, 0, 2000, 0.5); },
  explode()     { tone(160, 0.34, 'square', 0.24, 0, 50); tone(80, 0.36, 'sawtooth', 0.18, 0.02, 38); noise(0.22, 0.22, 0, 600, 0.6); },
  ding(i = 0)   { tone(880 + i * 220, 0.16, 'triangle', 0.22, 0); tone(1320 + i * 260, 0.18, 'sine', 0.12, 0.04); },
  coin()        { tone(880, 0.07, 'square', 0.14); tone(1320, 0.10, 'square', 0.13, 0.06); },
  win()         { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.20, 'triangle', 0.2, i * 0.12)); },
  lose()        { [392, 330, 262].forEach((f, i) => tone(f, 0.24, 'sine', 0.18, i * 0.13)); },
  click()       { tone(660, 0.05, 'square', 0.09); },
};
