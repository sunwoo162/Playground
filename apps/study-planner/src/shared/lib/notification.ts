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
      tag: 'study-timer',
    } as NotificationOptions);
    if (autoCloseMs > 0) {
      setTimeout(() => n.close(), autoCloseMs);
    }
  }
}
