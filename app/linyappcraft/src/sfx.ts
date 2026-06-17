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

// ── 배경음악(BGM) — Web Audio로 합성한 가벼운 루프 ──────────
let bgmTimer: ReturnType<typeof setInterval> | null = null;
let bgmStep = 0;
// C장조 펜타토닉 계열의 밝은 루프(16스텝)
const BGM_NOTES = [
  523.25, 659.25, 783.99, 659.25, 587.33, 698.46, 880.00, 698.46,
  523.25, 659.25, 783.99, 1046.5, 880.00, 783.99, 659.25, 587.33,
];

export function isBgmOn() { return bgmTimer !== null; }

export function startBgm() {
  if (muted || bgmTimer) return;
  if (!ac()) return; // 컨텍스트 준비 안되면(제스처 전) 시작 보류
  bgmStep = 0;
  bgmTimer = setInterval(() => {
    const c = ac(); if (!c) return;
    const t0 = c.currentTime;
    const f = BGM_NOTES[bgmStep % BGM_NOTES.length];
    bgmStep++;
    // 멜로디 음
    const osc = c.createOscillator(); const g = c.createGain();
    osc.type = 'triangle'; osc.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.05, t0 + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.34);
    osc.connect(g).connect(c.destination); osc.start(t0); osc.stop(t0 + 0.4);
    // 4스텝마다 베이스
    if (bgmStep % 4 === 1) {
      const b = c.createOscillator(); const bg = c.createGain();
      b.type = 'sine'; b.frequency.value = f / 2;
      bg.gain.setValueAtTime(0.0001, t0);
      bg.gain.exponentialRampToValueAtTime(0.04, t0 + 0.04);
      bg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.55);
      b.connect(bg).connect(c.destination); b.start(t0); b.stop(t0 + 0.6);
    }
  }, 370);
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
