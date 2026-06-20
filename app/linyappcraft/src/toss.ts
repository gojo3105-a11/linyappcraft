// Apps in Toss SDK 래퍼.
// 토스 앱 안에서 실행될 때만 실제 동작하고, 브라우저/데모 환경에서는
// 안전하게 폴백(게스트)되도록 모든 호출을 try/catch + 타임아웃으로 감쌌어요.

type SDK = {
  getAnonymousKey?: () => Promise<{ type: 'HASH'; hash: string } | 'ERROR' | undefined>;
  appLogin?: () => Promise<{ authorizationCode: string; referrer: string }>;
  closeView?: () => void;
  openURL?: (url: string) => Promise<unknown>;
  setDeviceOrientation?: (o: { type: 'portrait' | 'landscape' }) => Promise<void>;
  setScreenAwakeMode?: (o: { enabled: boolean }) => unknown;
  graniteEvent?: {
    addEventListener: (
      event: 'backEvent' | 'homeEvent',
      cb: { onEvent: () => void; onError?: (e: Error) => void },
    ) => () => void;
  };
  IAP?: {
    createOneTimePurchaseOrder: (params: {
      options: { sku: string; processProductGrant: (p: { orderId: string }) => boolean | Promise<boolean> };
      onEvent: (e: { type: 'success'; data: { orderId: string } }) => void;
      onError: (err: unknown) => void;
    }) => () => void;
  };
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

/** 토스 앱(인앱결제 가능 환경) 안에서 실행 중인지 확인해요. */
export async function isTossEnv(): Promise<boolean> {
  try {
    const m = await sdk();
    return typeof m.IAP?.createOneTimePurchaseOrder === 'function';
  } catch {
    return false;
  }
}

/**
 * 하드웨어/내비게이션 뒤로가기 이벤트를 구독해요.
 * 토스 앱에서는 graniteEvent('backEvent')를 사용하고, 그 외 환경에서는 아무것도 하지 않아요.
 * 반환된 cleanup 함수를 호출하면 구독을 해제해요.
 */
export function onBackEvent(handler: () => void): () => void {
  let cleanup: (() => void) | null = null;
  let cancelled = false;
  (async () => {
    try {
      const m = await sdk();
      if (cancelled) return;
      if (m.graniteEvent?.addEventListener) {
        cleanup = m.graniteEvent.addEventListener('backEvent', { onEvent: handler });
      }
    } catch { /* 무시 */ }
  })();
  return () => { cancelled = true; if (cleanup) { try { cleanup(); } catch { /* 무시 */ } } };
}

/** 미니앱을 닫아요(토스 앱 환경). 그 외 환경에서는 아무 동작도 하지 않아요. */
export async function closeApp(): Promise<void> {
  try {
    const m = await sdk();
    m.closeView?.();
  } catch { /* 무시 */ }
}

/** 화면 방향을 세로로 고정해요(토스 앱 환경). */
export async function lockPortrait(): Promise<void> {
  try {
    const m = await sdk();
    await m.setDeviceOrientation?.({ type: 'portrait' });
  } catch { /* 무시 */ }
}

/** 게임 중 화면이 꺼지지 않도록 설정해요. enabled=false면 기본 동작으로 복구. */
export async function keepScreenAwake(enabled: boolean): Promise<void> {
  try {
    const m = await sdk();
    m.setScreenAwakeMode?.({ enabled });
  } catch { /* 무시 */ }
}

export type PurchaseResult = { ok: boolean; orderId?: string; reason?: string };

/**
 * 토스 인앱결제(IAP) 단건 구매. 토스 앱이 아니면 reason:'NOT_IN_TOSS'로 즉시 실패해요(시뮬레이션 폴백용).
 * onGrant는 결제 완료 직후 상품을 지급할 때 호출돼요.
 * NOTE: 정식 출시 시 orderId를 파트너 서버로 보내 검증한 뒤 지급하는 것을 권장해요.
 */
export function purchase(sku: string, onGrant: (orderId: string) => void): Promise<PurchaseResult> {
  return new Promise((resolve) => {
    (async () => {
      const m = await sdk();
      if (typeof m.IAP?.createOneTimePurchaseOrder !== 'function') {
        resolve({ ok: false, reason: 'NOT_IN_TOSS' });
        return;
      }
      let cleanup: (() => void) | null = null;
      const done = (r: PurchaseResult) => { try { cleanup?.(); } catch { /* 무시 */ } resolve(r); };
      try {
        cleanup = m.IAP.createOneTimePurchaseOrder({
          options: {
            sku,
            processProductGrant: ({ orderId }) => { onGrant(orderId); return true; },
          },
          onEvent: (e) => done({ ok: true, orderId: e?.data?.orderId }),
          onError: (err) => {
            const code = (err as { code?: string })?.code ?? String(err);
            done({ ok: false, reason: code });
          },
        });
      } catch (err) {
        done({ ok: false, reason: String(err) });
      }
    })();
  });
}
