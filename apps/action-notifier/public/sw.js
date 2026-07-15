self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: 'GitHub Action 완료', body: event.data?.text() || '' };
  }

  const title = payload.title || 'GitHub Action 완료';
  const options = {
    body: payload.body || '연결한 레포지토리의 작업이 끝났어요.',
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    tag: payload.tag || 'action-notifier',
    renotify: true,
    silent: false,
    vibrate: [120, 60, 120],
    data: {
      url: payload.url || '/apps/action-notifier/',
      sound: payload.sound !== false,
    },
  };

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, options),
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
        clients.forEach((client) => client.postMessage({ type: 'ACTION_PUSH', payload }));
      }),
    ])
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/apps/action-notifier/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const matched = clients.find((client) => client.url.includes('/apps/action-notifier/'));
      if (matched) {
        matched.focus();
        return;
      }
      return self.clients.openWindow(url);
    })
  );
});
