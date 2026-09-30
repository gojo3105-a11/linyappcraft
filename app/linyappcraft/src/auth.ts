// 로그인 — 게스트(키 불필요, 완전 동작) + Google / Kakao (구조만; 키 설정 시 활성화)
// 저장 데이터는 store.ts의 scope로 계정별 분리돼요.
import { setScope } from './store';

export type Provider = 'guest' | 'google' | 'kakao';
export interface Account { provider: Provider; id: string; name?: string; }
export type LoginResult = { ok: boolean; reason?: string };

const LS_ACCOUNT = 'linydory_account_v1';   // scope와 무관하게 전역 저장(로그인 상태 유지)
const env = import.meta.env as Record<string, string | undefined>;

let current: Account = { provider: 'guest', id: 'guest' };

function save(a: Account | null) {
  try { a ? localStorage.setItem(LS_ACCOUNT, JSON.stringify(a)) : localStorage.removeItem(LS_ACCOUNT); }
  catch { /* 무시 */ }
}
function load(): Account | null {
  try { const v = localStorage.getItem(LS_ACCOUNT); return v ? (JSON.parse(v) as Account) : null; }
  catch { return null; }
}
function scopeOf(a: Account): string {
  return a.provider === 'guest' ? 'guest' : `${a.provider}:${a.id}`;
}
function apply(a: Account) {
  current = a;
  save(a.provider === 'guest' ? null : a);
  setScope(scopeOf(a));
}

/** 앱 시작 시 저장된 로그인 상태를 복원하고 저장 스코프를 맞춰요. */
export function initAccount() {
  current = load() ?? { provider: 'guest', id: 'guest' };
  setScope(scopeOf(current));
}

export function getAccount(): Account { return current; }

/** 설정 화면에 표시할 계정 라벨. */
export function getAccountLabel(): string {
  if (current.provider === 'guest') return '게스트 (로컬 저장)';
  const who = current.name || current.id.slice(0, 12);
  return `${current.provider === 'google' ? 'Google' : 'Kakao'} · ${who}`;
}

/** 게스트로 시작/전환 (키 불필요, 완전 동작). */
export function loginGuest(): LoginResult {
  apply({ provider: 'guest', id: 'guest' });
  return { ok: true };
}

/** 로그아웃 → 게스트로 전환. */
export function logout(): void {
  apply({ provider: 'guest', id: 'guest' });
}

// ── Google 로그인 (구조만) ──────────────────────────────────────────────
// 활성화하려면 Google Cloud Console에서 OAuth 클라이언트 ID를 발급받아
// .env 에 VITE_GOOGLE_CLIENT_ID 로 넣고, 아래 TODO에 실제 흐름을 연결하세요.
//  - 웹: Google Identity Services(GIS)
//  - APK: @capacitor 소셜 로그인 플러그인(패키지명 + SHA-1 등록 필요)
// 성공 시 completeLogin({ provider:'google', id:<sub>, name:<name> }) 호출.
const GOOGLE_CLIENT_ID = env.VITE_GOOGLE_CLIENT_ID;
export async function loginGoogle(): Promise<LoginResult> {
  if (!GOOGLE_CLIENT_ID) return { ok: false, reason: 'NOT_CONFIGURED' };
  // TODO: 실제 Google OAuth 연동
  return { ok: false, reason: 'NOT_IMPLEMENTED' };
}

// ── Kakao 로그인 (구조만) ──────────────────────────────────────────────
// 활성화하려면 Kakao Developers에서 JavaScript 키를 발급받아
// .env 에 VITE_KAKAO_JS_KEY 로 넣고, 아래 TODO에 실제 흐름을 연결하세요.
const KAKAO_JS_KEY = env.VITE_KAKAO_JS_KEY;
export async function loginKakao(): Promise<LoginResult> {
  if (!KAKAO_JS_KEY) return { ok: false, reason: 'NOT_CONFIGURED' };
  // TODO: 실제 Kakao 로그인 연동 (Kakao JS SDK / 앱 플러그인)
  return { ok: false, reason: 'NOT_IMPLEMENTED' };
}

/** 실제 OAuth 성공 후 계정을 확정할 때 호출(향후 연동용). */
export function completeLogin(a: Account): void { apply(a); }
