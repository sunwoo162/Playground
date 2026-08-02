const STORAGE_KEY = 'siteMacroJobs';
const LOG_KEY = 'siteMacroLogs';
const THEME_KEY = 'siteMacroTheme';
const VELOG_CONNECTION_KEY = 'siteMacroVelogConnection';
const MIN_INTERVAL_SECONDS = 2;
const DEFAULT_APP_BASE_URL = 'https://playground.https.gsmsv.site';
const VELOG_WRITE_URL = 'https://velog.io/write';
const TRACKER_URL = 'http://localhost:7421';
const TRACKER_TIMEOUT_MS = 3000;
const TERMINAL_JOB_ID = 'terminal-automation-enter-3s';
const CHATGPT_JOB_ID = 'chatgpt-enter-mock';
const CHATGPT_MOCK_TEXT = '매크로 실행 테스트용 mock 데이터입니다. Enter 전송까지 정상 동작하는지 확인합니다.';
const HOTKEY_API = 'http://127.0.0.1:18765';
const AREA_SELECTORS = {
  main: 'main',
  form: 'form, [role="form"], .form, .editor, .panel',
  header: 'header, [role="banner"]',
  nav: 'nav, [role="navigation"]',
};

const jobEditorList = document.querySelector('#jobEditorList');
const addJobButton = document.querySelector('#addJob');
const jobTemplate = document.querySelector('#jobTemplate');
const actionTemplate = document.querySelector('#actionTemplate');
const themeSelect = document.querySelector('#themeSelect');
const appPickerModal = document.querySelector('#appPickerModal');
const closeAppPickerButton = document.querySelector('#closeAppPicker');
const webPickerGrid = document.querySelector('#webPickerGrid');
const nativePickerGrid = document.querySelector('#nativePickerGrid');
const latestErrorSummary = document.querySelector('#latestErrorSummary');
const errorHelpList = document.querySelector('#errorHelpList');
const openVelogButton = document.querySelector('#openVelog');
const connectVelogButton = document.querySelector('#connectVelog');
const velogStatus = document.querySelector('#velogStatus');
let nativeWindows = [];
let activePickerJobId = '';

initTheme();
seedMockJobs();
renderVelogStatus();

addJobButton.addEventListener('click', async () => {
  const jobs = await getJobs();
  jobs.unshift(createJob());
  await setJobs(jobs);
  render();
});

openVelogButton?.addEventListener('click', openVelogEditor);
connectVelogButton?.addEventListener('click', connectVelog);

async function initTheme() {
  const result = await chrome.storage.local.get(THEME_KEY);
  const theme = result[THEME_KEY] === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = theme;
  if (themeSelect) themeSelect.value = theme;
  themeSelect?.addEventListener('change', async () => {
    const nextTheme = themeSelect.value === 'dark' ? 'dark' : 'light';
    document.documentElement.dataset.theme = nextTheme;
    await chrome.storage.local.set({ [THEME_KEY]: nextTheme });
  });
}

async function getJobs() {
  const result = await chrome.storage.sync.get(STORAGE_KEY);
  return Array.isArray(result[STORAGE_KEY]) ? result[STORAGE_KEY] : [];
}

async function setJobs(jobs) {
  await chrome.storage.sync.set({ [STORAGE_KEY]: jobs.map(normalizeJob) });
}

async function seedMockJobs() {
  let jobs = await getJobs();
  const originalLength = jobs.length;
  jobs = jobs.filter((job) => job.id !== 'mock-vscode-enter-3s');
  const samples = [
  createJob({
    id: 'terminal-automation-enter-3s',
    name: '터미널 자동화',
    enabled: false,
    targetKind: 'native',
    nativeProcess: 'Code',
    nativeWindowTitle: '',
    scheduleType: 'interval',
    intervalSeconds: 2,
    actions: [
      { type: 'key', selector: '', value: 'Enter', ms: 1000, x: 0, y: 0, once: false },
    ],
  }),
  createJob({
    id: CHATGPT_JOB_ID,
    name: 'ChatGPT Enter 테스트',
    enabled: false,
    targetKind: 'web',
    appBaseUrl: 'https://chatgpt.com',
    targetApp: '',
    customAppPath: '',
    urlPattern: 'https://chatgpt.com/*',
    startUrl: 'https://chatgpt.com/',
    openIfMissing: false,
    backgroundTab: false,
    scheduleType: 'interval',
    intervalSeconds: 2,
    actions: [
      { type: 'type', selector: '#prompt-textarea, [contenteditable="true"], textarea', value: CHATGPT_MOCK_TEXT, ms: 1000, x: 0, y: 0, once: false },
      { type: 'wait', selector: '', value: '', ms: 300, x: 0, y: 0, once: false },
      { type: 'key', selector: '#prompt-textarea, [contenteditable="true"], textarea', value: 'Enter', ms: 1000, x: 0, y: 0, once: false },
    ],
  }),
  ];
  let changed = jobs.length !== originalLength;
  for (const sample of samples) {
    const existingIndex = jobs.findIndex((job) => job.id === sample.id);
    if (existingIndex >= 0) {
      const existing = jobs[existingIndex];
      const next = {
        ...sample,
        enabled: Boolean(existing.enabled),
        nativeWindowTitle: existing.nativeWindowTitle || '',
        selectedTabId: existing.selectedTabId || null,
        actions: sample.actions,
      };
      changed = changed || JSON.stringify(jobs[existingIndex]) !== JSON.stringify(next);
      jobs[existingIndex] = next;
    } else {
      const terminalIndex = jobs.findIndex((job) => job.id === TERMINAL_JOB_ID);
      const insertIndex = sample.id === CHATGPT_JOB_ID && terminalIndex >= 0 ? terminalIndex + 1 : 0;
      jobs.splice(insertIndex, 0, sample);
      changed = true;
    }
  }
  if (changed) await setJobs(jobs);
  render();
}

function createJob(overrides = {}) {
  return normalizeJob({
    id: crypto.randomUUID(),
    name: '새 작업',
    enabled: false,
    targetKind: 'web',
    appBaseUrl: DEFAULT_APP_BASE_URL,
    targetApp: '',
    customAppPath: '',
    nativeProcess: '',
    nativeWindowTitle: '',
    selectedTabId: null,
    targetArea: '',
    areaSelector: '',
    urlPattern: '',
    startUrl: '',
    openIfMissing: false,
    backgroundTab: false,
    scheduleType: 'interval',
    intervalSeconds: 30,
    timeOfDay: '12:00',
    actions: [{ type: 'click', selector: '', value: '', ms: 1000, x: 0, y: 500 }],
    ...overrides,
  });
}

function normalizeJob(job) {
  return {
    id: job.id || crypto.randomUUID(),
    name: String(job.name || '작업').slice(0, 80),
    enabled: Boolean(job.enabled),
    targetKind: job.targetKind === 'native' ? 'native' : 'web',
    appBaseUrl: normalizeBaseUrl(job.appBaseUrl),
    targetApp: String(job.targetApp || ''),
    customAppPath: normalizeAppPath(job.customAppPath),
    nativeProcess: String(job.nativeProcess || '').trim().slice(0, 120),
    nativeWindowTitle: String(job.nativeWindowTitle || '').trim().slice(0, 200),
    selectedTabId: Number(job.selectedTabId) || null,
    targetArea: ['', 'main', 'form', 'header', 'nav', 'custom'].includes(job.targetArea) ? job.targetArea : '',
    areaSelector: String(job.areaSelector || '').slice(0, 600),
    urlPattern: String(job.urlPattern || '').trim(),
    startUrl: String(job.startUrl || '').trim(),
    openIfMissing: false,
    backgroundTab: Boolean(job.backgroundTab),
    scheduleType: job.scheduleType === 'time' ? 'time' : 'interval',
    intervalSeconds: Math.max(Number(job.intervalSeconds) || MIN_INTERVAL_SECONDS, MIN_INTERVAL_SECONDS),
    timeOfDay: /^\d{2}:\d{2}$/.test(job.timeOfDay || '') ? job.timeOfDay : '12:00',
    actions: Array.isArray(job.actions) ? job.actions.slice(0, 20).map(normalizeAction) : [],
  };
}

closeAppPickerButton?.addEventListener('click', closeAppPicker);
appPickerModal?.addEventListener('click', (event) => {
  if (event.target === appPickerModal) closeAppPicker();
});
document.querySelectorAll('[data-picker-tab]').forEach((button) => {
  button.addEventListener('click', () => switchPickerTab(button.dataset.pickerTab, { load: true }));
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[LOG_KEY]) {
    updateStatusBadges();
    renderErrorHelp();
  }
  if (area === 'sync' && changes[STORAGE_KEY]) render();
});

setInterval(() => {
  if (!document.hidden) updateStatusBadges();
}, 1000);

function normalizeBaseUrl(value) {
  const fallback = DEFAULT_APP_BASE_URL;
  try {
    const url = new URL(String(value || fallback).trim());
    return `${url.protocol}//${url.host}`;
  } catch {
    return fallback;
  }
}

function normalizeAction(action) {
  const type = ['click', 'type', 'key', 'nativeClick', 'wait', 'scroll', 'reload'].includes(action.type) ? action.type : 'click';
  return {
    type,
    selector: String(action.selector || '').slice(0, 600),
    value: String(action.value || '').slice(0, 1000),
    ms: Math.min(Math.max(Number(action.ms) || 1000, 0), 30000),
    x: Number(action.x) || 0,
    y: Number(action.y) || 0,
    once: Boolean(action.once),
  };
}

function normalizeAppPath(value) {
  const path = String(value || '').trim();
  if (!path) return '';
  return path.startsWith('/') ? path : `/${path}`;
}

function originFromPattern(urlPattern) {
  try {
    const url = new URL(urlPattern);
    return `${url.protocol}//${url.host}/*`;
  } catch {
    return '';
  }
}

async function requestPermission(job) {
  const origin = originFromPattern(job.urlPattern);
  if (!origin) {
    alert('URL 패턴을 https://example.com/* 형식으로 먼저 입력하세요.');
    return;
  }
  const granted = await chrome.permissions.request({ origins: [origin] });
  alert(granted ? '사이트 권한을 허용했습니다.' : '사이트 권한이 거부되었습니다.');
}

async function requestVelogPermission() {
  const granted = await chrome.permissions.request({ origins: ['https://velog.io/*'] });
  if (!granted) throw new Error('velog.io 사이트 권한이 거부되었습니다.');
}

async function openVelogEditor() {
  await requestVelogPermission();
  await chrome.tabs.create({ url: VELOG_WRITE_URL, active: true });
}

async function connectVelog() {
  setVelogStatus('Velog 탭을 확인하는 중...', 'running');
  try {
    await requestVelogPermission();
    const tab = await getVelogTab();
    if (!tab?.id) {
      await chrome.tabs.create({ url: VELOG_WRITE_URL, active: true });
      throw new Error('Velog 탭을 열었습니다. 로그인한 뒤 다시 Velog 연결을 누르세요.');
    }
    await chrome.tabs.update(tab.id, { active: true });
    await waitForTabReady(tab.id);
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: readVelogConnectionFromPage,
      world: 'MAIN',
    });
    if (!result?.ok) throw new Error(result?.message || 'Velog 토큰을 찾지 못했습니다.');
    const connection = {
      connectedAt: new Date().toISOString(),
      origin: 'https://velog.io',
      tokenKey: result.tokenKey,
      accessToken: result.accessToken,
      username: result.username || '',
    };
    await chrome.storage.local.set({ [VELOG_CONNECTION_KEY]: connection });
    setVelogStatus(formatVelogConnection(connection), 'success');
    alert('Velog 연결을 저장했습니다.');
  } catch (error) {
    const message = error.message || String(error);
    setVelogStatus(message, 'failed');
    alert(message);
  }
}

async function getVelogTab() {
  const tabs = await chrome.tabs.query({});
  return tabs.find((tab) => /^https:\/\/velog\.io\//.test(tab.url || '')) || null;
}

async function renderVelogStatus() {
  const result = await chrome.storage.local.get(VELOG_CONNECTION_KEY);
  const connection = result[VELOG_CONNECTION_KEY];
  if (!connection?.accessToken) {
    setVelogStatus('연결 안됨', 'idle');
    return;
  }
  setVelogStatus(formatVelogConnection(connection), 'success');
}

function setVelogStatus(message, status = 'idle') {
  if (!velogStatus) return;
  velogStatus.className = `connection-status ${status}`;
  velogStatus.textContent = message;
  velogStatus.title = message;
}

function formatVelogConnection(connection) {
  const date = connection.connectedAt ? new Date(connection.connectedAt).toLocaleString('ko-KR') : '시간 알 수 없음';
  const user = connection.username ? `${connection.username} · ` : '';
  return `${user}${connection.tokenKey || 'access token'} 저장됨 · ${date}`;
}

function readVelogConnectionFromPage() {
  const tokenNames = [
    'access_token',
    'accessToken',
    'ACCESS_TOKEN',
    'velog_access_token',
    'v2_access_token',
    'token',
  ];
  const candidates = [];
  const collectStorage = (storage, source) => {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      const value = key ? storage.getItem(key) : '';
      if (!key || !value) continue;
      const lower = key.toLowerCase();
      if (tokenNames.some((name) => lower.includes(name.toLowerCase())) || /access.*token|token.*access/.test(lower)) {
        candidates.push({ key: `${source}:${key}`, value });
      }
      try {
        const parsed = JSON.parse(value);
        for (const name of tokenNames) {
          if (typeof parsed?.[name] === 'string') candidates.push({ key: `${source}:${key}.${name}`, value: parsed[name] });
        }
      } catch {}
    }
  };
  collectStorage(window.localStorage, 'localStorage');
  collectStorage(window.sessionStorage, 'sessionStorage');
  for (const cookie of document.cookie.split(';')) {
    const [rawKey, ...rawValue] = cookie.trim().split('=');
    const value = rawValue.join('=');
    if (!rawKey || !value) continue;
    const lower = rawKey.toLowerCase();
    if (tokenNames.some((name) => lower.includes(name.toLowerCase())) || /access.*token|token.*access/.test(lower)) {
      candidates.push({ key: `cookie:${rawKey}`, value: decodeURIComponent(value) });
    }
  }
  const token = candidates.find((item) => typeof item.value === 'string' && item.value.length >= 20);
  const username = window.__APOLLO_STATE__
    ? Object.values(window.__APOLLO_STATE__).find((item) => item?.username)?.username
    : '';
  if (!token) {
    return {
      ok: false,
      message: 'Velog access token 후보를 찾지 못했습니다. velog.io에 로그인되어 있는지 확인하세요. HttpOnly 쿠키 방식이면 브라우저 보안상 직접 읽을 수 없습니다.',
    };
  }
  return {
    ok: true,
    tokenKey: token.key,
    accessToken: token.value,
    username: typeof username === 'string' ? username : '',
  };
}

async function runJobNow(jobId) {
  if (jobId === TERMINAL_JOB_ID) {
    await toggleGlobalTerminalAutomation();
    await updateStatusBadges();
    return;
  }
  setJobStatus(jobId, 'running', '실행중');
  try {
    const response = await chrome.runtime.sendMessage({ type: 'run-job-now', jobId });
    if (response?.result) {
      setJobStatus(jobId, response.result.status, response.result.message);
      if (['failed', 'blocked', 'skipped'].includes(response.result.status)) {
        alert(`${response.result.message}\n\n설정 화면의 "에러 해결방법"에서 대응 방법을 확인하세요.`);
        await renderErrorHelp();
      }
      return;
    }
    if (!response?.ok) {
      const message = response?.message || '실행하지 못했습니다.';
      setJobStatus(jobId, 'failed', message);
      alert(`${message}\n\n설정 화면의 "에러 해결방법"에서 대응 방법을 확인하세요.`);
      await renderErrorHelp();
    }
  } catch (error) {
    const message = error.message || String(error);
    setJobStatus(jobId, 'failed', message);
    alert(`${message}\n\n설정 화면의 "에러 해결방법"에서 대응 방법을 확인하세요.`);
    await renderErrorHelp();
  }
}

async function updateJob(jobId, patch) {
  const jobs = await getJobs();
  await setJobs(jobs.map((job) => job.id === jobId ? { ...job, ...patch } : job));
}

function patchForTargetKind(targetKind) {
  if (targetKind === 'native') {
    return {
      targetKind: 'native',
      selectedTabId: null,
      targetApp: '',
      customAppPath: '',
      urlPattern: '',
      startUrl: '',
      areaSelector: '',
      targetArea: '',
      backgroundTab: false,
      actions: [{ type: 'nativeClick', selector: '', value: '', ms: 1000, x: 0, y: 0, once: false }],
    };
  }
  return {
    targetKind: 'web',
    nativeProcess: '',
    nativeWindowTitle: '',
    actions: [{ type: 'click', selector: '', value: '', ms: 1000, x: 0, y: 500, once: false }],
  };
}

async function deleteJob(jobId) {
  const jobs = await getJobs();
  await setJobs(jobs.filter((job) => job.id !== jobId));
  render();
}

async function duplicateJob(jobId) {
  const jobs = await getJobs();
  const target = jobs.find((job) => job.id === jobId);
  if (!target) return;
  jobs.unshift(createJob({ ...target, id: crypto.randomUUID(), name: `${target.name} 복사`, enabled: false }));
  await setJobs(jobs);
  render();
}

async function updateAction(jobId, index, patch) {
  const jobs = await getJobs();
  const next = jobs.map((job) => {
    if (job.id !== jobId) return job;
    const actions = [...job.actions];
    actions[index] = { ...actions[index], ...patch };
    return { ...job, actions };
  });
  await setJobs(next);
}

async function getJob(jobId) {
  const jobs = await getJobs();
  return jobs.find((item) => item.id === jobId) || null;
}

async function addAction(jobId) {
  const jobs = await getJobs();
  const next = jobs.map((job) => {
    if (job.id !== jobId) return job;
    const type = job.targetKind === 'native' ? 'nativeClick' : 'click';
    return { ...job, actions: [...job.actions, normalizeAction({ type })].slice(0, 20) };
  });
  await setJobs(next);
  render();
}

async function removeAction(jobId, index) {
  const jobs = await getJobs();
  const next = jobs.map((job) => {
    if (job.id !== jobId) return job;
    return { ...job, actions: job.actions.filter((_, actionIndex) => actionIndex !== index) };
  });
  await setJobs(next);
  render();
}

function bindField(element, job, field, coerce = (value) => value) {
  const input = element.querySelector(`[data-field="${field}"]`);
  if (!input) return;
  if (input.type === 'checkbox') input.checked = Boolean(job[field]);
  else input.value = job[field] ?? '';
  input.addEventListener('change', async () => {
    const value = input.type === 'checkbox' ? input.checked : coerce(input.value);
    const patch = field === 'targetKind' ? patchForTargetKind(value) : { [field]: value };
    if (field === 'targetApp') patch.customAppPath = '';
    if (field === 'customAppPath' && value) patch.targetApp = '';
    await updateJob(job.id, patch);
    if (field === 'targetApp' || field === 'appBaseUrl' || field === 'customAppPath') await applyTargetApp(job.id);
    if (field === 'targetArea') await applyTargetArea(job.id);
    if (field === 'scheduleType' || field === 'targetApp' || field === 'appBaseUrl' || field === 'targetArea') render();
  });
}

async function loadNativeWindows(grid = nativePickerGrid) {
  if (!grid) return [];
  grid.innerHTML = '<div class="picker-empty">Windows 앱을 불러오는 중...</div>';
  try {
    const response = await chrome.runtime.sendNativeMessage('com.playground.site_macro_bridge', { type: 'listWindows' });
    if (!response?.ok || !Array.isArray(response.windows)) throw new Error(response?.message || '창 목록을 불러오지 못했습니다.');
    nativeWindows = response.windows.map((item, index) => ({
      process: String(item.process || ''),
      title: String(item.title || ''),
      icon: String(item.icon || ''),
      key: `${item.process || ''}::${item.id || index}::${item.title || ''}`,
    }));
    renderNativeWindowGrid(grid);
    return nativeWindows;
  } catch (error) {
    return loadNativeWindowsFromTracker(grid, error);
  }
}

async function loadNativeWindowsFromTracker(grid, nativeError) {
  try {
    grid.innerHTML = '<div class="picker-empty">브리지 연결 실패. FocusTime Tracker에서 실행 중인 앱을 불러오는 중...</div>';
    const response = await fetchTracker('/apps');
    if (!response.ok) throw new Error(`FocusTime Tracker 응답 오류: ${response.status}`);
    const data = await response.json();
    const apps = Array.isArray(data.apps) ? data.apps : [];
    nativeWindows = apps
      .filter((item) => item.running)
      .map((item, index) => ({
        process: String(item.name || ''),
        title: String(item.display || item.name || ''),
        icon: item.hasIcon ? `${TRACKER_URL}/app-icon?name=${encodeURIComponent(item.name || '')}` : '',
        key: `tracker::${item.name || index}`,
      }))
      .filter((item) => item.process);
    renderNativeWindowGrid(grid);
    return nativeWindows;
  } catch (trackerError) {
    nativeWindows = [];
    grid.innerHTML = `
      <div class="picker-empty">
        Windows 앱 목록을 가져오지 못했습니다.<br />
        Native bridge를 등록하거나 FocusTimeTracker.exe를 실행하세요.<br />
        <small>Bridge: ${escapeHtml(nativeError.message || String(nativeError))}</small>
        <small>Tracker: ${escapeHtml(trackerError.message || String(trackerError))}</small>
      </div>
    `;
    return [];
  }
}

async function fetchTracker(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TRACKER_TIMEOUT_MS);
  try {
    return await fetch(`${TRACKER_URL}${path}`, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function selectNativeWindow(jobId, item) {
  const card = document.querySelector(`[data-job-id="${escapeSelector(jobId)}"]`);
  const processInput = card?.querySelector('[data-field="nativeProcess"]');
  const titleInput = card?.querySelector('[data-field="nativeWindowTitle"]');
  if (processInput) processInput.value = item.process;
  if (titleInput) titleInput.value = item.title;
  await updateJob(jobId, {
    targetKind: 'native',
    nativeProcess: item.process,
    nativeWindowTitle: item.title,
    selectedTabId: null,
    targetApp: '',
    customAppPath: '',
    urlPattern: '',
    startUrl: '',
    areaSelector: '',
    targetArea: '',
    backgroundTab: false,
  });
  focusNativeWindow(item).catch(() => {});
  closeAppPicker();
  render();
}

function renderNativeWindowGrid(grid = nativePickerGrid, selectedKey = '') {
  if (!grid) return;
  if (!nativeWindows.length) {
    grid.innerHTML = '<div class="picker-empty">켜져 있는 Windows 앱 창이 없습니다.</div>';
    return;
  }
  grid.innerHTML = '';
  for (const item of nativeWindows) {
    const button = document.createElement('div');
    button.className = `native-app-tile ${item.key === selectedKey ? 'selected' : ''}`;
    const icon = item.icon
      ? `<img src="${escapeAttr(item.icon)}" alt="" />`
      : `<div class="native-app-icon">${escapeHtml(item.process.slice(0, 1).toUpperCase() || '?')}</div>`;
    button.innerHTML = `
      <div class="native-window-preview">
        <span class="native-window-preview-empty">미리보기 버튼을 누르면 화면을 보여줍니다.</span>
      </div>
      ${icon}
      <div class="native-app-name">${escapeHtml(item.process)}</div>
      <div class="native-app-title">${escapeHtml(item.title)}</div>
      <div class="native-app-actions">
        <button type="button" data-action="previewNative">미리보기</button>
        <button type="button" data-action="selectNative">선택/열기</button>
      </div>
    `;
    button.querySelector('[data-action="previewNative"]').addEventListener('click', (event) => {
      event.stopPropagation();
      previewNativeWindow(item, button);
    });
    button.querySelector('[data-action="selectNative"]').addEventListener('click', (event) => {
      event.stopPropagation();
      if (activePickerJobId) selectNativeWindow(activePickerJobId, item);
    });
    grid.append(button);
  }
}

async function previewNativeWindow(item, tile) {
  const preview = tile.querySelector('.native-window-preview');
  if (!preview) return;
  preview.innerHTML = '<span class="native-window-preview-empty">화면을 가져오는 중...</span>';
  try {
    const response = await chrome.runtime.sendNativeMessage('com.playground.site_macro_bridge', {
      type: 'previewWindow',
      process: item.process || '',
      windowTitle: item.title || '',
    });
    if (!response?.ok || !response.preview) throw new Error(response?.message || '창 미리보기를 가져오지 못했습니다.');
    preview.innerHTML = `<img src="${escapeAttr(response.preview)}" alt="Windows 앱 화면 미리보기" />`;
  } catch (error) {
    preview.innerHTML = `<span class="native-window-preview-empty">미리보기는 Native bridge 연결이 필요합니다.<br />${escapeHtml(error.message || String(error))}</span>`;
  }
}

async function focusNativeWindow(item) {
  const response = await chrome.runtime.sendNativeMessage('com.playground.site_macro_bridge', {
    type: 'focusWindow',
    process: item.process || '',
    windowTitle: item.title || '',
  });
  if (!response?.ok) throw new Error(response?.message || '창을 열지 못했습니다.');
  return response;
}

async function openAppPicker(jobId) {
  activePickerJobId = jobId;
  if (!appPickerModal) return;
  const card = document.querySelector(`[data-job-id="${escapeSelector(jobId)}"]`);
  const targetArea = card?.querySelector('.app-target');
  if (targetArea && appPickerModal.parentElement !== card) {
    targetArea.after(appPickerModal);
  }
  appPickerModal.hidden = false;
  const jobs = await getJobs();
  const job = jobs.find((item) => item.id === jobId);
  const tab = job?.targetKind === 'native' ? 'native' : 'web';
  switchPickerTab(tab, { load: true });
  appPickerModal.scrollIntoView({ block: 'nearest' });
}

function closeAppPicker() {
  if (appPickerModal) appPickerModal.hidden = true;
  activePickerJobId = '';
}

function switchPickerTab(tab = 'web', options = {}) {
  document.querySelectorAll('[data-picker-tab]').forEach((button) => {
    button.classList.toggle('active', button.dataset.pickerTab === tab);
  });
  if (webPickerGrid) webPickerGrid.hidden = tab !== 'web';
  if (nativePickerGrid) nativePickerGrid.hidden = tab !== 'native';
  if (options.load && tab === 'web') loadWebTabs();
  if (options.load && tab === 'native') loadNativeWindows();
}

async function loadWebTabs() {
  if (!webPickerGrid) return;
  webPickerGrid.innerHTML = '<div class="picker-empty">켜져 있는 웹 탭을 불러오는 중...</div>';
  const tabs = (await chrome.tabs.query({}))
    .filter((tab) => tab.id && /^https?:\/\//.test(tab.url || ''))
    .sort((a, b) => Number(b.active) - Number(a.active));
  if (!tabs.length) {
    webPickerGrid.innerHTML = '<div class="picker-empty">선택할 수 있는 웹 탭이 없습니다.</div>';
    return;
  }
  webPickerGrid.innerHTML = '';
  for (const tab of tabs) {
    const button = document.createElement('div');
    button.className = 'picker-tile web-tile';
    const host = new URL(tab.url).host;
    button.innerHTML = `
      <div class="tab-preview" data-preview-for="${tab.id}">
        <span class="tab-preview-empty">미리보기 버튼을 누르면 화면을 보여줍니다.</span>
      </div>
      ${tab.favIconUrl ? `<img src="${escapeAttr(tab.favIconUrl)}" alt="" />` : `<div class="native-app-icon">${escapeHtml(host.slice(0, 1).toUpperCase())}</div>`}
      <div class="native-app-name">${escapeHtml(tab.title || host)}</div>
      <div class="native-app-title">${escapeHtml(host)}</div>
      <div class="picker-tile-actions">
        <button type="button" data-action="previewTab">미리보기</button>
        <button type="button" data-action="selectTab">선택/열기</button>
      </div>
    `;
    button.querySelector('[data-action="previewTab"]').addEventListener('click', (event) => {
      event.stopPropagation();
      previewWebTab(tab, button);
    });
    button.querySelector('[data-action="selectTab"]').addEventListener('click', (event) => {
      event.stopPropagation();
      selectWebTab(tab);
    });
    webPickerGrid.append(button);
  }
}

async function previewWebTab(tab, tile) {
  const preview = tile.querySelector('.tab-preview');
  if (!preview || !tab.id) return;
  preview.innerHTML = '<span class="tab-preview-empty">화면을 가져오는 중...</span>';
  let previousTabId = null;
  try {
    const currentTabs = await chrome.tabs.query({ active: true, currentWindow: true });
    previousTabId = currentTabs[0]?.id || null;
    await chrome.tabs.update(tab.id, { active: true });
    await waitForTabReady(tab.id);
    const imageUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 55 });
    preview.innerHTML = `<img src="${escapeAttr(imageUrl)}" alt="탭 화면 미리보기" />`;
  } catch (error) {
    preview.innerHTML = `<span class="tab-preview-empty">미리보기를 가져오지 못했습니다.<br />${escapeHtml(error.message || String(error))}</span>`;
  } finally {
    if (previousTabId && previousTabId !== tab.id) {
      chrome.tabs.update(previousTabId, { active: true }).catch(() => {});
    }
  }
}

function waitForTabReady(tabId) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, 600);
    chrome.tabs.onUpdated.addListener(function listener(updatedTabId, info) {
      if (updatedTabId !== tabId || info.status !== 'complete') return;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    });
  });
}

async function selectWebTab(tab) {
  const url = tab.url || '';
  if (!activePickerJobId || !url) return;
  const parsed = new URL(url);
  const pattern = `${parsed.origin}${parsed.pathname}*`;
  if (tab.id) await chrome.tabs.update(tab.id, { active: true });
  await updateJob(activePickerJobId, {
    targetKind: 'web',
    selectedTabId: tab.id,
    urlPattern: pattern,
    startUrl: url,
    openIfMissing: false,
    backgroundTab: true,
    targetApp: '',
    customAppPath: '',
    nativeProcess: '',
    nativeWindowTitle: '',
  });
  closeAppPicker();
  render();
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

function escapeSelector(value) {
  return globalThis.CSS?.escape ? CSS.escape(value) : String(value).replace(/["\\]/g, '\\$&');
}

async function applyTargetApp(jobId) {
  const jobs = await getJobs();
  const job = jobs.find((item) => item.id === jobId);
  const appPath = normalizeAppPath(job?.customAppPath || job?.targetApp);
  if (!appPath) return;
  const baseUrl = normalizeBaseUrl(job.appBaseUrl);
  const startUrl = `${baseUrl}${appPath}`;
  await updateJob(jobId, {
    appBaseUrl: baseUrl,
    customAppPath: job.customAppPath ? appPath : '',
    urlPattern: `${startUrl}*`,
    startUrl,
    openIfMissing: false,
    backgroundTab: true,
  });
}

async function applyTargetArea(jobId) {
  const jobs = await getJobs();
  const job = jobs.find((item) => item.id === jobId);
  if (!job || job.targetArea === 'custom') return;
  await updateJob(jobId, {
    areaSelector: AREA_SELECTORS[job.targetArea] || '',
  });
}

function bindActionField(row, job, action, index, field, coerce = (value) => value) {
  const input = row.querySelector(`[data-field="${field}"]`);
  if (!input) return;
  if (input.type === 'checkbox') input.checked = Boolean(action[field]);
  else input.value = action[field] ?? '';
  input.dataset.actionField = field;
  input.addEventListener('change', async () => {
    const value = input.type === 'checkbox' ? input.checked : coerce(input.value);
    await updateAction(job.id, index, { [field]: value });
    if (field === 'type') {
      row.dataset.actionType = input.value;
      syncActionRowForTarget(row, job.targetKind);
    }
  });
}

function renderAction(job, action, index) {
  const row = actionTemplate.content.firstElementChild.cloneNode(true);
  row.dataset.actionType = action.type;
  bindActionField(row, job, action, index, 'type');
  bindActionField(row, job, action, index, 'selector');
  bindActionField(row, job, action, index, 'value');
  bindActionField(row, job, action, index, 'ms', Number);
  bindActionField(row, job, action, index, 'x', Number);
  bindActionField(row, job, action, index, 'y', Number);
  bindActionField(row, job, action, index, 'once');
  syncActionRowForTarget(row, job.targetKind);
  row.querySelector('[data-action="pickFromScreen"]').addEventListener('click', () => pickActionTarget(job.id, index));
  row.querySelector('[data-action="removeAction"]').addEventListener('click', () => removeAction(job.id, index));
  return row;
}

function syncActionRowForTarget(row, targetKind) {
  const typeSelect = row.querySelector('[data-field="type"]');
  if (!typeSelect) return;
  [...typeSelect.options].forEach((option) => {
    const webTypes = ['click', 'type', 'key', 'wait', 'scroll', 'reload'];
    const nativeTypes = ['nativeClick', 'type', 'key', 'wait'];
    option.hidden = targetKind === 'native' ? !nativeTypes.includes(option.value) : !webTypes.includes(option.value);
  });
  if (typeSelect.selectedOptions[0]?.hidden) {
    typeSelect.value = targetKind === 'native' ? 'nativeClick' : 'click';
    row.dataset.actionType = typeSelect.value;
  }
}

async function pickActionTarget(jobId, index) {
  const job = await getJob(jobId);
  if (!job) return;
  const action = job.actions[index];
  if (!action) return;
  if (job.targetKind === 'native') {
    await pickNativePoint(jobId, index);
    return;
  }
  await pickWebElement(job, index);
}

async function pickWebElement(job, index) {
  const tab = await getPickerTab(job);
  if (!tab?.id) {
    alert('먼저 앱 선택하기에서 웹 탭을 선택하세요.');
    return;
  }
  try {
    await chrome.tabs.update(tab.id, { active: true });
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: pickElementOnPage,
      world: 'MAIN',
    });
    if (!result?.selector) return;
    await updateAction(job.id, index, { selector: result.selector });
    render();
    alert('완료되었습니다.');
  } catch (error) {
    alert(`화면에서 요소를 선택하지 못했습니다: ${error.message || String(error)}`);
  }
}

async function pickArea(jobId) {
  const job = await getJob(jobId);
  if (!job) return;
  if (job.targetKind === 'native') {
    await pickNativeArea(job);
    return;
  }
  const tab = await getPickerTab(job);
  if (!tab?.id) {
    alert('먼저 앱 선택하기에서 웹 탭을 선택하세요.');
    return;
  }
  try {
    await chrome.tabs.update(tab.id, { active: true });
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: pickElementOnPage,
      world: 'MAIN',
    });
    if (!result?.selector) return;
    await updateJob(job.id, { targetArea: 'custom', areaSelector: result.selector });
    render();
    alert('완료되었습니다.');
  } catch (error) {
    alert(`구역을 선택하지 못했습니다: ${error.message || String(error)}`);
  }
}

async function pickNativeArea(job) {
  if (!job.nativeProcess && !job.nativeWindowTitle) {
    alert('먼저 앱 선택하기에서 Windows 앱을 선택하세요.');
    return;
  }
  try {
    await focusNativeWindow({ process: job.nativeProcess, title: job.nativeWindowTitle });
    alert('대상 앱 화면 위에서 클릭할 위치에 마우스를 올린 뒤 확인을 누르세요. 첫 번째 Windows 좌표 클릭 액션에 좌표를 저장합니다.');
    const response = await chrome.runtime.sendNativeMessage('com.playground.site_macro_bridge', { type: 'getCursorPosition' });
    if (!response?.ok || !response.point) throw new Error(response?.message || '마우스 좌표를 가져오지 못했습니다.');
    const actions = [...job.actions];
    const index = actions.findIndex((action) => action.type === 'nativeClick');
    const targetIndex = index >= 0 ? index : 0;
    actions[targetIndex] = normalizeAction({
      ...(actions[targetIndex] || {}),
      type: 'nativeClick',
      x: response.point.x,
      y: response.point.y,
      once: true,
    });
    await updateJob(job.id, { actions });
    render();
    alert('완료되었습니다.');
  } catch (error) {
    alert(`앱 구역 선택은 Native bridge 연결이 필요합니다: ${error.message || String(error)}`);
  }
}

async function getPickerTab(job) {
  if (job.selectedTabId) {
    try {
      return await chrome.tabs.get(Number(job.selectedTabId));
    } catch {}
  }
  const tabs = await chrome.tabs.query({});
  return tabs.find((item) => urlMatchesPatternLocal(item.url, job.urlPattern)) || null;
}

function urlMatchesPatternLocal(url, pattern) {
  if (!url || !pattern) return false;
  const escaped = pattern.trim().replace(/[.+?^${}()|[\]\\]/g, '\\$&').replaceAll('*', '.*');
  return new RegExp(`^${escaped}$`).test(url);
}

async function pickNativePoint(jobId, index) {
  const job = await getJob(jobId);
  try {
    if (job) await focusNativeWindow({ process: job.nativeProcess, title: job.nativeWindowTitle });
    alert('대상 Windows 앱 위에 마우스를 올린 뒤 확인을 누르세요. 현재 마우스 좌표를 액션에 저장합니다.');
    const response = await chrome.runtime.sendNativeMessage('com.playground.site_macro_bridge', { type: 'getCursorPosition' });
    if (!response?.ok || !response.point) throw new Error(response?.message || '마우스 좌표를 가져오지 못했습니다.');
    await updateAction(jobId, index, { x: response.point.x, y: response.point.y });
    render();
    alert('완료되었습니다.');
  } catch (error) {
    alert(`좌표 선택은 Native bridge 연결이 필요합니다: ${error.message || String(error)}`);
  }
}

function pickElementOnPage() {
  return new Promise((resolve) => {
    const style = document.createElement('style');
    style.textContent = `
      .site-macro-pick-outline { outline: 3px solid #2f7d54 !important; outline-offset: 2px !important; cursor: crosshair !important; }
      .site-macro-pick-help { position: fixed; top: 12px; left: 50%; transform: translateX(-50%); z-index: 2147483647; padding: 10px 14px; border-radius: 8px; background: #18201d; color: #fff; font: 800 13px system-ui, sans-serif; box-shadow: 0 10px 24px rgba(0,0,0,.18); }
    `;
    const help = document.createElement('div');
    help.className = 'site-macro-pick-help';
    help.textContent = '대상 요소를 클릭하세요. Esc를 누르면 취소합니다.';
    document.documentElement.append(style, help);
    let current = null;
    const cleanup = () => {
      current?.classList.remove('site-macro-pick-outline');
      document.removeEventListener('mouseover', onMove, true);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('keydown', onKey, true);
      style.remove();
      help.remove();
    };
    const selectorFor = (element) => {
      if (element.id) return `#${CSS.escape(element.id)}`;
      const parts = [];
      for (let node = element; node && node.nodeType === Node.ELEMENT_NODE && node !== document.body; node = node.parentElement) {
        let part = node.tagName.toLowerCase();
        const className = [...node.classList].filter(Boolean).slice(0, 2).map((item) => `.${CSS.escape(item)}`).join('');
        if (className) part += className;
        const parent = node.parentElement;
        if (parent) {
          const siblings = [...parent.children].filter((item) => item.tagName === node.tagName);
          if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(node) + 1})`;
        }
        parts.unshift(part);
        const selector = parts.join(' > ');
        if (document.querySelectorAll(selector).length === 1) return selector;
      }
      return parts.join(' > ');
    };
    const onMove = (event) => {
      if (!(event.target instanceof Element) || event.target === help) return;
      current?.classList.remove('site-macro-pick-outline');
      current = event.target;
      current.classList.add('site-macro-pick-outline');
    };
    const onClick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      const target = event.target instanceof Element ? event.target : current;
      const selector = target ? selectorFor(target) : '';
      cleanup();
      resolve({ selector });
    };
    const onKey = (event) => {
      if (event.key !== 'Escape') return;
      cleanup();
      resolve({ selector: '' });
    };
    document.addEventListener('mouseover', onMove, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKey, true);
  });
}

async function render() {
  const jobs = await getJobs();
  const statuses = await getLatestStatusMap();
  const globalStatus = await getGlobalTerminalStatus();
  jobEditorList.innerHTML = '';
  if (!jobs.length) {
    jobEditorList.innerHTML = '<div class="empty">작업을 추가해서 시작하세요.</div>';
    return;
  }

  for (const job of jobs) {
    const card = jobTemplate.content.firstElementChild.cloneNode(true);
    card.dataset.jobId = job.id;
    card.dataset.targetKind = job.targetKind;
    card.dataset.scheduleType = job.scheduleType;
    applyStatusBadge(card.querySelector('[data-role="jobStatus"]'), statuses.get(job.id), job, globalStatus);
    bindField(card, job, 'name');
    bindField(card, job, 'enabled');
    bindField(card, job, 'targetKind');
    bindField(card, job, 'appBaseUrl');
    bindField(card, job, 'targetApp');
    bindField(card, job, 'customAppPath');
    bindField(card, job, 'nativeProcess');
    bindField(card, job, 'nativeWindowTitle');
    bindField(card, job, 'targetArea');
    bindField(card, job, 'areaSelector');
    bindField(card, job, 'urlPattern');
    bindField(card, job, 'startUrl');
    bindField(card, job, 'openIfMissing');
    bindField(card, job, 'backgroundTab');
    bindField(card, job, 'scheduleType');
    bindField(card, job, 'intervalSeconds', Number);
    bindField(card, job, 'timeOfDay');

    const actions = card.querySelector('[data-role="actions"]');
    for (const [index, action] of job.actions.entries()) actions.append(renderAction(job, action, index));

    card.querySelector('[data-action="addAction"]').addEventListener('click', () => addAction(job.id));
    card.querySelector('[data-action="openAppPicker"]').addEventListener('click', () => openAppPicker(job.id));
    card.querySelectorAll('[data-action="pickArea"]').forEach((button) => {
      button.addEventListener('click', () => pickArea(job.id));
    });
    card.querySelector('[data-action="permission"]').addEventListener('click', () => requestPermission(job));
    card.querySelector('[data-action="runNow"]').addEventListener('click', () => runJobNow(job.id));
    card.querySelector('[data-action="duplicate"]').addEventListener('click', () => duplicateJob(job.id));
    card.querySelector('[data-action="delete"]').addEventListener('click', () => deleteJob(job.id));
    jobEditorList.append(card);
  }
}

async function getLatestStatusMap() {
  const result = await chrome.storage.local.get(LOG_KEY);
  const logs = Array.isArray(result[LOG_KEY]) ? result[LOG_KEY] : [];
  const map = new Map();
  for (const log of logs) {
    if (log.jobId && !map.has(log.jobId)) map.set(log.jobId, log);
  }
  return map;
}

async function updateStatusBadges() {
  const statuses = await getLatestStatusMap();
  const jobs = await getJobs();
  const globalStatus = await getGlobalTerminalStatus();
  const jobMap = new Map(jobs.map((job) => [job.id, job]));
  document.querySelectorAll('[data-job-id]').forEach((card) => {
    applyStatusBadge(card.querySelector('[data-role="jobStatus"]'), statuses.get(card.dataset.jobId), jobMap.get(card.dataset.jobId), globalStatus);
  });
}

function setJobStatus(jobId, status, message) {
  const card = document.querySelector(`[data-job-id="${escapeSelector(jobId)}"]`);
  applyStatusBadge(card?.querySelector('[data-role="jobStatus"]'), { status, message });
}

async function getGlobalTerminalStatus() {
  try {
    const response = await fetch(`${HOTKEY_API}/status`, { cache: 'no-store' });
    if (!response.ok) throw new Error(String(response.status));
    return await response.json();
  } catch {
    return { ok: false, running: false, disconnected: true };
  }
}

async function toggleGlobalTerminalAutomation() {
  try {
    await fetch(`${HOTKEY_API}/toggle`, { method: 'POST' });
  } catch {
    alert('전역 단축키 연결 프로그램이 꺼져 있습니다. scripts\\start-terminal-automation-hotkey.ps1를 실행하세요.');
  }
}

function applyStatusBadge(badge, log, job = null, globalStatus = null) {
  if (!badge) return;
  const visibleLogStatuses = ['running', 'success', 'failed', 'blocked', 'skipped'];
  const logStatus = log?.status && visibleLogStatuses.includes(log.status) ? log.status : '';
  const status = logStatus || (job?.id === TERMINAL_JOB_ID
    ? globalStatus?.disconnected ? 'blocked' : globalStatus?.running ? 'active' : 'idle'
    : job?.enabled ? 'active' : 'idle');
  const labels = {
    idle: '대기',
    active: '작동중',
    running: '실행중',
    success: '완료',
    failed: '실패',
    skipped: '건너뜀',
    blocked: '차단됨',
  };
  badge.className = `status-badge ${status}`;
  if (job?.id === TERMINAL_JOB_ID && !logStatus) {
    badge.textContent = globalStatus?.disconnected ? '연결 안됨' : globalStatus?.running ? '작동중' : '대기';
    badge.title = globalStatus?.disconnected ? '전역 단축키 연결 프로그램이 꺼져 있습니다.' : '';
    return;
  }
  badge.textContent = log?.message && ['blocked', 'failed', 'skipped'].includes(status)
    ? `${labels[status] || status}: ${log.message}`
    : labels[status] || status;
  badge.title = log?.message || '';
}

async function renderErrorHelp() {
  if (!errorHelpList || !latestErrorSummary) return;
  const result = await chrome.storage.local.get(LOG_KEY);
  const logs = Array.isArray(result[LOG_KEY]) ? result[LOG_KEY] : [];
  const latestError = logs.find((log) => ['failed', 'blocked', 'skipped'].includes(log.status));
  latestErrorSummary.textContent = latestError
    ? `${latestError.jobName}: ${latestError.message}`
    : '최근 에러 없음';

  const guides = latestError ? [latestError, ...commonErrorGuides()] : commonErrorGuides();
  errorHelpList.innerHTML = guides.map((item, index) => renderErrorGuide(item, index === 0 && latestError)).join('');
}

function commonErrorGuides() {
  return [
    { message: '사이트 권한이 없어 실행하지 않았습니다.' },
    { message: '조건에 맞는 탭을 찾지 못했습니다.' },
    { message: '요소를 찾지 못했습니다.' },
    { message: '대상 구역을 찾지 못했습니다.' },
    { message: '로컬 브리지를 실행하지 못했습니다.' },
    { message: 'VS Code 창을 앱 선택하기에서 먼저 지정해야 실행됩니다.' },
    { message: '전역 단축키 연결 프로그램이 꺼져 있습니다.' },
  ];
}

function renderErrorGuide(log, isLatest) {
  const guide = getErrorGuide(log.message || '');
  return `
    <article class="error-guide-card ${isLatest ? 'latest' : ''}">
      <div>
        <strong>${isLatest ? '최근 에러' : guide.title}</strong>
        <p>${escapeHtml(log.message || guide.title)}</p>
      </div>
      <ol>
        ${guide.steps.map((step) => `<li>${escapeHtml(step)}</li>`).join('')}
      </ol>
    </article>
  `;
}

function getErrorGuide(message) {
  const text = String(message || '');
  if (text.includes('사이트 권한')) {
    return { title: '사이트 권한 필요', steps: ['작업 카드의 URL 패턴이 https://example.com/* 형식인지 확인합니다.', '사이트 권한 허용 버튼을 누르고 Chrome 권한 요청을 승인합니다.', '권한 승인 후 지금 실행을 다시 누릅니다.'] };
  }
  if (text.includes('조건에 맞는 탭')) {
    return { title: '실행할 탭 없음', steps: ['대상 사이트 탭을 먼저 열어 둡니다.', 'URL 패턴이 열린 탭 주소와 일치하는지 확인합니다.', '앱 선택하기에서 현재 탭을 다시 선택합니다.'] };
  }
  if (text.includes('요소를 찾지 못했습니다') || text.includes('selector')) {
    return { title: 'CSS 선택자 오류', steps: ['사이트 화면이 완전히 열린 뒤 실행합니다.', '화면 선택 버튼으로 대상 요소를 다시 지정합니다.', '버튼이나 입력칸이 구역 CSS 선택자 안에 있는지 확인합니다.'] };
  }
  if (text.includes('대상 구역')) {
    return { title: '대상 구역 오류', steps: ['대상 구역을 전체 화면으로 바꿔 테스트합니다.', '구역 선택 버튼으로 영역을 다시 지정합니다.', '화면 변경 후 사라지는 영역이면 더 안정적인 상위 영역을 선택합니다.'] };
  }
  if (text.includes('로컬 브리지')) {
    return { title: 'Windows 브리지 연결 실패', steps: ['apps\\site-macro-native-bridge\\build.ps1로 브리지를 빌드합니다.', 'install-chrome-host.ps1 -ExtensionId 확장ID를 다시 실행합니다.', 'Chrome을 재시작한 뒤 Windows 앱 작업을 다시 실행합니다.'] };
  }
  if (text.includes('VS Code 창')) {
    return { title: 'Windows 창 미지정', steps: ['앱 선택하기를 열고 Windows 앱 탭으로 이동합니다.', '현재 실행 중인 VS Code 창을 선택합니다.', '저장된 창 제목을 확인한 뒤 다시 실행합니다.'] };
  }
  if (text.includes('전역 단축키')) {
    return { title: '전역 단축키 연결 실패', steps: ['scripts\\start-terminal-automation-hotkey.ps1를 실행합니다.', '방화벽이나 보안 프로그램이 127.0.0.1:18765 연결을 막지 않는지 확인합니다.', '상태가 연결 안됨에서 대기로 바뀐 뒤 다시 시도합니다.'] };
  }
  return { title: '일반 실행 오류', steps: ['최근 에러 메시지의 작업 이름과 액션 순서를 확인합니다.', '지금 실행으로 한 번 테스트하고 상태 배지의 메시지를 확인합니다.', '사이트 권한, 탭 선택, CSS 선택자, Windows 브리지 설정을 차례로 점검합니다.'] };
}

render();
renderErrorHelp();
