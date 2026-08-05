function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const output = new Uint8Array(new ArrayBuffer(rawData.length))
  for (let index = 0; index < rawData.length; index += 1) {
    output[index] = rawData.charCodeAt(index)
  }
  return output
}

export async function registerPushSubscription(): Promise<string> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return '이 브라우저는 백그라운드 푸시 알림을 지원하지 않습니다.'
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js')
    await navigator.serviceWorker.ready

    const existing = await registration.pushManager.getSubscription()
    if (existing) return '푸시 알림이 이미 연결되어 있습니다.'

    const response = await fetch('/push/vapid-public-key')
    const { publicKey } = await response.json()
    if (!publicKey) return '서버 VAPID 공개키가 설정되지 않았습니다.'

    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return '브라우저 알림 권한이 허용되지 않았습니다.'

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    })

    await fetch('/api/push/subscribe', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subscription),
    })
    return '푸시 알림을 연결했습니다.'
  } catch (error) {
    console.warn('Push subscription failed:', error)
    return error instanceof Error ? `푸시 알림 연결 실패: ${error.message}` : '푸시 알림 연결에 실패했습니다.'
  }
}
