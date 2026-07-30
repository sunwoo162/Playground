const timers = new Map();

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'set-fast-timers') return false;
  refreshTimers(Array.isArray(message.jobs) ? message.jobs : []);
  sendResponse({ ok: true });
  return false;
});

function refreshTimers(jobs) {
  for (const timer of timers.values()) clearInterval(timer);
  timers.clear();

  for (const job of jobs) {
    const seconds = Math.max(Number(job.seconds) || 2, 2);
    const timer = setInterval(() => {
      chrome.runtime.sendMessage({ type: 'fast-timer-tick', jobId: job.id }).catch(() => {});
    }, seconds * 1000);
    timers.set(job.id, timer);
  }
}
