const STORAGE_KEY = 'siteMacroJobs';
const LOG_KEY = 'siteMacroLogs';

const jobList = document.querySelector('#jobList');
const logList = document.querySelector('#logList');
const openOptionsButton = document.querySelector('#openOptions');
const newJobButton = document.querySelector('#newJob');
const clearLogsButton = document.querySelector('#clearLogs');

openOptionsButton.addEventListener('click', () => chrome.runtime.openOptionsPage());
newJobButton.addEventListener('click', () => chrome.runtime.openOptionsPage());
clearLogsButton.addEventListener('click', async () => {
  await chrome.storage.local.set({ [LOG_KEY]: [] });
  await render();
});

async function getJobs() {
  const result = await chrome.storage.sync.get(STORAGE_KEY);
  return Array.isArray(result[STORAGE_KEY]) ? result[STORAGE_KEY] : [];
}

async function setJobs(jobs) {
  await chrome.storage.sync.set({ [STORAGE_KEY]: jobs });
}

async function runNow(jobId) {
  await chrome.runtime.sendMessage({ type: 'run-job-now', jobId });
  setTimeout(render, 500);
}

async function toggleJob(jobId) {
  const jobs = await getJobs();
  const next = jobs.map((job) => job.id === jobId ? { ...job, enabled: !job.enabled } : job);
  await setJobs(next);
  await render();
}

async function renderJobs() {
  const jobs = await getJobs();
  jobList.innerHTML = '';
  if (!jobs.length) {
    jobList.innerHTML = '<div class="empty">아직 등록된 작업이 없습니다.</div>';
    return;
  }
  for (const job of jobs) {
    const item = document.createElement('article');
    item.className = 'job';
    item.innerHTML = `
      <div class="job-head">
        <strong>${escapeHtml(job.name)}</strong>
        <span>${job.enabled ? '켜짐' : '꺼짐'}</span>
      </div>
      <small>${escapeHtml(job.urlPattern)}</small>
      <small>${job.scheduleType === 'time' ? `매일 ${job.timeOfDay}` : `${job.intervalSeconds}초 간격`} · 액션 ${job.actions.length}개</small>
      <div class="job-actions">
        <button type="button" data-action="run">지금 실행</button>
        <button type="button" data-action="toggle">${job.enabled ? '끄기' : '켜기'}</button>
      </div>
    `;
    item.querySelector('[data-action="run"]').addEventListener('click', () => runNow(job.id));
    item.querySelector('[data-action="toggle"]').addEventListener('click', () => toggleJob(job.id));
    jobList.append(item);
  }
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

async function render() {
  await renderJobs();
  await renderLogs();
}

render();
