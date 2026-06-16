// 계정(익명키)별로 localStorage를 분리 저장하기 위한 래퍼.
// scope = 'guest' (기본) 또는 토스 익명키 hash.

let scope = 'guest';

export function getScope() { return scope; }

export function setScope(s: string | null) {
  const next = s && s.trim() ? s.trim() : 'guest';
  if (next === scope) return;
  scope = next;
  window.dispatchEvent(new Event('scope-changed'));
}

const scopedKey = (base: string) => `${base}::${scope}`;

export function sGet<T>(base: string, fallback: T): T {
  try {
    const v = localStorage.getItem(scopedKey(base));
    return v == null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}

export function sSet(base: string, val: unknown) {
  try { localStorage.setItem(scopedKey(base), JSON.stringify(val)); } catch {}
}
