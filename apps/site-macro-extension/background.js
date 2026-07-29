const STORAGE_KEY = 'siteMacroJobs';
const LOG_KEY = 'siteMacroLogs';
const ALARM_PREFIX = 'site-macro:';
const MIN_INTERVAL_SECONDS = 5;
const MAX_LOGS = 80;

chrome.runtime.onInstalled.addListener(async () => {
  await refreshAlarms();
});

chrome.runtime.onStartup.addListener(async () => {
  await refreshAlarms();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes[STORAGE_KEY]) refreshAlarms();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'run-job-now') return false;
  getJobs()
    .then((jobs) => jobs.find((item) => item.id === message.jobId))
    .then(async (job) => {
      if (!job) {
        sendResponse({ ok: false, message: '작업을 찾지 못했습니다.' });
        return;
      }
      await runJob(job);
      sendResponse({ ok: true });
    })
    .catch((error) => sendResponse({ ok: false, message: error.message || String(error) }));
  return true;
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (!alarm.name.startsWith(ALARM_PREFIX)) return;
  const jobId = alarm.name.slice(ALARM_PREFIX.length);
  const jobs = await getJobs();
  const job = jobs.find((item) => item.id === jobId);
  if (!job || !job.enabled) return;
  await runJob(job, alarm.scheduledTime);
});

async function getJobs() {
  const result = await chrome.storage.sync.get(STORAGE_KEY);
  return Array.isArray(result[STORAGE_KEY]) ? result[STORAGE_KEY] : [];
}

async function setLogs(logs) {
  await chrome.storage.local.set({ [LOG_KEY]: logs.slice(0, MAX_LOGS) });
}

async function addLog(job, status, message) {
  const result = await chrome.storage.local.get(LOG_KEY);
  const logs = Array.isArray(result[LOG_KEY]) ? result[LOG_KEY] : [];
  logs.unshift({
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    jobId: job?.id || '',
    jobName: job?.name || '알 수 없음',
    status,
    message,
    createdAt: new Date().toISOString(),
  });
  await setLogs(logs);
}

async function refreshAlarms() {
  const existing = await chrome.alarms.getAll();
  await Promise.all(existing.filter((alarm) => alarm.name.startsWith(ALARM_PREFIX)).map((alarm) => chrome.alarms.clear(alarm.name)));

  const jobs = await getJobs();
  for (const job of jobs) {
    if (!job.enabled) continue;
    const alarmName = `${ALARM_PREFIX}${job.id}`;
    if (job.scheduleType === 'interval') {
      const seconds = Math.max(Number(job.intervalSeconds) || MIN_INTERVAL_SECONDS, MIN_INTERVAL_SECONDS);
      await chrome.alarms.create(alarmName, {
        delayInMinutes: seconds / 60,
        periodInMinutes: seconds / 60,
      });
    }
    if (job.scheduleType === 'time') {
      const when = getNextRunAt(job.timeOfDay);
      if (when) {
        await chrome.alarms.create(alarmName, {
          when,
          periodInMinutes: 24 * 60,
        });
      }
    }
  }
}

function getNextRunAt(timeOfDay) {
  if (!/^\d{2}:\d{2}$/.test(timeOfDay || '')) return null;
  const [hour, minute] = timeOfDay.split(':').map(Number);
  const next = new Date();
  next.setHours(hour, minute, 0, 0);
  if (next.getTime() <= Date.now()) next.setDate(next.getDate() + 1);
  return next.getTime();
}

function originFromPattern(urlPattern) {
  try {
    const url = new URL(urlPattern);
    return `${url.protocol}//${url.host}/*`;
  } catch {
    return null;
  }
}

function urlMatchesPattern(url, pattern) {
  if (!url || !pattern) return false;
  const escaped = pattern.trim().replace(/[.+?^${}()|[\]\\]/g, '\\$&').replaceAll('*', '.*');
  return new RegExp(`^${escaped}$`).test(url);
}

async function ensureHostPermission(job) {
  const origin = originFromPattern(job.urlPattern);
  if (!origin) return false;
  return chrome.permissions.contains({ origins: [origin] });
}

async function runJob(job) {
  job = { ...job, intervalSeconds: Math.max(Number(job.intervalSeconds) || MIN_INTERVAL_SECONDS, MIN_INTERVAL_SECONDS) };
  if (!job.actions?.length) {
    await addLog(job, 'skipped', '실행할 액션이 없습니다.');
    return;
  }
  if (!(await ensureHostPermission(job))) {
    await addLog(job, 'blocked', '사이트 권한이 없어 실행하지 않았습니다. 팝업에서 권한을 허용하세요.');
    await chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon.svg',
      title: '사이트 액션 매크로',
      message: `${job.name}: 사이트 권한이 필요합니다.`,
    });
    return;
  }

  const tab = job.backgroundTab
    ? await getOrCreateBackgroundTab(job)
    : await getRunnableTab(job);
  if (!tab?.id) {
    await addLog(job, 'skipped', '조건에 맞는 탭을 찾지 못했습니다.');
    return;
  }

  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: executeActions,
      args: [job.actions, job.areaSelector || ''],
      world: 'MAIN',
    });
    await addLog(job, result.ok ? 'success' : 'failed', result.message);
  } catch (error) {
    await addLog(job, 'failed', error.message || String(error));
  }
}

async function getRunnableTab(job) {
  const tabs = await chrome.tabs.query({});
  let tab = tabs.find((item) => urlMatchesPattern(item.url, job.urlPattern));
  if (!tab && job.openIfMissing) {
    tab = await chrome.tabs.create({ url: getStartUrl(job), active: false });
    await waitForTabComplete(tab.id);
  }
  return tab;
}

async function getOrCreateBackgroundTab(job) {
  const tabId = Number(job.backgroundTabId);
  if (tabId) {
    try {
      const tab = await chrome.tabs.get(tabId);
      if (tab?.id && urlMatchesPattern(tab.url, job.urlPattern)) return tab;
      if (tab?.id) await chrome.tabs.update(tab.id, { url: getStartUrl(job), active: false });
      await waitForTabComplete(tab.id);
      return tab;
    } catch {
      await saveJobPatch(job.id, { backgroundTabId: null });
    }
  }

  const tabs = await chrome.tabs.query({});
  const existing = tabs.find((item) => urlMatchesPattern(item.url, job.urlPattern));
  if (existing?.id) {
    await saveJobPatch(job.id, { backgroundTabId: existing.id });
    return existing;
  }

  const created = await chrome.tabs.create({ url: getStartUrl(job), active: false, pinned: true });
  await saveJobPatch(job.id, { backgroundTabId: created.id });
  await waitForTabComplete(created.id);
  return created;
}

function getStartUrl(job) {
  return job.startUrl || job.urlPattern.replace('*', '');
}

async function saveJobPatch(jobId, patch) {
  const jobs = await getJobs();
  await chrome.storage.sync.set({
    [STORAGE_KEY]: jobs.map((job) => job.id === jobId ? { ...job, ...patch } : job),
  });
}

function waitForTabComplete(tabId) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, 10000);
    chrome.tabs.onUpdated.addListener(function listener(updatedTabId, info) {
      if (updatedTabId !== tabId || info.status !== 'complete') return;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    });
  });
}

async function executeActions(actions, areaSelector) {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const visible = (element) => {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
  };
  const getScope = () => {
    if (!areaSelector) return document;
    if (areaSelector.length > 600) throw new Error('구역 selector가 너무 깁니다.');
    const scope = document.querySelector(areaSelector);
    if (!visible(scope)) throw new Error(`대상 구역을 찾지 못했습니다: ${areaSelector}`);
    return scope;
  };
  const getElement = (selector) => {
    if (!selector || selector.length > 600) throw new Error('selector가 비어있거나 너무 깁니다.');
    const scope = getScope();
    const element = scope.querySelector(selector);
    if (!visible(element)) throw new Error(`요소를 찾지 못했습니다: ${selector}`);
    return element;
  };
  const getOptionalElement = (selector) => {
    if (!selector) return document.activeElement && document.activeElement !== document.body ? document.activeElement : document.body;
    return getElement(selector);
  };
  const keyFromValue = (value) => {
    const key = String(value || 'Enter').trim() || 'Enter';
    const aliases = { enter: 'Enter', esc: 'Escape', escape: 'Escape', space: ' ', tab: 'Tab', backspace: 'Backspace', delete: 'Delete' };
    return aliases[key.toLowerCase()] || key;
  };
  const dispatchKey = (target, key) => {
    const eventInit = { key, code: key === ' ' ? 'Space' : key, bubbles: true, cancelable: true };
    target.dispatchEvent(new KeyboardEvent('keydown', eventInit));
    target.dispatchEvent(new KeyboardEvent('keyup', eventInit));
  };
  const assertSafeInput = (element) => {
    const type = String(element.getAttribute('type') || '').toLowerCase();
    if (type === 'password') throw new Error('비밀번호 입력칸 자동 입력은 차단됩니다.');
    if (element.closest('form[action*="login"], form[action*="signin"]')) throw new Error('로그인 폼 자동 입력은 차단됩니다.');
  };

  try {
    for (const action of actions.slice(0, 20)) {
      if (action.type === 'wait') {
        await sleep(Math.min(Math.max(Number(action.ms) || 0, 0), 30000));
      }
      if (action.type === 'click') {
        const element = getElement(action.selector);
        element.scrollIntoView({ block: 'center', inline: 'center' });
        await sleep(80);
        element.click();
      }
      if (action.type === 'type') {
        const element = getElement(action.selector);
        assertSafeInput(element);
        element.focus();
        element.value = String(action.value || '').slice(0, 1000);
        element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: element.value }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
      }
      if (action.type === 'key') {
        const element = getOptionalElement(action.selector);
        if (element instanceof HTMLElement) element.focus();
        dispatchKey(element, keyFromValue(action.value));
      }
      if (action.type === 'scroll') {
        window.scrollBy({ top: Number(action.y) || 0, left: Number(action.x) || 0, behavior: 'smooth' });
      }
      if (action.type === 'reload') {
        window.location.reload();
      }
    }
    return { ok: true, message: `${actions.length}개 액션 실행 완료${areaSelector ? ` · 구역 ${areaSelector}` : ''}` };
  } catch (error) {
    return { ok: false, message: error.message || String(error) };
  }
}
