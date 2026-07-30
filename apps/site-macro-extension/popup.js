const STORAGE_KEY = 'siteMacroJobs';
const LOG_KEY = 'siteMacroLogs';
const THEME_KEY = 'siteMacroTheme';
const MIN_INTERVAL_SECONDS = 2;
const TERMINAL_JOB_ID = 'terminal-automation-enter-3s';
const HOTKEY_API = 'http://127.0.0.1:18765';

const jobList = document.querySelector('#jobList');
const logList = document.querySelector('#logList');
const openOptionsButton = document.querySelector('#openOptions');
const newJobButton = document.querySelector('#newJob');
const clearLogsButton = document.querySelector('#clearLogs');
const themeSelect = document.querySelector('#themeSelect');

initTheme();
syncTerminalJob();

openOptionsButton.addEventListener('click', () => chrome.runtime.openOptionsPage());
newJobButton.addEventListener('click', () => chrome.runtime.openOptionsPage());
clearLogsButton.addEventListener('click', async () => {
  await chrome.storage.local.set({ [LOG_KEY]: [] });
  await render();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if ((area === 'sync' && changes[STORAGE_KEY]) || (area === 'local' && changes[LOG_KEY])) render();
});

setInterval(() => {
  if (!document.hidden) renderJobs();
}, 1000);

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
  await chrome.storage.sync.set({ [STORAGE_KEY]: jobs });
}

async function runNow(jobId) {
  if (jobId === TERMINAL_JOB_ID) {
    await toggleGlobalTerminalAutomation();
    await render();
    return;
  }
  setJobStatus(jobId, 'running', '실행중');
  const response = await chrome.runtime.sendMessage({ type: 'run-job-now', jobId });
  if (response?.result) setJobStatus(jobId, response.result.status, response.result.message);
  setTimeout(render, 250);
}

async function toggleJob(jobId) {
  if (jobId === TERMINAL_JOB_ID) {
    await toggleGlobalTerminalAutomation();
    await render();
    return;
  }
  const jobs = await getJobs();
  const next = jobs.map((job) => job.id === jobId ? { ...job, enabled: !job.enabled } : job);
  await setJobs(next);
  await render();
}

async function renderJobs() {
  const jobs = await getJobs();
  const statuses = await getLatestStatusMap();
  const globalStatus = await getGlobalTerminalStatus();
  jobList.innerHTML = '';
  if (!jobs.length) {
    jobList.innerHTML = '<div class="empty">아직 등록된 작업이 없습니다.</div>';
    return;
  }
  for (const job of jobs) {
    const item = document.createElement('article');
    item.className = 'job';
    item.dataset.jobId = job.id;
    item.innerHTML = `
      <div class="job-head">
        <strong>${escapeHtml(job.name)}</strong>
        <span class="status-badge ${statusClass(job, statuses.get(job.id), globalStatus)}" data-role="jobStatus">${escapeHtml(statusLabel(job, statuses.get(job.id), globalStatus))}</span>
      </div>
      ${targetLabel(job)}
      ${job.areaSelector ? `<small>대상 구역: ${escapeHtml(job.areaSelector)}</small>` : ''}
      ${job.targetKind === 'web' ? `<small>${escapeHtml(job.urlPattern)}</small>` : ''}
      <small>${job.scheduleType === 'time' ? `매일 ${job.timeOfDay}` : `${job.intervalSeconds}초 간격`} · 액션 ${job.actions.length}개${job.backgroundTab ? ' · 백그라운드 탭' : ''}</small>
      <div class="job-actions">
        <button type="button" data-action="run">${job.id === TERMINAL_JOB_ID ? '전역 토글' : '지금 실행'}</button>
        <button type="button" data-action="toggle">${job.id === TERMINAL_JOB_ID ? (globalStatus?.running ? '멈춤' : '시작') : (job.enabled ? '끄기' : '켜기')}</button>
      </div>
    `;
    item.querySelector('[data-action="run"]').addEventListener('click', () => runNow(job.id));
    item.querySelector('[data-action="toggle"]').addEventListener('click', () => toggleJob(job.id));
    jobList.append(item);
  }
}

async function syncTerminalJob() {
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
  const existingIndex = jobs.findIndex((job) => job.id === sample.id);
  if (existingIndex >= 0) {
    const existing = jobs[existingIndex];
    const next = {
      ...existing,
      name: sample.name,
      targetKind: 'native',
      nativeProcess: existing.nativeProcess || 'Code',
      scheduleType: 'interval',
      intervalSeconds: MIN_INTERVAL_SECONDS,
      actions: sample.actions,
    };
    changed = changed || JSON.stringify(existing) !== JSON.stringify(next);
    jobs[existingIndex] = next;
  } else {
    jobs.unshift(sample);
    changed = true;
  }
  if (changed) await setJobs(jobs);
  await render();
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

function setJobStatus(jobId, status, message) {
  const item = document.querySelector(`[data-job-id="${escapeSelector(jobId)}"]`);
  const badge = item?.querySelector('[data-role="jobStatus"]');
  if (!badge) return;
  badge.className = `status-badge ${status}`;
  badge.textContent = statusLabel(null, { status, message });
  badge.title = message || '';
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

function statusClass(job, log, globalStatus = null) {
  if (job?.id === TERMINAL_JOB_ID) {
    if (globalStatus?.disconnected) return 'blocked';
    return globalStatus?.running ? 'active' : 'idle';
  }
  return job?.enabled ? 'active' : log?.status || 'idle';
}

function statusLabel(job, log, globalStatus = null) {
  if (job?.id === TERMINAL_JOB_ID) {
    if (globalStatus?.disconnected) return '연결 안됨';
    return globalStatus?.running ? '작동중' : '대기';
  }
  const status = job?.enabled ? 'active' : log?.status || 'idle';
  const labels = {
    idle: '대기',
    active: '작동중',
    running: '실행중',
    success: '완료',
    failed: '실패',
    skipped: '건너뜀',
    blocked: '차단됨',
  };
  if (log?.message && ['blocked', 'failed', 'skipped'].includes(status)) return `${labels[status] || status}: ${log.message}`;
  return labels[status] || status;
}

function targetLabel(job) {
  if (job.targetKind === 'native') {
    const title = job.nativeWindowTitle ? ` · ${job.nativeWindowTitle}` : '';
    return `<small>대상 앱: ${escapeHtml(job.nativeProcess || 'Windows 앱')}${escapeHtml(title)}</small>`;
  }
  return job.targetApp ? `<small>대상 앱: ${escapeHtml(job.targetApp)}</small>` : '';
}

async function renderLogs() {
  const result = await chrome.storage.local.get(LOG_KEY);
  const logs = Array.isArray(result[LOG_KEY]) ? result[LOG_KEY] : [];
  logList.innerHTML = '';
  if (!logs.length) {
    logList.innerHTML = '<div class="empty">실행 로그가 없습니다.</div>';
    return;
  }
  for (const log of logs.slice(0, 8)) {
    const item = document.createElement('article');
    item.className = 'log';
    item.innerHTML = `
      <strong>${escapeHtml(log.status)} · ${escapeHtml(log.jobName)}</strong>
      <small>${new Date(log.createdAt).toLocaleString('ko-KR')}</small>
      <small>${escapeHtml(log.message)}</small>
    `;
    logList.append(item);
  }
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function escapeSelector(value) {
  if (window.CSS?.escape) return CSS.escape(value);
  return String(value).replace(/["\\]/g, '\\$&');
}

async function render() {
  await renderJobs();
  await renderLogs();
}

render();
