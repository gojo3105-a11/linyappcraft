// 플랫폼 브리지 — Capacitor(안드로이드 APK) 환경에서는 네이티브 기능을,
// 웹 브라우저에서는 안전한 폴백(no-op)을 사용해요. (Toss SDK 의존 제거)
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';

const isNative = (): boolean => {
  try { return Capacitor.isNativePlatform(); } catch { return false; }
};

/** 하드웨어/내비게이션 뒤로가기 이벤트 구독. 반환 함수를 호출하면 해제해요. (웹에서는 무동작) */
export function onBackEvent(handler: () => void): () => void {
  if (!isNative()) return () => {};
  let remove: (() => void) | null = null;
  CapApp.addListener('backButton', () => handler())
    .then(h => { remove = () => h.remove(); })
    .catch(() => {});
  return () => { try { remove?.(); } catch { /* 무시 */ } };
}

/** 앱 종료 (안드로이드). 웹에서는 무동작. */
export async function closeApp(): Promise<void> {
  if (!isNative()) return;
  try { await CapApp.exitApp(); } catch { /* 무시 */ }
}

/** 화면 세로 고정 — 안드로이드는 AndroidManifest(screenOrientation)에서 처리, 여기선 무동작. */
export async function lockPortrait(): Promise<void> { /* no-op */ }

/** 게임 중 화면 유지 — 필요 시 keep-awake 플러그인 연결. 현재는 무동작. */
export async function keepScreenAwake(_enabled: boolean): Promise<void> { /* no-op */ }
