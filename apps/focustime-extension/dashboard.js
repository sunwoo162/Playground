'use strict';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const todayKey = () => new Date().toISOString().slice(0, 10);
const send = (msg) => new Promise((r) => chrome.runtime.sendMessage(msg, r));
const on = (s, type, handler) => {
  const el = $(s);
  if (el) el.addEventListener(type, handler);
};

let state = { usage: {}, limits: {}, blocks: [], settings: { tracking: true } };

async function load() {
  const data = await chrome.storage.local.get(['usage', 'limits', 'blocks', 'settings']);
  state.usage = data.usage || {};
  state.limits = data.limits || {};
  state.blocks = data.blocks || [];
  state.settings = Object.assign({ tracking: true, idleThreshold: 60 }, data.settings || {});
}

async function save(key) {
  await chrome.storage.local.set({ [key]: state[key] });
}

function fmt(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const parts = [];
  if (h) parts.push(h + '시간');
  if (h || m) parts.push(m + '분');
  parts.push(sec + '초');
  return parts.join(' ');
}
function fmtShort(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const parts = [];
  if (h) parts.push(h + '시간');
  if (h || m) parts.push(m + '분');
  parts.push(sec + '초');
  return parts.join(' ');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function matchesBlock(domain, block) {
  return domain === block || domain.endsWith('.' + block);
}

function domainStatus(domain, used) {
  if ((state.blocks || []).some((b) => matchesBlock(domain, b))) {
    return { label: '차단됨', className: 'blocked' };
  }
  const limit = state.limits[domain];
  if (limit != null && used >= limit) {
    return { label: '잠김', className: 'locked' };
  }
  if (limit != null) {
    return { label: '사용 가능', className: 'limited' };
  }
  return { label: '사용 가능', className: 'ok' };
}

/* ---------- 렌더 ---------- */
function render() {
  renderHero();
  renderWeek();
  renderToday();
  renderDonut();
  renderBlocks();
  renderLimits();
  $('#track-toggle').checked = !!state.settings.tracking;
  $('#track-label').textContent = state.settings.tracking ? '추적 중' : '일시정지';
}

function renderHero() {
  const today = state.usage[todayKey()] || {};
  const domains = Object.keys(today);
  const total = Object.values(today).reduce((a, b) => a + b, 0);
  $('#today-total').textContent = fmtShort(total);
  $('#today-count').textContent = domains.length;
  let limited = 0;
  for (const d of domains) {
    if (state.limits[d] != null && today[d] >= state.limits[d]) limited++;
  }
  $('#today-limited').textContent = limited;
}

let weekChart = null;
function renderWeek() {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d);
  }
  const labels = ['일', '월', '화', '수', '목', '금', '토'];
  const data = days.map((d, i) => {
    const key = d.toISOString().slice(0, 10);
    const t = state.usage[key] || {};
    const total = Object.values(t).reduce((a, b) => a + b, 0);
    return { x: labels[d.getDay()], y: Math.round(total / 60000), fillColor: i === 6 ? '#f0a93b' : '#5b8cff' };
  });
  const options = {
    chart: { type: 'bar', height: 170, background: 'transparent', toolbar: { show: false }, fontFamily: 'inherit', animations: { enabled: true } },
    theme: { mode: 'dark' },
    series: [{ name: '사용시간(분)', data }],
    colors: ['#5b8cff'],
    fill: { type: 'gradient', gradient: { shade: 'dark', type: 'vertical', shadeIntensity: 0.4, gradientToColors: ['#3b6fd6'], stops: [0, 100] } },
    plotOptions: { bar: { borderRadius: 6, columnWidth: '55%', distributed: false } },
    dataLabels: { enabled: false },
    grid: { borderColor: '#2a2f3a', strokeDashArray: 3, padding: { top: -10 } },
    xaxis: { axisBorder: { show: false }, axisTicks: { show: false }, labels: { style: { colors: '#8b93a5' } } },
    yaxis: { labels: { style: { colors: '#8b93a5' }, formatter: (v) => v + '분' } },
    tooltip: { theme: 'dark', y: { formatter: (v) => fmt((v || 0) * 60000) } },
    legend: { show: false },
  };
  if (weekChart) { weekChart.updateOptions(options, false, true); }
  else if (window.ApexCharts) { weekChart = new ApexCharts(document.querySelector('#week-chart'), options); weekChart.render(); }
}

let donutChart = null;
function renderDonut() {
  const today = state.usage[todayKey()] || {};
  const entries = Object.entries(today).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const rest = entries.length > 6 ? 0 : 0;
  const labels = entries.map((e) => e[0]);
  const series = entries.map((e) => Math.round(e[1] / 60000));
  const options = {
    chart: { type: 'donut', height: 220, background: 'transparent' },
    theme: { mode: 'dark' },
    series,
    labels,
    colors: ['#5b8cff', '#37d27a', '#f0a93b', '#ef5b5b', '#a06bff', '#2ec4b6'],
    stroke: { width: 0 },
    dataLabels: { enabled: true, formatter: (v) => Math.round(v) + '%', style: { colors: ['#fff'] } },
    legend: { position: 'right', fontSize: '12px', labels: { colors: '#8b93a5' } },
    plotOptions: { pie: { donut: { size: '68%', labels: { show: true, total: { show: true, label: '오늘 총합', color: '#8b93a5', formatter: () => fmtShort(series.reduce((a, b) => a + b, 0) * 60000) } } } } },
    tooltip: { theme: 'dark', y: { formatter: (v) => fmt((v || 0) * 60000) } },
    noData: { text: '기록 없음', align: 'center', verticalAlign: 'middle', style: { color: '#8b93a5' } },
    responsive: [{ breakpoint: 640, options: { legend: { position: 'bottom' } } }],
  };
  if (donutChart) { donutChart.updateOptions(options, false, true); }
  else if (window.ApexCharts) { donutChart = new ApexCharts(document.querySelector('#today-donut'), options); donutChart.render(); }
}


function renderToday() {
  const today = state.usage[todayKey()] || {};
  const entries = Object.entries(today).sort((a, b) => b[1] - a[1]);
  const list = $('#today-list');
  list.innerHTML = '';
  $('#today-empty').hidden = entries.length > 0;
  const max = Math.max(1, ...entries.map((e) => e[1]));
  for (const [domain, ms] of entries) {
    const row = $('#domain-row-tpl').content.firstElementChild.cloneNode(true);
    row.dataset.domain = domain;
    const limit = state.limits[domain];
    const over = limit != null && ms >= limit;
    const blocked = (state.blocks || []).some((b) => matchesBlock(domain, b));
    const status = domainStatus(domain, ms);
    row.querySelector('.dname').textContent = domain;
    const fill = row.querySelector('.dfill');
    fill.style.width = Math.min(100, (ms / (limit || max)) * 100) + '%';
    fill.classList.toggle('over', over);
    row.querySelector('.dtime').textContent = fmt(ms);
    const statusEl = row.querySelector('.dstatus');
    statusEl.textContent = status.label;
    statusEl.className = 'dstatus ' + status.className;
    const blockBtn = row.querySelector('.block-btn');
    const locked = over && !blocked;
    const restricted = blocked || locked;
    blockBtn.textContent = restricted ? '해제' : '차단';
    blockBtn.classList.toggle('danger', restricted);
    blockBtn.addEventListener('click', () => {
      if (blocked) return removeBlock(domain);
      if (locked) return removeLimit(domain);
      return addBlock(domain);
    });
    list.appendChild(row);
  }
}

function renderBlocks() {
  const list = $('#block-list');
  list.innerHTML = '';
  if (!state.blocks.length) {
    list.innerHTML = '<div class="empty" style="padding:10px">차단된 사이트 없음</div>';
    return;
  }
  for (const b of state.blocks) {
    const row = $('#block-row-tpl').content.firstElementChild.cloneNode(true);
    row.querySelector('.bname').textContent = b;
    row.querySelector('.btag').textContent = '차단';
    row.querySelector('.btag').classList.add('blk');
    const delBtn = row.querySelector('.del');
    if (delBtn) delBtn.addEventListener('click', () => removeBlock(b));
    list.appendChild(row);
  }
}

function renderLimits() {
  const list = $('#limit-list');
  list.innerHTML = '';
  const entries = Object.entries(state.limits);
  if (!entries.length) {
    list.innerHTML = '<div class="empty" style="padding:10px">설정된 한도 없음</div>';
    return;
  }
  for (const [domain, ms] of entries) {
    const row = $('#block-row-tpl').content.firstElementChild.cloneNode(true);
    row.querySelector('.bname').textContent = domain;
    row.querySelector('.btag').textContent = '하루 ' + Math.round(ms / 60000) + '분';
    row.querySelector('.btag').classList.add('lim');
    const delBtn = row.querySelector('.del');
    if (delBtn) delBtn.addEventListener('click', () => removeLimit(domain));
    list.appendChild(row);
  }
}

/* ---------- 액션 ---------- */
async function setLimit(domain, minutes) {
  domain = (domain || '').trim().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].toLowerCase();
  const m = parseInt(minutes, 10);
  if (!domain) return;
  if (!m || m <= 0) {
    delete state.limits[domain];
  } else {
    state.limits[domain] = m * 60000;
  }
  await save('limits');
  render();
}

async function removeLimit(domain) {
  delete state.limits[domain];
  await send({ type: 'unblockDomainAndOpenOriginals', domain, reason: 'limit' });
  await load();
  render();
}

async function addBlock(domain) {
  domain = (domain || '').trim().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].toLowerCase();
  if (!domain) return;
  if (!state.blocks.includes(domain)) {
    state.blocks.push(domain);
    await save('blocks');
  }
  render();
}

async function removeBlock(domain) {
  state.blocks = state.blocks.filter((b) => !matchesBlock(domain, b) && !matchesBlock(b, domain));
  await send({ type: 'unblockDomainAndOpenOriginals', domain, reason: 'block' });
  await load();
  render();
}

/* ---------- 이벤트 ---------- */
on('#track-toggle', 'change', async (e) => {
  await send({ type: 'setTracking', value: e.target.checked });
  state.settings.tracking = e.target.checked;
  $('#track-label').textContent = e.target.checked ? '추적 중' : '일시정지';
});

on('#block-add', 'click', () => addBlock($('#block-input').value));
on('#block-input', 'keydown', (e) => { if (e.key === 'Enter') addBlock($('#block-input').value); });

on('#limit-add', 'click', () => {
  const d = $('#limit-domain').value;
  const m = $('#limit-min').value;
  if (d && m) setLimit(d, m);
});

on('#reset-today', 'click', async () => {
  if (!confirm('오늘 사용 기록을 초기화할까요?')) return;
  await send({ type: 'resetToday' });
  await load();
  render();
});

on('#reset-all', 'click', async () => {
  if (!confirm('모든 사용 기록, 한도, 차단 목록을 초기화할까요?')) return;
  await send({ type: 'resetAll' });
  await load();
  render();
});

/* ---------- 푸터 ---------- */
on('#ft-export', 'click', async () => {
  const data = await chrome.storage.local.get(['usage', 'limits', 'blocks', 'settings']);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'focustime-backup-' + todayKey() + '.json';
  a.click();
  URL.revokeObjectURL(a.href);
});

on('#ft-import', 'click', () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json';
  input.addEventListener('change', async () => {
    const f = input.files[0];
    if (!f) return;
    try {
      const obj = JSON.parse(await f.text());
      const patch = {};
      if (obj.usage) patch.usage = obj.usage;
      if (obj.limits) patch.limits = obj.limits;
      if (obj.blocks) patch.blocks = obj.blocks;
      if (obj.settings) patch.settings = obj.settings;
      await chrome.storage.local.set(patch);
      await load();
      render();
      alert('가져오기 완료');
    } catch (e) {
      alert('가져오기 실패: ' + e.message);
    }
  });
  input.click();
});

on('#ft-shortcut', 'click', (e) => {
  e.preventDefault();
  alert('FocusTime 안내\n\n• 툴바 아이콘 클릭 → 대시보드\n• 차단/한도는 즉시 적용\n• 추적은 우상단 토글로 일시정지\n• 데이터는 이 브라우저에만 저장됩니다');
});

/* ---------- 앱 사용 시간 (트래커 연동) ---------- */
const TRACKER = 'http://localhost:7421';
let lastAppData = null;
let appLimits = {}; // name -> 분
let appBlocks = [];
const APP_DISPLAY_EXCLUDE = new Set([
  'ApplicationFrameHost',
  'TextInputHost',
  'ShellExperienceHost',
  'StartMenuExperienceHost',
  'SearchHost',
  'RuntimeBroker',
  'SystemSettings',
  'RtkUWP'
]);

async function trackerGet(path, timeoutMs = 2500) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(TRACKER + path, { signal: ctrl.signal });
    clearTimeout(to);
    return await res.json();
  } catch (e) { clearTimeout(to); throw e; }
}

async function fetchAppLimits() {
  try {
    const d = await trackerGet('/app-limits', 2500);
    appLimits = d.limits || {};
    appBlocks = d.blocks || [];
    if (lastAppData) renderAppUsage(lastAppData);
  }
  catch (_) {}
}

function appState(name, ms) {
  if (appBlocks.includes(name)) return { label: '차단됨', className: 'blocked', restricted: true };
  const limit = appLimits[name];
  if (limit != null && ms >= limit * 60000) return { label: '잠김', className: 'locked', restricted: true };
  if (limit != null) return { label: '사용 가능', className: 'limited', restricted: false };
  return { label: '사용 가능', className: 'ok', restricted: false };
}

async function fetchAppUsage() {
  const status = $('#app-status');
  try {
    const data = await trackerGet('/app-usage?days=7', 2500);
    lastAppData = data;
    renderAppUsage(data);
  } catch (_) {
    $('#app-total').textContent = '연결 없음';
    status.className = 'app-status err';
    status.innerHTML = '⚠ 트래커 미실행 — <a href="' + TRACKER + '/" target="_blank">트래커 상태</a> 확인. <code>FocusTimeTracker.exe</code> 를 실행하세요.';
    $('#app-limited-list').innerHTML = '';
    $('#app-list').innerHTML = '';
  }
}

function appIcon(name) {
  const img = document.createElement('img');
  img.className = 'app-ico';
  img.src = TRACKER + '/app-icon?name=' + encodeURIComponent(name);
  img.onerror = () => {
    const ph = document.createElement('div');
    ph.className = 'app-ico ph';
    ph.textContent = (name || '?').slice(0, 1).toUpperCase();
    img.replaceWith(ph);
  };
  return img;
}

function renderAppUsage(data) {
  const today = data.today || todayKey();
  const apps = (data.days || {})[today] || {};
  const entries = Object.entries(apps)
    .filter(([name]) => !APP_DISPLAY_EXCLUDE.has(name))
    .sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((a, [, v]) => a + v, 0);

  $('#app-total').textContent = fmtShort(total) + (data.tracking ? '' : ' (일시정지)');
  const status = $('#app-status');
  status.className = 'app-status';
  status.textContent = data.tracking
    ? '추적 중 · 현재: ' + (data.current || '-') + (data.title ? ' (' + data.title.slice(0, 50) + ')' : '')
    : '일시정지';

  // 한도 앱(사용자가 추가한 앱)
  const limList = $('#app-limited-list');
  limList.innerHTML = '';
  const limNames = Array.from(new Set([...Object.keys(appLimits), ...appBlocks]));
  if (!limNames.length) {
    limList.innerHTML = '<div class="empty" style="padding:10px">추가한 앱 없음 — ＋ 앱 추가 로 아이콘을 클릭하세요</div>';
  } else {
    for (const name of limNames) {
      const ms = apps[name] || 0;
      const limitMs = (appLimits[name] || 0) * 60000;
      const over = limitMs > 0 && ms >= limitMs;
      const state = appState(name, ms);
      const row = document.createElement('div');
      row.className = 'drow app-row';
      row.innerHTML =
        '<div class="dname">' + escapeHtml(name) + '</div>' +
        '<div class="dbar"><div class="dfill ' + (over ? 'over' : '') + '" style="width:' + (limitMs > 0 ? Math.min(100, (ms / limitMs) * 100) : 100) + '%"></div></div>' +
        '<div class="dtime">' + fmt(ms) + (limitMs > 0 ? ' / ' + appLimits[name] + 'm' : '') + '</div>' +
        '<div class="dstatus ' + state.className + '">' + state.label + '</div>' +
        '<div class="dctrl"><input class="lim-input has" type="number" min="0" value="' + (appLimits[name] || 30) + '" title="분"><button class="btn small toggle-app">' + (state.restricted ? '해제' : '차단') + '</button><button class="btn small del-app">삭제</button></div>';
      row.insertBefore(appIcon(name), row.firstChild);
    const limitInput = row.querySelector('.lim-input');
    const toggleBtn = row.querySelector('.toggle-app');
    const delBtn = row.querySelector('.del-app');
    if (limitInput) limitInput.addEventListener('change', (e) => setAppLimit(name, e.target.value));
    if (toggleBtn) toggleBtn.addEventListener('click', () => state.restricted ? unblockApp(name) : blockApp(name));
    if (delBtn) delBtn.addEventListener('click', () => removeAppLimit(name));
      limList.appendChild(row);
    }
  }

  // 전체 앱
  const list = $('#app-list');
  list.innerHTML = '';
  if (!entries.length) { list.innerHTML = '<div class="empty" style="padding:10px">앱 사용 기록 없음</div>'; return; }
  const max = Math.max(1, entries[0][1]);
  for (const [name, ms] of entries.slice(0, 15)) {
    const row = document.createElement('div');
    row.className = 'drow';
    row.style.gridTemplateColumns = '28px 1fr 1fr 80px 72px auto';
    const state = appState(name, ms);
    row.innerHTML =
      '<div class="dname">' + escapeHtml(name) + '</div>' +
      '<div class="dbar"><div class="dfill" style="width:' + Math.min(100, (ms / max) * 100) + '%"></div></div>' +
      '<div class="dtime">' + fmt(ms) + '</div>' +
      '<div class="dstatus ' + state.className + '">' + state.label + '</div>' +
      '<div class="dctrl"><button class="btn small toggle-app">' + (state.restricted ? '해제' : '차단') + '</button></div>';
    const ico = appIcon(name);
    ico.style.visibility = 'visible';
    row.insertBefore(ico, row.firstChild);
    const toggleBtn = row.querySelector('.toggle-app');
    if (toggleBtn) toggleBtn.addEventListener('click', () => state.restricted ? unblockApp(name) : blockApp(name));
    list.appendChild(row);
  }
}

/* ---------- 앱 추가 모달 ---------- */
let modalApps = [];
let modalTab = 'installed';

async function openAppModal() {
  const modal = $('#app-modal');
  const modalSearch = $('#modal-search');
  const appGrid = $('#app-grid');
  const appGridSearch = $('#app-grid-search');
  if (!modal || !modalSearch || !appGrid || !appGridSearch) return;

  modal.hidden = false;
  modalSearch.value = '';
  appGrid.innerHTML = '<div class="empty">설치된 앱 불러오는 중...</div>';
  appGridSearch.innerHTML = '';
  try {
    const d = await trackerGet('/apps', 20000);
    modalApps = d.apps || [];
  } catch (_) {
    appGrid.innerHTML = '<div class="empty">트래커 미실행. FocusTimeTracker.exe 를 실행하세요.</div>';
    return;
  }
  switchTab('installed');
  modalSearch.oninput = (e) => renderSearchGrid(e.target.value);
}

function switchTab(tab) {
  modalTab = tab;
  document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  const installedPane = $('#pane-installed');
  const searchPane = $('#pane-search');
  if (installedPane) installedPane.hidden = tab !== 'installed';
  if (searchPane) searchPane.hidden = tab !== 'search';
  if (tab === 'installed') renderInstalledGrid();
  else renderSearchGrid(($('#modal-search') || {}).value);
}

function makeTile(a) {
  const tile = document.createElement('div');
  tile.className = 'app-tile' + (appLimits[a.name] ? ' added' : '');
  if (a.hasIcon) {
    const img = document.createElement('img');
    img.src = TRACKER + '/app-icon?name=' + encodeURIComponent(a.name);
    img.onerror = () => { img.replaceWith(phTile(a.display || '?')); };
    tile.appendChild(img);
  } else {
    tile.appendChild(phTile(a.display || '?'));
  }
  const nm = document.createElement('div');
  nm.className = 'nm';
  nm.textContent = a.display || a.name;
  tile.appendChild(nm);
  if (a.running) {
    const r = document.createElement('div');
    r.className = 'run';
    r.textContent = '● 실행중';
    tile.appendChild(r);
  }
  if (!appLimits[a.name]) tile.addEventListener('click', () => addApp(a.name));
  return tile;
}

function renderInstalledGrid() {
  const grid = $('#app-grid');
  grid.innerHTML = '';
  const list = modalApps
    .filter((a) => a.hasIcon)
    .sort((a, b) => {
      if (!!a.running !== !!b.running) return a.running ? -1 : 1;
      return (a.display || '').localeCompare(b.display || '');
    });
  if (!list.length) { grid.innerHTML = '<div class="empty">설치된 앱 없음</div>'; return; }
  for (const a of list.slice(0, 300)) grid.appendChild(makeTile(a));
}

function renderSearchGrid(query) {
  const grid = $('#app-grid-search');
  grid.innerHTML = '';
  const f = (query || '').trim().toLowerCase();
  const list = modalApps.filter((a) => !f ||
    (a.display || '').toLowerCase().includes(f) ||
    (a.name || '').toLowerCase().includes(f));
  if (!list.length) { grid.innerHTML = '<div class="empty">검색 결과 없음</div>'; return; }
  for (const a of list.slice(0, 300)) grid.appendChild(makeTile(a));
}

function phTile(label) {
  const d = document.createElement('div');
  d.className = 'ph';
  d.textContent = (label || '?').slice(0, 1).toUpperCase();
  return d;
}

async function addApp(name) {
  await setAppLimit(name, 30); // 기본 30분
  $('#app-modal').hidden = true;
}

async function setAppLimit(name, minutes) {
  const m = parseInt(minutes, 10);
  try {
    await trackerGet('/set-app-limit?name=' + encodeURIComponent(name) + '&minutes=' + (m > 0 ? m : 0), 3000);
    if (m > 0) appLimits[name] = m; else delete appLimits[name];
    if (lastAppData) renderAppUsage(lastAppData); else fetchAppUsage();
  } catch (_) { alert('트래커 통신 실패'); }
}

async function removeAppLimit(name) { await setAppLimit(name, 0); }

async function setAppBlock(name, blocked) {
  try {
    await trackerGet('/set-app-block?name=' + encodeURIComponent(name) + '&blocked=' + (blocked ? '1' : '0'), 3000);
    appBlocks = blocked
      ? Array.from(new Set([...appBlocks, name]))
      : appBlocks.filter((n) => n !== name);
    if (lastAppData) renderAppUsage(lastAppData);
    fetchAppLimits();
  } catch (_) { alert('트래커 통신 실패'); }
}

async function blockApp(name) { await setAppBlock(name, true); }

async function unblockApp(name) {
  await setAppBlock(name, false);
  if (appLimits[name] != null && lastAppData) {
    const today = lastAppData.today || todayKey();
    const used = ((lastAppData.days || {})[today] || {})[name] || 0;
    if (used >= appLimits[name] * 60000) await setAppLimit(name, 0);
  }
}

on('#app-refresh', 'click', () => { fetchAppLimits(); fetchAppUsage(); });
on('#app-add', 'click', openAppModal);
on('#modal-close', 'click', () => { const modal = $('#app-modal'); if (modal) modal.hidden = true; });
on('#app-modal', 'click', (e) => { if (e.target.id === 'app-modal') e.target.hidden = true; });
document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.tab)));

/* ---------- 초기화 + 주기 새로고침 ---------- */
(async () => {
  await send({ type: 'flush' });
  await load();
  render();
  fetchAppLimits().then(fetchAppUsage);
  setInterval(async () => { await load(); render(); }, 3000);
  setInterval(() => { fetchAppLimits(); fetchAppUsage(); }, 3000);
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.usage || changes.limits || changes.blocks || changes.settings) {
      load().then(render);
    }
  });
})();
