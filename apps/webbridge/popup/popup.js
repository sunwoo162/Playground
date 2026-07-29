'use strict';

const $ = (sel) => document.querySelector(sel);
const list = $('#rule-list');
const tpl = $('#rule-item-tpl');
const status = $('#status');

function setStatus(msg, kind) {
  status.textContent = msg || '';
  status.className = 'status' + (kind ? ' ' + kind : '');
}

function send(msg) {
  return new Promise((resolve) => chrome.runtime.sendMessage(msg, resolve));
}

const triggerLabel = (t) => {
  if (!t) return '수동';
  switch (t.type) {
    case 'page-load': return '페이지 로드' + (t.urlPattern ? ' · ' + t.urlPattern : '');
    case 'interval': return (t.intervalMinutes || 5) + '분 간격';
    case 'shortcut': return '단축키 Alt+Shift+B';
    default: return '수동';
  }
};

async function render(filter = '') {
  const { rules } = await send({ type: 'getRules' });
  list.innerHTML = '';
  const filtered = rules.filter(
    (r) => !filter || (r.name || '').toLowerCase().includes(filter.toLowerCase())
  );
  if (!filtered.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = rules.length
      ? '검색 결과 없음'
      : '규칙이 없습니다. ＋ 버튼 또는 관리에서 추가하세요.';
    list.appendChild(li);
    return;
  }
  for (const r of filtered) {
    const node = tpl.content.firstElementChild.cloneNode(true);
    node.dataset.id = r.id;
    node.classList.toggle('disabled', !r.enabled);
    node.querySelector('.name').textContent = r.name || '(이름 없음)';
    node.querySelector('.meta').textContent =
      `${(r.steps || []).length}단계 · ${triggerLabel(r.trigger)}`;
    node.querySelector('.toggle').checked = !!r.enabled;
    list.appendChild(node);
  }
}

list.addEventListener('click', async (e) => {
  const li = e.target.closest('.rule');
  if (!li) return;
  const id = li.dataset.id;
  if (e.target.closest('.run')) {
    setStatus('실행 중...');
    const res = await send({ type: 'runRule', id });
    if (res && res.ok) {
      const last = res.context && res.context.data;
      setStatus('완료 · ' + (res.log || []).length + '단계' + (last ? '\n' + JSON.stringify(last).slice(0, 200) : ''), 'ok');
    } else {
      setStatus('실패: ' + (res && res.error), 'err');
    }
  } else if (e.target.closest('.edit')) {
    chrome.tabs.create({ url: chrome.runtime.getURL('options/options.html') + '#edit=' + id });
    window.close();
  } else if (e.target.closest('.del')) {
    if (confirm('이 규칙을 삭제할까요?')) {
      await send({ type: 'deleteRule', id });
      render($('#search').value);
    }
  }
});

list.addEventListener('change', async (e) => {
  if (!e.target.classList.contains('toggle')) return;
  const li = e.target.closest('.rule');
  const id = li.dataset.id;
  const { rule } = await send({ type: 'getRule', id });
  if (rule) {
    rule.enabled = e.target.checked;
    await send({ type: 'saveRule', rule });
    render($('#search').value);
  }
});

$('#search').addEventListener('input', (e) => render(e.target.value));

$('#new-rule').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('options/options.html') + '#new' });
  window.close();
});

$('#open-options').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('options/options.html') });
  window.close();
});

/* ---------- 토큰 스캔 ---------- */
const tokenPanel = $('#token-panel');
const tpBody = $('#tp-body');

$('#btn-scan').addEventListener('click', async () => {
  setStatus('토큰 스캔 중...');
  const res = await send({ type: 'scanTokens' });
  if (res && res.error) { setStatus('스캔 실패: ' + res.error, 'err'); return; }
  renderTokens(res.data || {});
  setStatus('스캔 완료', 'ok');
});

$('#tp-close').addEventListener('click', () => { tokenPanel.hidden = true; });

tpBody.addEventListener('click', async (e) => {
  const row = e.target.closest('.tp-row');
  if (!row) return;
  const val = row.dataset.val || '';
  const key = row.dataset.key || 'token';
  try {
    await navigator.clipboard.writeText(val);
    tpBody.querySelectorAll('.tp-row.selected').forEach((el) => el.classList.remove('selected'));
    row.classList.add('selected');
    row.querySelector('.tp-action').textContent = '복사됨';
    setStatus(`${key} 값 복사됨`, 'ok');
    setTimeout(() => {
      const action = row.querySelector('.tp-action');
      if (action) action.textContent = '클릭해서 값 가져오기';
    }, 900);
  } catch (_) {
    setStatus(`${key} 값 복사 실패`, 'err');
  }
});

function renderTokens(data) {
  tokenPanel.hidden = false;
  const sections = [
    ['페이지 기본 정보', data.page],
    ['메타 태그', data.meta],
    ['폼 입력값', data.forms],
    ['링크 주소', data.links],
    ['이미지 주소', data.images],
    ['localStorage', data.localStorage],
    ['sessionStorage', data.sessionStorage],
    ['쿠키', data.cookies],
    ['window 변수', data.variables],
    ['토큰 후보', data.tokens],
  ];
  let html = `<div class="tp-empty" hidden></div>`;
  let total = 0;
  html = '';
  for (const [title, obj] of sections) {
    const entries = Object.entries(obj || {});
    if (!entries.length) continue;
    total += entries.length;
    html += `<div class="tp-section"><h4>${title}</h4>`;
    for (const [k, v] of entries) {
      const item = normalizeTokenItem(v);
      html += `<button class="tp-row" data-key="${escapeAttr(k)}" data-val="${escapeAttr(item.value)}" title="${escapeAttr(k)} 값 복사">
        <span class="tp-key">${escapeHtml(k)}</span>
        <span class="tp-val">${escapeHtml(item.preview)}</span>
        <span class="tp-action">클릭해서 값 가져오기</span>
      </button>`;
    }
    html += '</div>';
  }
  if (!total) html = '<div class="tp-empty">가져올 수 있는 값 없음</div>';
  tpBody.innerHTML = html;
}

function normalizeTokenItem(v) {
  if (v && typeof v === 'object' && 'value' in v) {
    return { value: String(v.value || ''), preview: String(v.preview || v.value || '') };
  }
  const value = v == null ? '' : typeof v === 'string' ? v : JSON.stringify(v);
  return { value, preview: value };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function escapeAttr(s) {
  return escapeHtml(s).replace(/`/g, '&#96;');
}

/* ---------- 매크로 녹화 ---------- */
const btnRecord = $('#btn-record');

async function refreshRecordState() {
  const res = await send({ type: 'recordStatus' });
  if (res && res.recording) {
    btnRecord.classList.add('recording');
    btnRecord.textContent = '■ 중지';
  } else {
    btnRecord.classList.remove('recording');
    btnRecord.textContent = '● 녹화';
  }
}

btnRecord.addEventListener('click', async () => {
  const res = await send({ type: 'recordStatus' });
  if (res && res.recording) {
    setStatus('녹화 중지 중...');
    await send({ type: 'recordStop' });
    window.close();
  } else {
    const r = await send({ type: 'recordStart' });
    if (r && r.ok) {
      setStatus('녹화 시작 — 페이지 조작 후 다시 열어 중지', 'ok');
      setTimeout(() => window.close(), 600);
    } else {
      setStatus('녹화 시작 실패: ' + (r && r.error), 'err');
    }
  }
});

(async () => {
  const tab = await new Promise((r) =>
    chrome.tabs.query({ active: true, lastFocusedWindow: true }, (t) => r(t[0]))
  );
  if (tab) $('#current-url').textContent = tab.url || '';
  render();
  refreshRecordState();
})();
