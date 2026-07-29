const STORAGE_KEY = 'siteMacroJobs';
const THEME_KEY = 'siteMacroTheme';
const MIN_INTERVAL_SECONDS = 5;
const DEFAULT_APP_BASE_URL = 'https://playground.https.gsmsv.site';
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
let nativeWindows = [];
let activePickerJobId = '';

initTheme();

addJobButton.addEventListener('click', async () => {
  const jobs = await getJobs();
  jobs.unshift(createJob());
  await setJobs(jobs);
  render();
});

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
  button.addEventListener('click', () => switchPickerTab(button.dataset.pickerTab));
});

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

async function updateJob(jobId, patch) {
  const jobs = await getJobs();
  await setJobs(jobs.map((job) => job.id === jobId ? { ...job, ...patch } : job));
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

async function addAction(jobId) {
  const jobs = await getJobs();
  const next = jobs.map((job) => {
    if (job.id !== jobId) return job;
    return { ...job, actions: [...job.actions, normalizeAction({ type: 'click' })].slice(0, 20) };
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
    const patch = { [field]: value };
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
    nativeWindows = [];
    grid.innerHTML = `
      <div class="picker-empty">
        Windows 앱 목록을 가져오지 못했습니다.<br />
        브리지를 빌드하고 Chrome Native Messaging host로 등록해야 합니다.<br />
        <small>${escapeHtml(error.message || String(error))}</small>
      </div>
    `;
    return [];
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
  });
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
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `native-app-tile ${item.key === selectedKey ? 'selected' : ''}`;
    const icon = item.icon
      ? `<img src="${escapeAttr(item.icon)}" alt="" />`
      : `<div class="native-app-icon">${escapeHtml(item.process.slice(0, 1).toUpperCase() || '?')}</div>`;
    button.innerHTML = `
      ${icon}
      <div class="native-app-name">${escapeHtml(item.process)}</div>
      <div class="native-app-title">${escapeHtml(item.title)}</div>
    `;
    button.addEventListener('click', () => {
      if (activePickerJobId) selectNativeWindow(activePickerJobId, item);
    });
    grid.append(button);
  }
}

async function openAppPicker(jobId) {
  activePickerJobId = jobId;
  if (!appPickerModal) return;
  appPickerModal.hidden = false;
  switchPickerTab('web');
  await loadWebTabs();
  loadNativeWindows();
}

function closeAppPicker() {
  if (appPickerModal) appPickerModal.hidden = true;
  activePickerJobId = '';
}

function switchPickerTab(tab = 'web') {
  document.querySelectorAll('[data-picker-tab]').forEach((button) => {
    button.classList.toggle('active', button.dataset.pickerTab === tab);
  });
  if (webPickerGrid) webPickerGrid.hidden = tab !== 'web';
  if (nativePickerGrid) nativePickerGrid.hidden = tab !== 'native';
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
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'picker-tile web-tile';
    const host = new URL(tab.url).host;
    button.innerHTML = `
      ${tab.favIconUrl ? `<img src="${escapeAttr(tab.favIconUrl)}" alt="" />` : `<div class="native-app-icon">${escapeHtml(host.slice(0, 1).toUpperCase())}</div>`}
      <div class="native-app-name">${escapeHtml(tab.title || host)}</div>
      <div class="native-app-title">${escapeHtml(host)}</div>
    `;
    button.addEventListener('click', () => selectWebTab(tab));
    webPickerGrid.append(button);
  }
}

async function selectWebTab(tab) {
  const url = tab.url || '';
  if (!activePickerJobId || !url) return;
  const parsed = new URL(url);
  const pattern = `${parsed.origin}${parsed.pathname}*`;
  await updateJob(activePickerJobId, {
    targetKind: 'web',
    selectedTabId: tab.id,
    urlPattern: pattern,
    startUrl: url,
    openIfMissing: false,
    backgroundTab: true,
    targetApp: '',
    customAppPath: '',
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
  input.value = action[field] ?? '';
  input.addEventListener('change', () => updateAction(job.id, index, { [field]: coerce(input.value) }));
}

function renderAction(job, action, index) {
  const row = actionTemplate.content.firstElementChild.cloneNode(true);
  bindActionField(row, job, action, index, 'type');
  bindActionField(row, job, action, index, 'selector');
  bindActionField(row, job, action, index, 'value');
  bindActionField(row, job, action, index, 'ms', Number);
  bindActionField(row, job, action, index, 'x', Number);
  bindActionField(row, job, action, index, 'y', Number);
  row.querySelector('[data-action="removeAction"]').addEventListener('click', () => removeAction(job.id, index));
  return row;
}

async function render() {
  const jobs = await getJobs();
  jobEditorList.innerHTML = '';
  if (!jobs.length) {
    jobEditorList.innerHTML = '<div class="empty">작업을 추가해서 시작하세요.</div>';
    return;
  }

  for (const job of jobs) {
    const card = jobTemplate.content.firstElementChild.cloneNode(true);
    card.dataset.jobId = job.id;
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
    card.querySelector('[data-action="permission"]').addEventListener('click', () => requestPermission(job));
    card.querySelector('[data-action="duplicate"]').addEventListener('click', () => duplicateJob(job.id));
    card.querySelector('[data-action="delete"]').addEventListener('click', () => deleteJob(job.id));
    jobEditorList.append(card);
  }
}

render();
