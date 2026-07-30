const STORAGE_KEY = 'siteMacroJobs';
const LOG_KEY = 'siteMacroLogs';
const ALARM_PREFIX = 'site-macro:';
const MIN_INTERVAL_SECONDS = 2;
const MAX_LOGS = 80;
const ONCE_STATE_KEY = 'siteMacroOnceState';
const OFFSCREEN_URL = 'offscreen.html';
const TERMINAL_JOB_ID = 'terminal-automation-enter-3s';

chrome.runtime.onInstalled.addListener(async () => {
  await disableMockJob();
  await ensureTerminalAutomationJob();
  await refreshAlarms();
  await refreshFastTimers();
});

chrome.runtime.onStartup.addListener(async () => {
  await disableMockJob();
  await ensureTerminalAutomationJob();
  await refreshAlarms();
  await refreshFastTimers();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes[STORAGE_KEY]) {
    refreshAlarms();
    refreshFastTimers();
  }
});

chrome.commands.onCommand.addListener((command) => {
  if (command === 'toggle-terminal-automation') toggleTerminalAutomation();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'fast-timer-tick') {
    handleFastTimerTick(message.jobId);
    sendResponse({ ok: true });
    return false;
  }
  if (message?.type !== 'run-job-now') return false;
  getJobs()
    .then((jobs) => jobs.find((item) => item.id === message.jobId))
    .then(async (job) => {
      if (!job) {
        sendResponse({ ok: false, message: '작업을 찾지 못했습니다.' });
        return;
      }
      const result = await runJob(job);
      sendResponse({ ok: result?.status === 'success', result });
    })
    .catch((error) => sendResponse({ ok: false, message: error.message || String(error) }));
  return true;
});

async function handleFastTimerTick(jobId) {
  const jobs = await getJobs();
  const job = jobs.find((item) => item.id === jobId);
  if (!job?.enabled || job.scheduleType !== 'interval') return;
  const seconds = Math.max(Number(job.intervalSeconds) || MIN_INTERVAL_SECONDS, MIN_INTERVAL_SECONDS);
  if (seconds >= 30) return;
  await runJob(job);
}

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

async function disableMockJob() {
  const jobs = await getJobs();
  let changed = false;
  const next = jobs.map((job) => {
    if (job.id !== 'mock-vscode-enter-3s' || !job.enabled) return job;
    changed = true;
    return { ...job, enabled: false };
  });
  if (changed) await chrome.storage.sync.set({ [STORAGE_KEY]: next });
}

async function ensureTerminalAutomationJob() {
  let jobs = await getJobs();
  const originalLength = jobs.length;
  jobs = jobs.filter((job) => job.id !== 'mock-vscode-enter-3s');
  const sample = {
    id: TERMINAL_JOB_ID,
    name: '터미널 자동화',
    enabled: false,
    targetKind: 'native',
    nativeProcess: 'Code',
    nativeWindowTitle: '',
    scheduleType: 'interval',
    intervalSeconds: MIN_INTERVAL_SECONDS,
    actions: [{ type: 'key', selector: '', value: 'Enter', ms: 1000, x: 0, y: 0, once: false }],
  };
  let changed = jobs.length !== originalLength;
  const index = jobs.findIndex((job) => job.id === TERMINAL_JOB_ID);
  if (index >= 0) {
    const existing = jobs[index];
    const next = {
      ...existing,
      name: sample.name,
      targetKind: 'native',
      nativeProcess: existing.nativeProcess || sample.nativeProcess,
      scheduleType: 'interval',
      intervalSeconds: MIN_INTERVAL_SECONDS,
      actions: sample.actions,
    };
    changed = changed || JSON.stringify(existing) !== JSON.stringify(next);
    jobs[index] = next;
  } else {
    jobs.unshift(sample);
    changed = true;
  }
  if (changed) await chrome.storage.sync.set({ [STORAGE_KEY]: jobs });
  return jobs.find((job) => job.id === TERMINAL_JOB_ID) || sample;
}

async function toggleTerminalAutomation() {
  await ensureTerminalAutomationJob();
  const jobs = await getJobs();
  const index = jobs.findIndex((job) => job.id === TERMINAL_JOB_ID);
  if (index < 0) {
    await addLog({ id: TERMINAL_JOB_ID, name: '터미널 자동화' }, 'failed', '터미널 자동화 작업을 찾지 못했습니다. 옵션 화면을 한 번 열어 작업을 생성하세요.');
    return;
  }
  const nextEnabled = !jobs[index].enabled;
  const next = jobs.map((job, jobIndex) => jobIndex === index ? { ...job, enabled: nextEnabled } : job);
  await chrome.storage.sync.set({ [STORAGE_KEY]: next });
  await addLog(next[index], nextEnabled ? 'running' : 'skipped', nextEnabled ? '단축키로 터미널 자동화를 시작했습니다.' : '단축키로 터미널 자동화를 멈췄습니다.');
  await chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon.svg',
    title: '터미널 자동화',
    message: nextEnabled ? '시작했습니다.' : '멈췄습니다.',
  });
}

async function setLogs(logs) {
  await chrome.storage.local.set({ [LOG_KEY]: logs.slice(0, MAX_LOGS) });
}

async function addLog(job, status, message) {
  const result = await chrome.storage.local.get(LOG_KEY);
  const logs = Array.isArray(result[LOG_KEY]) ? result[LOG_KEY] : [];
  const entry = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    jobId: job?.id || '',
    jobName: job?.name || '알 수 없음',
    status,
    message,
    createdAt: new Date().toISOString(),
  };
  logs.unshift(entry);
  await setLogs(logs);
  return entry;
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
      if (seconds < 30) continue;
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

async function refreshFastTimers() {
  const jobs = await getJobs();
  const fastJobs = jobs
    .filter((job) => job.enabled && job.scheduleType === 'interval')
    .map((job) => ({ id: job.id, seconds: Math.max(Number(job.intervalSeconds) || MIN_INTERVAL_SECONDS, MIN_INTERVAL_SECONDS) }))
    .filter((job) => job.seconds < 30);
  await sendOffscreenMessage({ type: 'set-fast-timers', jobs: fastJobs });
}

async function ensureOffscreenDocument() {
  if (!chrome.offscreen) return;
  const url = chrome.runtime.getURL(OFFSCREEN_URL);
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [url],
  });
  if (contexts.length) return;
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: ['BLOBS'],
    justification: '2초 간격 매크로 실행 타이머를 안정적으로 유지합니다.',
  });
}

async function sendOffscreenMessage(message) {
  try {
    await ensureOffscreenDocument();
    return await chrome.runtime.sendMessage(message);
  } catch {
    return null;
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
  await addLog(job, 'running', '실행중');
  if (!job.actions?.length) {
    return addLog(job, 'skipped', '실행할 액션이 없습니다.');
  }
  if (job.targetKind === 'native') {
    return runNativeJob(job);
  }
  if (!(await ensureHostPermission(job))) {
    const result = await addLog(job, 'blocked', '사이트 권한이 없어 실행하지 않았습니다. 사이트 권한 허용을 먼저 누르세요.');
    await chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon.svg',
      title: '사이트 액션 매크로',
      message: `${job.name}: 사이트 권한이 필요합니다.`,
    });
    return result;
  }

  const tab = job.backgroundTab
    ? await getOrCreateBackgroundTab(job)
    : await getRunnableTab(job);
  if (!tab?.id) {
    return addLog(job, 'skipped', '조건에 맞는 탭을 찾지 못했습니다.');
  }

  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: executeActions,
      args: [job.actions, job.areaSelector || ''],
      world: 'MAIN',
    });
    return addLog(job, result.ok ? 'success' : 'failed', result.message);
  } catch (error) {
    return addLog(job, 'failed', error.message || String(error));
  }
}

async function runNativeJob(job) {
  try {
    if (requiresSpecificNativeWindow(job) && !job.nativeWindowTitle) {
      return addLog(job, 'blocked', 'VS Code 창을 앱 선택하기에서 먼저 지정해야 실행됩니다.');
    }
    const actions = await getRunnableNativeActions(job);
    if (!actions.length) {
      return addLog(job, 'skipped', '반복 실행할 Windows 앱 액션이 없습니다.');
    }
    const response = await chrome.runtime.sendNativeMessage('com.playground.site_macro_bridge', {
      type: 'run',
      process: job.nativeProcess || '',
      windowTitle: job.nativeWindowTitle || '',
      actions,
    });
    const result = await addLog(job, response?.ok ? 'success' : 'failed', response?.message || 'Windows 앱 작업 요청 완료');
    if (response?.ok) await markOnceActions(job, actions);
    return result;
  } catch (error) {
    return addLog(job, 'failed', `로컬 브리지를 실행하지 못했습니다: ${error.message || String(error)}`);
  }
}

function requiresSpecificNativeWindow(job) {
  return String(job.nativeProcess || '').toLowerCase().includes('code');
}

async function getOnceState() {
  const result = await chrome.storage.local.get(ONCE_STATE_KEY);
  return result[ONCE_STATE_KEY] && typeof result[ONCE_STATE_KEY] === 'object' ? result[ONCE_STATE_KEY] : {};
}

function onceActionKey(job, action, index) {
  return `${job.id}:${index}:${action.type}:${action.x || 0}:${action.y || 0}:${action.value || ''}`;
}

async function getRunnableNativeActions(job) {
  const state = await getOnceState();
  return (job.actions || [])
    .slice(0, 20)
    .map((action, index) => ({ ...action, __index: index }))
    .filter((action) => action.type !== 'nativeClick' || Number(action.x) !== 0 || Number(action.y) !== 0)
    .filter((action) => !action.once || !state[onceActionKey(job, action, action.__index)]);
}

async function markOnceActions(job, actions) {
  const state = await getOnceState();
  let changed = false;
  for (const action of actions) {
    if (!action.once) continue;
    state[onceActionKey(job, action, action.__index)] = true;
    changed = true;
  }
  if (changed) await chrome.storage.local.set({ [ONCE_STATE_KEY]: state });
}

async function getRunnableTab(job) {
  const selectedTab = await getSelectedTab(job);
  if (selectedTab) return selectedTab;
  const tabs = await chrome.tabs.query({});
  return tabs.find((item) => urlMatchesPattern(item.url, job.urlPattern));
}

async function getOrCreateBackgroundTab(job) {
  const selectedTab = await getSelectedTab(job);
  if (selectedTab) {
    await saveJobPatch(job.id, { backgroundTabId: selectedTab.id });
    return selectedTab;
  }

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

  if (!job.openIfMissing) return null;
  const created = await chrome.tabs.create({ url: getStartUrl(job), active: false, pinned: true });
  await saveJobPatch(job.id, { backgroundTabId: created.id });
  await waitForTabComplete(created.id);
  return created;
}

async function getSelectedTab(job) {
  const tabId = Number(job.selectedTabId);
  if (!tabId) return null;
  try {
    const tab = await chrome.tabs.get(tabId);
    return tab?.id && urlMatchesPattern(tab.url, job.urlPattern) ? tab : null;
  } catch {
    await saveJobPatch(job.id, { selectedTabId: null, backgroundTabId: null });
    return null;
  }
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
