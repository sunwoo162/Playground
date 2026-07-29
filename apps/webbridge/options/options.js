'use strict';

const $ = (s, r = document) => r.querySelector(s);
const send = (msg) => new Promise((r) => chrome.runtime.sendMessage(msg, r));

const TRIGGER_EXTRA = {
  manual: '',
  'page-load': `
    <label>URL 패턴 (glob, 예: *://*.example.com/*)</label>
    <input id="t-url" placeholder="*://*.example.com/*" />`,
  interval: `
    <label>간격(분)</label>
    <input id="t-min" type="number" min="1" value="5" />
    <label>URL 패턴 (선택, 빈칸시 활성 탭 사용)</label>
    <input id="t-url" placeholder="" />`,
  shortcut: `
    <label>URL 패턴 (선택)</label>
    <input id="t-url" placeholder="*://*.example.com/*" />
    <p style="font-size:11px;color:var(--muted)">Alt+Shift+B 로 실행됩니다.</p>`,
};

const STEP_TEMPLATES = {
  extract: { type: 'extract', fields: { title: 'h1', price: '.price' } },
  transform: { type: 'transform', script: 'return { ...data, title: (data.title||"").toUpperCase() };' },
  store: { type: 'store', key: 'lastResult' },
  'read-store': { type: 'read-store', key: 'lastResult' },
  http: {
    type: 'http',
    url: 'https://hooks.example.com/xxx',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{{JSON.stringify(data)}}',
  },
  'open-tab': { type: 'open-tab', url: 'https://other-site.com/?q={{data.title}}', active: false },
  copy: { type: 'copy', value: '{{data.title}}' },
  notify: { type: 'notify', title: 'WebBridge', message: '완료: {{data.title}}' },
  token: { type: 'token', source: 'localStorage', key: 'accessToken', name: 'accessToken' },
  'watch-token': {
    type: 'watch-token',
    source: 'localStorage',
    key: 'accessToken',
    name: 'accessToken',
    cacheKey: 'token:localStorage:accessToken',
    intervalSeconds: 5,
  },
  'token-cache': {
    type: 'token-cache',
    source: 'localStorage',
    key: 'accessToken',
    name: 'accessToken',
    cacheKey: 'token:localStorage:accessToken',
    sourceUrlPattern: '*://*.example.com/*',
    maxAgeSeconds: 5,
  },
  automate: {
    type: 'automate',
    tab: 'current',
    steps: [
      { type: 'wait', selector: '#search' },
      { type: 'input', selector: '#search', value: '{{data.title}}' },
      { type: 'click', selector: 'button[type=submit]' },
      { type: 'wait', ms: 1500 },
      { type: 'extract', fields: { result: '.result' } },
    ],
  },
  wait: { type: 'wait', selector: '#content', timeout: 10000 },
  if: {
    type: 'if',
    condition: 'data.price > 1000',
    then: [{ type: 'notify', title: '비쌈', message: '{{data.price}}' }],
    else: [{ type: 'log', value: '저렴함' }],
  },
  loop: {
    type: 'loop',
    over: 'data.items || []',
    as: 'item',
    steps: [{ type: 'log', value: '{{item}}' }],
  },
  log: { type: 'log', value: '{{JSON.stringify(data)}}' },
};

const QUICK_TEMPLATES = {
  'extract-send': {
    name: '현재 페이지 내용을 웹훅으로 보내기',
    description: '현재 페이지의 제목과 URL을 읽어 Slack, Discord, Make, n8n 같은 웹훅으로 보냅니다.',
    enabled: true,
    trigger: { type: 'manual' },
    steps: [
      { type: 'extract', fields: { title: 'h1', url: { selector: 'link[rel=canonical]', attr: 'href' } } },
      {
        type: 'http',
        url: 'https://hooks.slack.com/services/XXX',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{"text":"{{data.title}} - {{data.url}}"}',
      },
      { type: 'notify', title: 'WebBridge', message: '전송 완료' },
    ],
  },
  'form-auto': {
    name: '현재 페이지 값으로 다른 사이트 폼 채우기',
    description: '현재 페이지에서 이름/이메일 같은 값을 읽고 대상 사이트의 입력 폼을 자동으로 채웁니다.',
    enabled: true,
    trigger: { type: 'manual' },
    steps: [
      { type: 'extract', fields: { name: 'h1', email: '.email' } },
      {
        type: 'automate',
        tab: 'new',
        url: 'https://target-site.com/form',
        steps: [
          { type: 'wait', selector: '#name' },
          { type: 'input', selector: '#name', value: '{{data.name}}' },
          { type: 'input', selector: '#email', value: '{{data.email}}' },
          { type: 'click', selector: '#submit' },
        ],
      },
    ],
  },
  'scrape-store': {
    name: '목록을 긁어서 저장하고 알림 받기',
    description: '상품, 게시글, 주문 같은 목록을 긁어 확장 저장소에 저장하고 몇 건인지 알림을 띄웁니다.',
    enabled: true,
    trigger: { type: 'page-load', urlPattern: '*://*.example.com/list*' },
    steps: [
      { type: 'extract', fields: { items: { selector: '.item-title', multiple: true } } },
      { type: 'transform', script: 'return { count: data.items ? data.items.length : 0, items: data.items };' },
      { type: 'store', key: 'lastScrape' },
      { type: 'notify', title: '스크랩 완료', message: '{{data.count}}건 저장됨' },
    ],
  },
};

let currentRules = [];
let currentId = null;

/* ---------- 목록 ---------- */
async function loadRules() {
  const { rules } = await send({ type: 'getRules' });
  currentRules = rules || [];
  renderList();
}

function renderList() {
  const ul = $('#rule-list');
  ul.innerHTML = '';
  if (!currentRules.length) {
    ul.innerHTML = '<li style="color:var(--muted);text-align:center;padding:20px">규칙 없음</li>';
    return;
  }
  for (const r of currentRules) {
    const li = document.createElement('li');
    li.dataset.id = r.id;
    li.classList.toggle('active', r.id === currentId);
    li.classList.toggle('off', !r.enabled);
    const label =
      r.trigger && r.trigger.type === 'page-load' ? '페이지 로드'
      : r.trigger && r.trigger.type === 'interval' ? (r.trigger.intervalMinutes || 5) + '분'
      : r.trigger && r.trigger.type === 'shortcut' ? '단축키'
      : '수동';
    li.innerHTML = `<span class="n"><span class="dot"></span>${escapeHtml(r.name || '(이름 없음)')}</span>
      <span class="m">${(r.steps || []).length}단계 · ${label}</span>`;
    li.addEventListener('click', () => selectRule(r.id));
    ul.appendChild(li);
  }
}

/* ---------- 선택/편집 ---------- */
async function selectRule(id) {
  const r = currentRules.find((x) => x.id === id);
  if (!r) return;
  currentId = id;
  renderList();
  $('#empty-state').hidden = true;
  $('#rule-form').hidden = false;
  $('#f-name').value = r.name || '';
  $('#f-desc').value = r.description || '';
  $('#f-enabled').checked = !!r.enabled;
  const tt = (r.trigger && r.trigger.type) || 'manual';
  $('#f-trigger').value = tt;
  renderTriggerExtra(tt, r.trigger || {});
  $('#f-steps').value = JSON.stringify(r.steps || [], null, 2);
  $('#steps-error').textContent = '';
  $('#run-result').textContent = '';
  location.hash = 'edit=' + id;
}

function renderTriggerExtra(type, trigger) {
  const box = $('#trigger-extra');
  box.innerHTML = TRIGGER_EXTRA[type] || '';
  if (type === 'page-load' || type === 'shortcut' || type === 'interval') {
    const urlEl = $('#t-url');
    if (urlEl) urlEl.value = trigger.urlPattern || '';
  }
  if (type === 'interval') {
    const m = $('#t-min');
    if (m) m.value = trigger.intervalMinutes || 5;
  }
}

$('#f-trigger').addEventListener('change', (e) => renderTriggerExtra(e.target.value, {}));

/* ---------- 수집 ---------- */
function gatherRule() {
  const stepsText = $('#f-steps').value.trim();
  let steps;
  try {
    steps = JSON.parse(stepsText || '[]');
    if (!Array.isArray(steps)) throw new Error('단계는 배열이어야 합니다.');
  } catch (e) {
    $('#steps-error').textContent = 'JSON 오류: ' + e.message;
    return null;
  }
  $('#steps-error').textContent = '';
  const trigger = { type: $('#f-trigger').value };
  if (trigger.type === 'page-load' || trigger.type === 'shortcut') {
    trigger.urlPattern = $('#t-url') ? $('#t-url').value.trim() : '';
  }
  if (trigger.type === 'interval') {
    trigger.intervalMinutes = parseInt($('#t-min') ? $('#t-min').value : '5', 10) || 5;
    trigger.urlPattern = $('#t-url') ? $('#t-url').value.trim() : '';
  }
  const existing = currentRules.find((r) => r.id === currentId);
  return {
    id: currentId || undefined,
    name: $('#f-name').value.trim() || '(이름 없음)',
    description: $('#f-desc').value.trim(),
    enabled: $('#f-enabled').checked,
    trigger,
    steps,
    _created: existing ? existing._created : Date.now(),
  };
}

/* ---------- 버튼 ---------- */
$('#btn-save').addEventListener('click', async () => {
  const rule = gatherRule();
  if (!rule) return;
  const { rule: saved } = await send({ type: 'saveRule', rule });
  currentId = saved.id;
  await loadRules();
  selectRule(saved.id);
  flash('저장됨');
});

$('#btn-dup').addEventListener('click', async () => {
  const rule = gatherRule();
  if (!rule) return;
  rule.id = undefined;
  rule.name = rule.name + ' (복사)';
  const { rule: saved } = await send({ type: 'saveRule', rule });
  currentId = saved.id;
  await loadRules();
  selectRule(saved.id);
});

$('#btn-del').addEventListener('click', async () => {
  if (!currentId) return;
  if (!confirm('이 규칙을 삭제할까요?')) return;
  await send({ type: 'deleteRule', id: currentId });
  currentId = null;
  $('#rule-form').hidden = true;
  $('#empty-state').hidden = false;
  await loadRules();
});

$('#btn-test').addEventListener('click', async () => {
  const rule = gatherRule();
  if (!rule) return;
  // 미저장 상태라면 임시로 저장 후 실행
  const { rule: saved } = await send({ type: 'saveRule', rule });
  currentId = saved.id;
  $('#run-result').textContent = '실행 중...';
  const res = await send({ type: 'runRule', id: saved.id });
  $('#run-result').textContent = JSON.stringify(res, null, 2);
  await loadRules();
});

$('#step-template').addEventListener('change', (e) => {
  const key = e.target.value;
  if (!key) return;
  const tpl = STEP_TEMPLATES[key];
  let steps = [];
  try { steps = JSON.parse($('#f-steps').value || '[]'); } catch (_) { steps = []; }
  steps.push(JSON.parse(JSON.stringify(tpl)));
  $('#f-steps').value = JSON.stringify(steps, null, 2);
  e.target.value = '';
});

$('#new-rule').addEventListener('click', () => newRule());

function newRule(base) {
  currentId = null;
  $('#empty-state').hidden = true;
  $('#rule-form').hidden = false;
  $('#f-name').value = base ? base.name : '';
  $('#f-desc').value = base ? base.description : '';
  $('#f-enabled').checked = true;
  $('#f-trigger').value = base && base.trigger ? base.trigger.type : 'manual';
  renderTriggerExtra($('#f-trigger').value, (base && base.trigger) || {});
  $('#f-steps').value = JSON.stringify(base ? base.steps : [{ type: 'extract', fields: { title: 'h1' } }], null, 2);
  renderList();
}

/* ---------- 빈 상태 퀵 템플릿 ---------- */
document.querySelectorAll('.quick [data-template]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const tpl = QUICK_TEMPLATES[btn.dataset.template];
    if (tpl) newRule(JSON.parse(JSON.stringify(tpl)));
  });
});

$('#btn-data-link').addEventListener('click', () => {
  $('#data-link-builder').hidden = !$('#data-link-builder').hidden;
  $('#web-link-builder').hidden = true;
});

$('#dl-cancel').addEventListener('click', () => {
  $('#data-link-builder').hidden = true;
});

$('#dl-create').addEventListener('click', () => {
  const dataKey = safeDataName($('#dl-data-name').value.trim() || 'value');
  const sourcePattern = $('#dl-source-pattern').value.trim();
  const sourceSelector = $('#dl-source-selector').value.trim() || 'h1';
  const readMode = $('#dl-read-mode').value;
  const targetUrl = $('#dl-target-url').value.trim() || 'https://target.example.com/form';
  const targetSelector = $('#dl-target-selector').value.trim() || '#value';
  const submitSelector = $('#dl-submit-selector').value.trim();
  const field = { selector: sourceSelector };
  const automateSteps = [
    { type: 'wait', selector: targetSelector, timeout: 10000 },
    { type: 'input', selector: targetSelector, value: `{{data.${dataKey}}}` },
  ];

  if (readMode === 'value') field.prop = 'value';
  if (readMode === 'href') field.attr = 'href';
  if (readMode === 'src') field.attr = 'src';
  if (readMode === 'html') field.html = true;
  if (submitSelector) automateSteps.push({ type: 'click', selector: submitSelector });

  newRule({
    name: '웹 데이터를 다른 웹 입력칸에 채우기',
    description: '출발 웹에서 지정한 값을 읽고 대상 웹의 입력칸에 자동으로 채웁니다.',
    enabled: true,
    trigger: { type: 'manual', urlPattern: sourcePattern },
    steps: [
      { type: 'extract', fields: { [dataKey]: field } },
      {
        type: 'if',
        condition: `data.${dataKey} !== null && data.${dataKey} !== undefined && data.${dataKey} !== ''`,
        then: [
          { type: 'automate', tab: 'new', url: targetUrl, steps: automateSteps },
          { type: 'notify', title: 'WebBridge', message: '데이터 입력 완료' },
        ],
        else: [
          { type: 'notify', title: 'WebBridge', message: `${sourceSelector} 값을 찾지 못했습니다.` },
        ],
      },
    ],
  });
});

$('#btn-web-link').addEventListener('click', () => {
  $('#web-link-builder').hidden = !$('#web-link-builder').hidden;
  $('#data-link-builder').hidden = true;
});

$('#wl-cancel').addEventListener('click', () => {
  $('#web-link-builder').hidden = true;
});

$('#wl-create').addEventListener('click', () => {
  const tokenSource = $('#wl-token-source').value;
  const tokenKey = $('#wl-token-key').value.trim() || 'accessToken';
  const tokenName = safeDataName(tokenKey) || 'accessToken';
  const sourcePattern = $('#wl-source-pattern').value.trim();
  const targetUrl = $('#wl-target-url').value.trim() || 'https://target.example.com/form';
  const targetSelector = $('#wl-target-selector').value.trim() || '#access-token';
  const submitSelector = $('#wl-submit-selector').value.trim();
  const staleSeconds = Math.max(5, parseInt($('#wl-stale-seconds').value || '5', 10));
  const cacheKey = `token:${tokenSource}:${tokenKey}`;
  const automateSteps = [
    { type: 'wait', selector: targetSelector, timeout: 10000 },
    { type: 'input', selector: targetSelector, value: `{{data.${tokenName}}}` },
  ];

  if (submitSelector) {
    automateSteps.push({ type: 'click', selector: submitSelector });
  }

  newRule({
    name: '로그인 토큰을 다른 웹 입력칸에 채우기',
    description: '현재 탭에서 사용자가 지정한 토큰을 읽고 대상 웹의 입력칸에 자동으로 채웁니다.',
    enabled: true,
    trigger: { type: 'manual', urlPattern: sourcePattern },
    steps: [
      {
        type: 'watch-token',
        source: tokenSource,
        key: tokenKey,
        name: tokenName,
        cacheKey,
        intervalSeconds: staleSeconds,
      },
      {
        type: 'token-cache',
        source: tokenSource,
        key: tokenKey,
        name: tokenName,
        cacheKey,
        sourceUrlPattern: sourcePattern,
        maxAgeSeconds: staleSeconds,
      },
      {
        type: 'if',
        condition: `!!data.${tokenName} && data.${tokenName}_fresh`,
        then: [
          { type: 'automate', tab: 'new', url: targetUrl, steps: automateSteps },
          { type: 'notify', title: 'WebBridge', message: '토큰 입력 완료' },
        ],
        else: [
          { type: 'notify', title: 'WebBridge', message: `${tokenKey} 값을 찾지 못했습니다.` },
        ],
      },
    ],
  });
});

/* ---------- 유틸 ---------- */
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function flash(msg) {
  const old = $('#btn-save').textContent;
  $('#btn-save').textContent = msg;
  setTimeout(() => { $('#btn-save').textContent = old; }, 1200);
}

function safeDataName(key) {
  const name = String(key).split('.').pop().replace(/[^A-Za-z0-9_$]/g, '_');
  return /^[A-Za-z_$]/.test(name) ? name : 'token_' + name;
}

/* ---------- 초기 진입 ---------- */
(async () => {
  await loadRules();
  const hash = location.hash;

  // 매크로 녹화 결과 불러오기
  if (hash.startsWith('#macro')) {
    const got = await new Promise((r) => chrome.storage.local.get('pendingMacro', r));
    const pm = got.pendingMacro;
    if (pm && pm.steps && pm.steps.length) {
      chrome.storage.local.remove('pendingMacro');
      newRule({
        name: '매크로: ' + new Date().toLocaleString(),
        description: `${pm.eventCount}개 동작 녹화됨${pm.url ? ' · ' + pm.url : ''}`,
        enabled: false,
        trigger: { type: 'manual' },
        steps: pm.steps,
      });
      return;
    }
  }

  if (hash.startsWith('#new')) {
    newRule();
  } else if (hash.startsWith('#edit=')) {
    const id = hash.slice(6);
    if (currentRules.find((r) => r.id === id)) selectRule(id);
  }
})();
