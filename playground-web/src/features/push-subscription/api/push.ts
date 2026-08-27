/**
 * Web Push 구독 관리
 */

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export async function registerPushSubscription(): Promise<void> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

  try {
    // 서비스 워커 등록
    const registration = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;

    // 이미 구독 중이면 스킵
    const existing = await registration.pushManager.getSubscription();
    if (existing) return;

    // VAPID 공개키 가져오기
    const res = await fetch('/push/vapid-public-key');
    const { publicKey } = await res.json();
    if (!publicKey) return;

    // 알림 권한 요청
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return;

    // 구독 생성
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });

    // 백엔드에 구독 정보 저장
    await fetch('/api/push/subscribe', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subscription),
    });

    console.log('Push subscription registered');
  } catch (err) {
    console.warn('Push subscription failed:', err);
  }
}
