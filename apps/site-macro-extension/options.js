const STORAGE_KEY = 'siteMacroJobs';
const MIN_INTERVAL_SECONDS = 5;

const jobEditorList = document.querySelector('#jobEditorList');
const addJobButton = document.querySelector('#addJob');
const jobTemplate = document.querySelector('#jobTemplate');
const actionTemplate = document.querySelector('#actionTemplate');

addJobButton.addEventListener('click', async () => {
  const jobs = await getJobs();
  jobs.unshift(createJob());
  await setJobs(jobs);
  render();
});

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
    urlPattern: String(job.urlPattern || '').trim(),
    startUrl: String(job.startUrl || '').trim(),
    openIfMissing: Boolean(job.openIfMissing),
    backgroundTab: Boolean(job.backgroundTab),
    scheduleType: job.scheduleType === 'time' ? 'time' : 'interval',
    intervalSeconds: Math.max(Number(job.intervalSeconds) || MIN_INTERVAL_SECONDS, MIN_INTERVAL_SECONDS),
    timeOfDay: /^\d{2}:\d{2}$/.test(job.timeOfDay || '') ? job.timeOfDay : '12:00',
    actions: Array.isArray(job.actions) ? job.actions.slice(0, 20).map(normalizeAction) : [],
  };
}

function normalizeAction(action) {
  const type = ['click', 'type', 'wait', 'scroll', 'reload'].includes(action.type) ? action.type : 'click';
  return {
    type,
    selector: String(action.selector || '').slice(0, 600),
    value: String(action.value || '').slice(0, 1000),
    ms: Math.min(Math.max(Number(action.ms) || 1000, 0), 30000),
    x: Number(action.x) || 0,
    y: Number(action.y) || 0,
  };
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
    await updateJob(job.id, { [field]: value });
    if (field === 'scheduleType') render();
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
    bindField(card, job, 'name');
    bindField(card, job, 'enabled');
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
    card.querySelector('[data-action="permission"]').addEventListener('click', () => requestPermission(job));
    card.querySelector('[data-action="duplicate"]').addEventListener('click', () => duplicateJob(job.id));
    card.querySelector('[data-action="delete"]').addEventListener('click', () => deleteJob(job.id));
    jobEditorList.append(card);
  }
}

render();
