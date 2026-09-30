// 결제 브리지 — 독립 앱(APK)/웹에는 외부 인앱결제 스토어 연동이 아직 없으므로
// 항상 시뮬레이션 결제로 폴백해요. (추후 Google Play Billing 등을 여기 연결)
export type PurchaseResult = { ok: boolean; orderId?: string; reason?: string };

export function purchase(_sku: string, _onGrant: (orderId: string) => void): Promise<PurchaseResult> {
  // 실제 스토어 결제가 없으므로 즉시 실패로 반환 → 호출부에서 시뮬레이션 결제 모달로 폴백
  return Promise.resolve({ ok: false, reason: 'NOT_AVAILABLE' });
}
