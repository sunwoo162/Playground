'use strict';

const p = new URLSearchParams(location.search);
const domain = p.get('domain') || '이 사이트';
const reason = p.get('reason');
let origUrl = p.get('url');
const tabId = parseInt(p.get('tabId') || '0', 10) || null;
const limitMs = parseInt(p.get('limit') || '0', 10);
const icon = document.getElementById('icon');
const r = document.getElementById('reason');
const msg = document.getElementById('msg');
const heading = document.getElementById('heading');
const unblock = document.getElementById('unblock');
const back = document.getElementById('back');

document.getElementById('domain').textContent = domain;

function fmtHM(ms) {
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h && m) return h + '시간 ' + m + '분';
  if (h) return h + '시간';
  return m + '분';
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function matchesBlock(d, b) {
  return d === b || d.endsWith('.' + b);
}

function send(message) {
  return new Promise((resolve) => chrome.runtime.sendMessage(message, resolve));
}

async function removeCurrentRule() {
  if (reason === 'limit') {
    const { limits } = await chrome.storage.local.get('limits');
    const next = limits || {};
    for (const key of Object.keys(next)) {
      if (key === domain || matchesBlock(domain, key) || matchesBlock(key, domain)) {
        delete next[key];
      }
    }
    await chrome.storage.local.set({ limits: next });
    return;
  }

  const { blocks } = await chrome.storage.local.get('blocks');
  const next = (blocks || []).filter((b) => !matchesBlock(domain, b) && !matchesBlock(b, domain));
  await chrome.storage.local.set({ blocks: next });
}

send({ type: 'getBlockedOriginal', tabId }).then((res) => {
  if (res && res.blocked && res.blocked.url) origUrl = res.blocked.url;
});

if (reason === 'limit') {
  icon.textContent = '🔒';
  r.textContent = '잠김';
  r.style.color = 'var(--err)';
  const limitStr = limitMs ? fmtHM(limitMs) : '설정하신 시간';
  heading.textContent = domain + ' 접근이 차단되었습니다';
  msg.textContent = '오늘 할당 시간 ' + limitStr + '을 모두 사용하였습니다.';
  unblock.textContent = '🔓 잠금 해제';
  unblock.hidden = false;
  back.hidden = true;
} else {
  r.textContent = '접근 차단됨';
  msg.textContent = domain + ' 은(는) 차단 목록에 등록되어 있습니다.';
  unblock.textContent = '🔓 제한 삭제';
  unblock.hidden = false;
  back.hidden = false;
}

let returning = false;

async function openOriginalUrl() {
  if (returning) return;
  returning = true;
  unblock.disabled = true;

  try {
    await removeCurrentRule();
  } catch (_) {}

  try {
    const res = await send({ type: 'unblockAndOpenOriginal', tabId, domain, reason, url: origUrl });
    if (res && res.ok) return;
  } catch (_) {}

  if (origUrl) {
    try {
      if (tabId) {
        await chrome.tabs.update(tabId, { url: origUrl });
        return;
      }
      const currentTab = await chrome.tabs.getCurrent();
      if (currentTab && currentTab.id) {
        await chrome.tabs.update(currentTab.id, { url: origUrl });
        return;
      }
    } catch (_) {}
    location.href = origUrl;
  } else if (history.length > 1) {
    history.back();
  }
}

function returnToOriginalPage() {
  if (history.length > 1) history.back();
}

back.addEventListener('click', returnToOriginalPage);
unblock.addEventListener('click', async () => {
  const label = reason === 'limit' ? '잠금을 해제하고 다시 열까요?' : '제한을 삭제하고 다시 열까요?';
  if (!confirm(domain + ' ' + label)) return;
  await openOriginalUrl();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (reason === 'block' && changes.blocks) {
    const blocks = changes.blocks.newValue || [];
    if (!blocks.some((b) => matchesBlock(domain, b))) openOriginalUrl();
  } else if (reason === 'limit' && (changes.limits || changes.usage)) {
    (async () => {
      const { limits, usage } = await chrome.storage.local.get(['limits', 'usage']);
      const lim = (limits || {})[domain];
      const used = ((usage || {})[todayKey()] || {})[domain] || 0;
      if (lim == null || used < lim) openOriginalUrl();
    })();
  }
});
