// Apps in Toss SDK 래퍼.
// 토스 앱 안에서 실행될 때만 실제 동작하고, 브라우저/데모 환경에서는
// 안전하게 폴백(게스트)되도록 모든 호출을 try/catch + 타임아웃으로 감쌌어요.

type SDK = {
  getAnonymousKey?: () => Promise<{ type: 'HASH'; hash: string } | 'ERROR' | undefined>;
  appLogin?: () => Promise<{ authorizationCode: string; referrer: string }>;
};

let cached: SDK | null = null;

async function sdk(): Promise<SDK> {
  if (cached) return cached;
  try {
    cached = (await import('@apps-in-toss/web-framework')) as unknown as SDK;
  } catch {
    cached = {};
  }
  return cached;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    p.catch(() => null),
    new Promise<null>((res) => setTimeout(() => res(null), ms)),
  ]);
}

/** 사용자 고유 익명키(hash)를 가져와요. 토스 환경이 아니면 null. */
export async function fetchUserKey(): Promise<string | null> {
  try {
    const m = await sdk();
    if (typeof m.getAnonymousKey !== 'function') return null;
    const r = await withTimeout(m.getAnonymousKey(), 1500);
    if (r && typeof r === 'object' && r.type === 'HASH' && r.hash) return r.hash;
    return null;
  } catch {
    return null;
  }
}

/** 토스 인증 로그인. 성공 시 인가코드를 반환(서버 교환용), 환경이 아니면 ok:false. */
export async function tossLogin(): Promise<{ ok: boolean; code?: string }> {
  try {
    const m = await sdk();
    if (typeof m.appLogin !== 'function') return { ok: false };
    const r = await withTimeout(m.appLogin(), 30000);
    if (r && r.authorizationCode) return { ok: true, code: r.authorizationCode };
    return { ok: false };
  } catch {
    return { ok: false };
  }
}
