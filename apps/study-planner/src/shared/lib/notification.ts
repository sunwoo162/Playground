export async function requestNotificationPermission(): Promise<void> {
  if ('Notification' in window && Notification.permission === 'default') {
    await Notification.requestPermission();
  }
}

export function sendNotification(title: string, body: string, autoCloseMs = 3000): void {
  if ('Notification' in window && Notification.permission === 'granted') {
    const n = new Notification(title, {
      body,
      icon: '/favicon.svg',
      tag: 'study-timer',   // 동일 tag면 이전 알림 대체
      renotify: true,
    });
    if (autoCloseMs > 0) {
      setTimeout(() => n.close(), autoCloseMs);
    }
  }
}
