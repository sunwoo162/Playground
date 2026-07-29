/* FocusTime background service worker
 * 활성 탭의 도메인별 체류 시간을 추적하고, 한도/차단 규칙을 강제 적용
 */
'use strict';

const todayKey = () => new Date().toISOString().slice(0, 10);

let current = { tabId: null, domain: null, since: 0 };

/* ---------- Supabase 연동 ---------- */
const SUPA_URL = 'https://ugczkmfjamlnpncivxcr.supabase.co';
const SUPA_KEY = 'sb_publishable_u7rJj7sDvjMbl_ELIOG1pg_D05zCAR7';

async function getDeviceId() {
  const { ft_device_id } = await chrome.storage.local.get('ft_device_id');
  if (ft_device_id) return ft_device_id;
  const id = crypto.randomUUID();
  await chrome.storage.local.set({ ft_device_id: id });
  await registerDevice(id);
  return id;
}

async function registerDevice(id) {
  try {
    await fetch(`${SUPA_URL}/rest/v1/rpc/ft_register_device`, {
      method: 'POST',
      headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_id: id, p_name: 'browser-' + id.slice(0, 8), p_kind: 'browser' }),
    });
  } catch (_) {}
}

function supaHeaders() {
  return { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json' };
}

// 사용시간 증분 동기화 (알람마다 호출)
async function syncUsage() {
  try {
    const id = await getDeviceId();
    const headers = supaHeaders();
    const { usage, ft_uploaded } = await chrome.storage.local.get(['usage', 'ft_uploaded']);
    const u = usage || {};
    const uploaded = ft_uploaded || {};
    const day = todayKey();
    const todayUsage = u[day] || {};
    const upToday = uploaded[day] || (uploaded[day] = {});
    for (const [item, ms] of Object.entries(todayUsage)) {
      const delta = ms - (upToday[item] || 0);
      if (delta >= 1000) {
        await fetch(`${SUPA_URL}/rest/v1/rpc/ft_add_usage`, {
          method: 'POST', headers,
          body: JSON.stringify({ p_device: id, p_day: day, p_item: item, p_kind: 'web', p_ms: delta }),
        });
        upToday[item] = ms;
      }
    }
    await chrome.storage.local.set({ ft_uploaded: uploaded });
  } catch (_) {}
}

// 한도 동기화 (전체 재동기화)
async function syncLimits() {
  try {
    const id = await getDeviceId();
    const headers = supaHeaders();
    const { limits } = await getStore('limits');
    const data = Object.entries(limits || {})
      .map(([item, ms]) => ({ item, minutes: Math.round(ms / 60000) }))
      .filter((d) => d.minutes > 0);
    await fetch(`${SUPA_URL}/rest/v1/rpc/ft_set_limits`, {
      method: 'POST', headers,
      body: JSON.stringify({ p_device: id, p_data: data }),
    });
  } catch (_) {}
}

// 차단 동기화 (전체 재동기화)
async function syncBlocks() {
  try {
    const id = await getDeviceId();
    const headers = supaHeaders();
    const { blocks } = await getStore('blocks');
    const items = blocks || [];
    await fetch(`${SUPA_URL}/rest/v1/rpc/ft_set_blocks`, {
      method: 'POST', headers,
      body: JSON.stringify({ p_device: id, p_items: items }),
    });
  } catch (_) {}
}

/* ---------- 스토리지 헬퍼 ---------- */
const getStore = (keys) => chrome.storage.local.get(keys);
const setStore = (obj) => chrome.storage.local.set(obj);

// 서비스 워커가 절전 후 재시작해도 추적 상태를 유지하기 위해 세션 스토리지에 보관
async function loadCurrent() {
  try {
    const { ft_current } = await chrome.storage.session.get('ft_current');
    if (ft_current && ft_current.domain) current = ft_current;
  } catch (_) {}
}
async function saveCurrent() {
  try { await chrome.storage.session.set({ ft_current: current }); } catch (_) {}
}
const ready = loadCurrent();
// 워커 재시작 시 저장된 상태를 복구하고 실제 활성 탭과 재동기화
ready.then(async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tab) setCurrent(tab.id);
  } catch (_) {}
});

async function getSettings() {
  const { settings } = await getStore('settings');
  return Object.assign({ tracking: true, idleThreshold: 300 }, settings || {});
}

/* ---------- 도메인 추출 ---------- */
function domainOf(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.hostname.replace(/^www\./, '');
  } catch (_) {
    return null;
  }
}

function matchesBlock(domain, block) {
  return domain === block || domain.endsWith('.' + block);
}

function isBlockPage(url) {
  return !!url && url.startsWith(chrome.runtime.getURL('block.html'));
}

/* ---------- 시간 누적 ---------- */
async function flush() {
  await ready;
  if (current.domain && current.since) {
    const settings = await getSettings();
    if (settings.tracking) {
      // 유휴 상태면 해당 구간을 세지 않는다
      const idle = await chrome.idle.queryState(settings.idleThreshold || 300);
      if (idle === 'active') {
        const now = Date.now();
        const elapsed = now - current.since;
        if (elapsed > 0 && elapsed < 3600000) {
          const day = todayKey();
          const { usage } = await getStore('usage');
          const u = usage || {};
          u[day] = u[day] || {};
          u[day][current.domain] = (u[day][current.domain] || 0) + elapsed;
          await setStore({ usage: u });
        }
      }
    }
  }
  current.since = Date.now();
  await saveCurrent();
  // 한도 초과 즉시 잠금 (이벤트/알람마다 검사)
  await enforceCurrentLimit();
}

// 현재 활성 도메인이 한도 초과면 즉시 잠금
async function enforceCurrentLimit() {
  if (!current.domain || !current.tabId) return;
  const { limits, usage } = await getStore(['limits', 'usage']);
  const limitMs = (limits || {})[current.domain];
  if (limitMs == null) return;
  const used = ((usage || {})[todayKey()] || {})[current.domain] || 0;
  if (used >= limitMs) {
    try {
      const tab = await chrome.tabs.get(current.tabId);
      if (tab && tab.url) redirect(current.tabId, current.domain, 'limit', tab.url, limitMs);
    } catch (_) {}
  }
}

async function setCurrent(tabId) {
  await ready;
  await flush();
  if (!tabId) {
    current = { tabId: null, domain: null, since: 0 };
    await saveCurrent();
    return;
  }
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab.active) {
      current = { tabId: null, domain: null, since: 0 };
    } else {
      current = { tabId, domain: domainOf(tab.url), since: Date.now() };
    }
  } catch (_) {
    current = { tabId: null, domain: null, since: 0 };
  }
  await saveCurrent();
}

/* ---------- 강제(차단/한도) ---------- */
async function enforce(tabId, url) {
  const domain = domainOf(url);
  if (!domain) return;
  const { blocks, limits, usage } = await getStore(['blocks', 'limits', 'usage']);
  const blockList = blocks || [];
  if (blockList.some((b) => matchesBlock(domain, b))) {
    return redirect(tabId, domain, 'block', url);
  }
  const limitMs = (limits || {})[domain];
  if (limitMs != null) {
    const used = ((usage || {})[todayKey()] || {})[domain] || 0;
    if (used >= limitMs) return redirect(tabId, domain, 'limit', url, limitMs);
  }
}

async function rememberBlockedUrl(tabId, domain, reason, url, limitMs) {
  if (!tabId || !url) return;
  try {
    const { ft_blocked_tabs } = await chrome.storage.session.get('ft_blocked_tabs');
    const blockedTabs = ft_blocked_tabs || {};
    blockedTabs[String(tabId)] = { domain, reason, url, limitMs: limitMs || 0, at: Date.now() };
    await chrome.storage.session.set({ ft_blocked_tabs: blockedTabs });
  } catch (_) {}
}

async function getBlockedUrl(tabId) {
  if (!tabId) return null;
  try {
    const { ft_blocked_tabs } = await chrome.storage.session.get('ft_blocked_tabs');
    return (ft_blocked_tabs || {})[String(tabId)] || null;
  } catch (_) {
    return null;
  }
}

async function clearBlockedUrl(tabId) {
  if (!tabId) return;
  try {
    const { ft_blocked_tabs } = await chrome.storage.session.get('ft_blocked_tabs');
    const blockedTabs = ft_blocked_tabs || {};
    delete blockedTabs[String(tabId)];
    await chrome.storage.session.set({ ft_blocked_tabs: blockedTabs });
  } catch (_) {}
}

async function unblockAndOpenOriginal(tabId, domain, reason, fallbackUrl) {
  const saved = await getBlockedUrl(tabId);
  const targetDomain = domain || (saved && saved.domain);
  const targetReason = reason || (saved && saved.reason);
  const targetUrl = (saved && saved.url) || fallbackUrl;

  if (targetReason === 'limit') {
    const { limits } = await getStore('limits');
    const next = limits || {};
    for (const key of Object.keys(next)) {
      if (!targetDomain || key === targetDomain || matchesBlock(targetDomain, key) || matchesBlock(key, targetDomain)) {
        delete next[key];
      }
    }
    await setStore({ limits: next });
  } else if (targetDomain) {
    const { blocks } = await getStore('blocks');
    const next = (blocks || []).filter((b) => !matchesBlock(targetDomain, b) && !matchesBlock(b, targetDomain));
    await setStore({ blocks: next });
  }

  if (targetUrl && tabId) {
    await clearBlockedUrl(tabId);
    await chrome.tabs.update(tabId, { url: targetUrl });
    return true;
  }
  return false;
}

async function unblockDomainAndOpenOriginals(domain, reason) {
  const targetDomain = domainOf(domain && domain.includes('://') ? domain : 'https://' + domain) || domain;
  if (!targetDomain) return { opened: 0 };

  if (reason === 'limit') {
    const { limits } = await getStore('limits');
    const next = limits || {};
    for (const key of Object.keys(next)) {
      if (key === targetDomain || matchesBlock(targetDomain, key) || matchesBlock(key, targetDomain)) {
        delete next[key];
      }
    }
    await setStore({ limits: next });
  } else {
    const { blocks } = await getStore('blocks');
    const next = (blocks || []).filter((b) => !matchesBlock(targetDomain, b) && !matchesBlock(b, targetDomain));
    await setStore({ blocks: next });
  }

  let opened = 0;
  try {
    const { ft_blocked_tabs } = await chrome.storage.session.get('ft_blocked_tabs');
    const blockedTabs = ft_blocked_tabs || {};
    for (const [tabId, saved] of Object.entries(blockedTabs)) {
      if (!saved || !saved.url || !matchesBlock(saved.domain, targetDomain)) continue;
      if (reason && saved.reason !== reason) continue;
      try {
        await chrome.tabs.update(parseInt(tabId, 10), { url: saved.url });
        delete blockedTabs[tabId];
        opened++;
      } catch (_) {}
    }
    await chrome.storage.session.set({ ft_blocked_tabs: blockedTabs });
  } catch (_) {}

  try {
    const blockPage = chrome.runtime.getURL('block.html');
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (!tab.url || !tab.url.startsWith(blockPage)) continue;
      const params = new URL(tab.url).searchParams;
      const savedDomain = params.get('domain');
      const savedReason = params.get('reason');
      const savedUrl = params.get('url');
      if (!savedDomain || !savedUrl || !matchesBlock(savedDomain, targetDomain)) continue;
      if (reason && savedReason !== reason) continue;
      await chrome.tabs.update(tab.id, { url: savedUrl });
      await clearBlockedUrl(tab.id);
      opened++;
    }
  } catch (_) {}

  return { opened };
}

async function resolveSenderTabId(sender, explicitTabId) {
  if (explicitTabId) return explicitTabId;
  if (sender.tab && sender.tab.id) return sender.tab.id;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab && tab.id;
  } catch (_) {
    return null;
  }
}

function redirect(tabId, domain, reason, url, limitMs) {
  rememberBlockedUrl(tabId, domain, reason, url, limitMs);
  const u =
    chrome.runtime.getURL('block.html') +
    '?domain=' + encodeURIComponent(domain) +
    '&reason=' + reason +
    '&tabId=' + encodeURIComponent(tabId) +
    (url ? '&url=' + encodeURIComponent(url) : '') +
    (limitMs ? '&limit=' + limitMs : '');
  chrome.tabs.update(tabId, { url: u }).catch(() => {});
}

/* ---------- 이벤트 리스너 ---------- */
chrome.tabs.onActivated.addListener((info) => {
  setCurrent(info.tabId);
  // 전환한 탭이 이미 한도 초과/차단이면 즉시 적용
  chrome.tabs.get(info.tabId, (tab) => {
    if (tab && tab.url) enforce(tab.id, tab.url);
  });
});

chrome.windows.onFocusChanged.addListener((winId) => {
  if (winId === chrome.windows.WINDOW_ID_NONE) {
    setCurrent(null);
  } else {
    chrome.tabs.query({ active: true, windowId: winId }, (tabs) => {
      if (tabs[0]) setCurrent(tabs[0].id);
    });
  }
});

chrome.tabs.onUpdated.addListener((tabId, change, tab) => {
  if (change.url && tab.active) setCurrent(tabId);
  if (change.status === 'complete') {
    enforce(tabId, tab.url);
  }
});

// 차단/한도 변경 즉시 모든 열린 탭에 적용 + Supabase 동기화
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.blocks || changes.limits) {
    applyToAllTabs();
    if (changes.blocks) syncBlocks();
    if (changes.limits) syncLimits();
  }
});

async function applyToAllTabs() {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (!tab.url) continue;
    if (isBlockPage(tab.url)) {
      await restoreBlockPageIfAllowed(tab);
    } else {
      await enforce(tab.id, tab.url);
    }
  }
}

async function restoreBlockPageIfAllowed(tab) {
  let params;
  try {
    params = new URL(tab.url).searchParams;
  } catch (_) {
    return;
  }

  const domain = params.get('domain');
  const reason = params.get('reason');
  const originalUrl = params.get('url');
  if (!domain || !originalUrl) return;

  const { blocks, limits, usage } = await getStore(['blocks', 'limits', 'usage']);
  const stillBlocked = (blocks || []).some((b) => matchesBlock(domain, b));
  const limitEntry = Object.entries(limits || {}).find(([key]) =>
    key === domain || matchesBlock(domain, key) || matchesBlock(key, domain)
  );
  const limitMs = limitEntry && limitEntry[1];
  const todayUsage = (usage || {})[todayKey()] || {};
  const usageEntry = Object.entries(todayUsage).find(([key]) =>
    key === domain || matchesBlock(domain, key) || matchesBlock(key, domain)
  );
  const used = usageEntry ? usageEntry[1] : 0;
  const stillLimited = limitMs != null && used >= limitMs;

  if ((reason === 'block' && !stillBlocked) || (reason === 'limit' && !stillLimited)) {
    await clearBlockedUrl(tab.id);
    await chrome.tabs.update(tab.id, { url: originalUrl }).catch(() => {});
  }
}

chrome.tabs.onRemoved.addListener((tabId) => {
  clearBlockedUrl(tabId);
  if (tabId === current.tabId) setCurrent(null);
});

async function tickUsage() {
  await flush();
  // 활성 탭에 대해 한도/차단 재점검
  if (current.tabId) {
    try {
      const tab = await chrome.tabs.get(current.tabId);
      if (tab && tab.url) await enforce(tab.id, tab.url);
    } catch (_) {}
  }
}

/* ---------- 주기 플러시 + 활성 탭 한도 체크 ---------- */
// 서비스 워커가 살아있는 동안에는 3초마다 반영한다.
setInterval(() => {
  tickUsage().catch(() => {});
}, 3000);

// 주의: 매 SW 시작마다 create 하면 알람이 리셋되어 안 울린다. 없을 때만 생성.
chrome.alarms.get('focustime-tick', (a) => {
  if (!a) chrome.alarms.create('focustime-tick', { periodInMinutes: 1 });
});
chrome.alarms.onAlarm.addListener(async (a) => {
  if (a.name !== 'focustime-tick') return;
  await tickUsage();
  syncUsage(); // Supabase로 사용시간 증분 업로드 (fire-and-forget)
});

/* ---------- 메시지 (popup/dashboard) ---------- */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      switch (msg.type) {
        case 'flush': await flush(); sendResponse({ ok: true }); break;
        case 'setTracking':
          await setStore({ settings: await getSettings().then((s) => ({ ...s, tracking: !!msg.value })) });
          sendResponse({ ok: true });
          break;
        case 'resetToday': {
          await flush();
          const { usage } = await getStore('usage');
          const u = usage || {};
          delete u[todayKey()];
          await setStore({ usage: u });
          sendResponse({ ok: true });
          break;
        }
        case 'resetAll':
          await setStore({ usage: {}, limits: {}, blocks: [] });
          sendResponse({ ok: true });
          break;
        case 'getBlockedOriginal': {
          const tabId = await resolveSenderTabId(sender, msg.tabId);
          sendResponse({ ok: true, blocked: await getBlockedUrl(tabId) });
          break;
        }
        case 'unblockAndOpenOriginal': {
          const tabId = await resolveSenderTabId(sender, msg.tabId);
          const opened = await unblockAndOpenOriginal(tabId, msg.domain, msg.reason, msg.url);
          sendResponse({ ok: opened });
          break;
        }
        case 'unblockDomainAndOpenOriginals': {
          const result = await unblockDomainAndOpenOriginals(msg.domain, msg.reason);
          sendResponse({ ok: true, ...result });
          break;
        }
        default:
          sendResponse({ error: 'unknown' });
      }
    } catch (e) {
      sendResponse({ error: e.message });
    }
  })();
  return true;
});

/* ---------- 설치 시 기본값 ---------- */
chrome.runtime.onInstalled.addListener(async () => {
  const data = await getStore(['usage', 'limits', 'blocks', 'settings']);
  const patch = {};
  if (!data.usage) patch.usage = {};
  if (!data.limits) patch.limits = {};
  if (!data.blocks) patch.blocks = [];
  const settings = Object.assign({ tracking: true, idleThreshold: 300 }, data.settings || {});
  // 기존 60초 기준 마이그레이션
  if (!data.settings || data.settings.idleThreshold === 60 || data.settings.idleThreshold == null) {
    settings.idleThreshold = 300;
    patch.settings = settings;
  }
  if (Object.keys(patch).length) await setStore(patch);
  // Supabase 기기 등록
  getDeviceId();
});
