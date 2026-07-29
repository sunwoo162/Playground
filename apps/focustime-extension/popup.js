'use strict';

const $ = (s) => document.querySelector(s);
const TRACKER = 'http://localhost:7421';
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

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function fmtShort(ms) {
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h && m) return h + '시간 ' + m + '분';
  if (h) return h + '시간';
  if (m) return m + '분';
  return Math.floor(ms / 1000) + '초';
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function trackerGet(path, timeoutMs = 2500) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(TRACKER + path, { signal: ctrl.signal });
    clearTimeout(to);
    if (!res.ok) throw new Error('tracker ' + res.status);
    return await res.json();
  } catch (e) {
    clearTimeout(to);
    throw e;
  }
}

function iconHtml(name) {
  return '<img class="tico" src="' + TRACKER + '/app-icon?name=' + encodeURIComponent(name) + '" alt="">';
}

async function refresh() {
  const ul = $('#top');
  try {
    const data = await trackerGet('/app-usage?days=7', 2500);
    const today = (data.days || {})[data.today || todayKey()] || {};
    const entries = Object.entries(today)
      .filter(([name]) => !APP_DISPLAY_EXCLUDE.has(name))
      .sort((a, b) => b[1] - a[1]);
    const total = entries.reduce((a, [, v]) => a + v, 0);
    const max = Math.max(1, ...entries.map((e) => e[1]));

    $('#total').textContent = fmtShort(total);
    $('#status').textContent = data.tracking
      ? '현재: ' + (data.current || '-')
      : '트래커 일시정지';
    $('#status').className = data.tracking ? 'status' : 'status off';
    $('#empty').hidden = entries.length > 0;
    ul.innerHTML = '';

    for (const [name, ms] of entries.slice(0, 6)) {
      const li = document.createElement('li');
      li.innerHTML =
        iconHtml(name) +
        '<span class="tname">' + escapeHtml(name) + '</span>' +
        '<span class="tbar"><span class="tfill" style="width:' + Math.min(100, (ms / max) * 100) + '%"></span></span>' +
        '<span class="ttime">' + fmtShort(ms) + '</span>';
      const img = li.querySelector('img');
      img.onerror = () => {
        const ph = document.createElement('span');
        ph.className = 'tico ph';
        ph.textContent = name.slice(0, 1).toUpperCase();
        img.replaceWith(ph);
      };
      ul.appendChild(li);
    }
  } catch (_) {
    $('#total').textContent = '-';
    $('#status').textContent = '트래커 미실행';
    $('#status').className = 'status err';
    $('#empty').hidden = false;
    $('#empty').innerHTML = '<button id="start-tracker" class="start">트래커 실행 필요</button>';
    ul.innerHTML = '';
  }
}

$('#dash').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
});

refresh();
setInterval(refresh, 3000);
