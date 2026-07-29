/* WebBridge background service worker
 * 규칙 저장, 트리거 관리, 단계(Step) 오케스트레이션 담당
 */
'use strict';

const STORAGE_KEY = 'webbridge_rules';
const STORE_PREFIX = 'store:';
const TOKEN_CACHE_PREFIX = 'token-cache:';
const recordingState = { tabId: null };

/* ============================================================
 * 규칙 저장소
 * ============================================================ */
async function getRules() {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  return data[STORAGE_KEY] || [];
}

async function getRule(id) {
  const rules = await getRules();
  return rules.find((r) => r.id === id) || null;
}

async function saveRule(rule) {
  if (!rule.id) rule.id = 'r_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const rules = await getRules();
  const idx = rules.findIndex((r) => r.id === rule.id);
  if (idx >= 0) rules[idx] = rule;
  else rules.push(rule);
  await chrome.storage.local.set({ [STORAGE_KEY]: rules });
  await rebuildTriggers();
  return rule;
}

async function deleteRule(id) {
  const rules = await getRules();
  const filtered = rules.filter((r) => r.id !== id);
  await chrome.storage.local.set({ [STORAGE_KEY]: filtered });
  await rebuildTriggers();
  return true;
}

/* ============================================================
 * 템플릿 해석  {{ ... }}
 * expr 은 data/vars/context 를 변수로 갖는 JS 표현식
 * ============================================================ */
function resolveTemplate(str, ctx) {
  if (typeof str !== 'string') return str;
  return str.replace(/\{\{([\s\S]+?)\}\}/g, (m, expr) => {
    try {
      // vars 의 키를 직접 변수로 노출해 {{item}}, {{index}} 등 사용 가능
      const varKeys = Object.keys(ctx.vars || {});
      const argNames = ['data', 'vars', 'context'].concat(varKeys);
      const argVals = [ctx.data, ctx.vars, ctx].concat(varKeys.map((k) => ctx.vars[k]));
      const fn = new Function(...argNames, `"use strict"; return (${expr.trim()});`);
      const val = fn(...argVals);
      if (val === undefined || val === null) return '';
      if (typeof val === 'object') return JSON.stringify(val);
      return String(val);
    } catch (e) {
      return '';
    }
  });
}

function resolveObject(obj, ctx) {
  if (typeof obj === 'string') return resolveTemplate(obj, ctx);
  if (Array.isArray(obj)) return obj.map((v) => resolveObject(v, ctx));
  if (obj && typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) out[k] = resolveObject(v, ctx);
    return out;
  }
  return obj;
}

/* ============================================================
 * URL 매칭 (glob: * -> .*)
 * ============================================================ */
function matchUrl(pattern, url) {
  if (!pattern) return true;
  const re = new RegExp(
    '^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$'
  );
  return re.test(url || '');
}

/* ============================================================
 * 트리거 관리 (alarms)
 * ============================================================ */
async function rebuildTriggers() {
  const rules = await getRules();
  const existing = await chrome.alarms.getAll();
  for (const a of existing) {
    if (a.name.startsWith('rule:')) await chrome.alarms.clear(a.name);
  }
  for (const rule of rules) {
    if (rule.enabled && rule.trigger && rule.trigger.type === 'interval') {
      const periodInMinutes = Math.max(1, rule.trigger.intervalMinutes || 5);
      chrome.alarms.create(`rule:${rule.id}`, { periodInMinutes });
    }
  }
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name.startsWith('rule:')) {
    const id = alarm.name.slice(5);
    await runRule(id, { source: 'interval' });
  }
});

/* ============================================================
 * 콘텐츠 스크립트 통신
 * ============================================================ */
async function sendToContent(tabId, message) {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (e) {
    // 콘텐츠 스크립트가 아직 주입되지 않은 경우 수동 주입
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
      return await chrome.tabs.sendMessage(tabId, message);
    } catch (e2) {
      return { error: e2.message };
    }
  }
}

function waitForTabLoad(tabId, timeout = 30000) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      chrome.tabs.onUpdated.removeListener(listener);
      clearTimeout(safety);
      setTimeout(resolve, 600); // 콘텐츠 스크립트 settle 대기
    };
    const listener = (id, change) => {
      if (id === tabId && change.status === 'complete') finish();
    };
    chrome.tabs.onUpdated.addListener(listener);
    const safety = setTimeout(finish, timeout);
  });
}

/* ============================================================
 * 단계(Step) 실행
 * ============================================================ */
async function executeStep(step, ctx) {
  switch (step.type) {
    case 'extract': return stepExtract(step, ctx);
    case 'transform': return stepTransform(step, ctx);
    case 'http': return stepHttp(step, ctx);
    case 'open-tab': return stepOpenTab(step, ctx);
    case 'automate': return stepAutomate(step, ctx);
    case 'notify': return stepNotify(step, ctx);
    case 'copy': return stepCopy(step, ctx);
    case 'token': return stepToken(step, ctx);
    case 'watch-token': return stepWatchToken(step, ctx);
    case 'token-cache': return stepTokenCache(step, ctx);
    case 'store': return stepStore(step, ctx);
    case 'read-store': return stepReadStore(step, ctx);
    case 'wait': return stepWait(step, ctx);
    case 'log': return stepLog(step, ctx);
    case 'if': return stepIf(step, ctx);
    case 'loop': return stepLoop(step, ctx);
    default: return { error: '알 수 없는 단계: ' + step.type };
  }
}

async function stepExtract(step, ctx) {
  const tabId = ctx.tabId;
  if (!tabId) return { error: 'extract 에 활성 탭이 없습니다.' };
  const fields = resolveObject(step.fields || {}, ctx);
  const res = await sendToContent(tabId, { type: 'extract', fields });
  if (res && res.error) return { error: res.error };
  return { data: res.data || {} };
}

async function stepTransform(step, ctx) {
  const fn = new Function('data', 'vars', 'context', `"use strict"; ${step.script}`);
  const result = await fn(ctx.data, ctx.vars, ctx);
  if (result && typeof result === 'object') return { data: result };
  if (result === undefined) return {};
  return { data: { result } };
}

async function stepHttp(step, ctx) {
  const url = resolveTemplate(step.url, ctx);
  const method = (step.method || 'GET').toUpperCase();
  const headers = {};
  for (const [k, v] of Object.entries(step.headers || {})) {
    headers[k] = resolveTemplate(v, ctx);
  }
  const opts = { method, headers };
  if (step.body && method !== 'GET') {
    opts.body = resolveTemplate(step.body, ctx);
  }
  const res = await fetch(url, opts);
  const text = await res.text();
  let parsed = text;
  try { parsed = JSON.parse(text); } catch (_) {}
  return {
    data: {
      httpStatus: res.status,
      httpHeaders: Object.fromEntries(res.headers.entries()),
      httpBody: parsed,
      _lastResponse: parsed,
    },
  };
}

async function stepOpenTab(step, ctx) {
  const url = resolveTemplate(step.url, ctx);
  const tab = await chrome.tabs.create({ url, active: step.active !== false });
  await waitForTabLoad(tab.id);
  ctx.tabId = tab.id;
  ctx.url = url;
  if (step.runRule) {
    await runRule(step.runRule, { source: 'open-tab', tabId: tab.id, url });
  }
  return { data: { openedTabId: tab.id } };
}

async function stepAutomate(step, ctx) {
  let tabId = ctx.tabId;
  if (step.tab === 'new' || step.url) {
    const url = step.url ? resolveTemplate(step.url, ctx) : undefined;
    const tab = await chrome.tabs.create({ url, active: step.active !== false });
    tabId = tab.id;
    await waitForTabLoad(tab.id);
    ctx.tabId = tabId;
    if (url) ctx.url = url;
  }
  if (!tabId) return { error: 'automate 에 활성 탭이 없습니다.' };
  const steps = resolveObject(step.steps || [], ctx);
  const res = await sendToContent(tabId, { type: 'automate', steps });
  if (res && res.error) return { error: res.error };
  return { data: res.data || {} };
}

async function stepNotify(step, ctx) {
  const title = resolveTemplate(step.title || 'WebBridge', ctx);
  const message = resolveTemplate(step.message || '', ctx);
  await chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title,
    message,
  });
  return {};
}

async function stepCopy(step, ctx) {
  const value = resolveTemplate(step.value, ctx);
  if (ctx.tabId) {
    await sendToContent(ctx.tabId, { type: 'copy', value });
  }
  return { data: { clipboard: value } };
}

async function stepToken(step, ctx) {
  const source = step.source || 'localStorage';
  const key = step.key ? resolveTemplate(step.key, ctx) : '';
  const name = step.name || key || source;
  const tabId = ctx.tabId;

  // cookie 는 chrome.cookies API 사용 (HttpOnly 포함)
  if (source === 'cookie') {
    try {
      const tab = await chrome.tabs.get(tabId);
      const url = tab && tab.url ? tab.url : ctx.url;
      const cookies = await chrome.cookies.getAll({ url });
      if (key) {
        const found = cookies.find((c) => c.name === key);
        return { data: { [name]: found ? found.value : null } };
      }
      const all = {};
      for (const c of cookies) all[c.name] = c.value;
      return { data: { [name]: all } };
    } catch (e) {
      return { data: { [name]: null }, error: e.message };
    }
  }

  // variable 는 페이지 MAIN 월드에서 window 속성 읽기
  if (source === 'variable' || source === 'window') {
    try {
      const expr = step.path ? resolveTemplate(step.path, ctx) : key;
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        func: (pathStr) => {
          try {
            const parts = pathStr.replace(/^window\./, '').split('.');
            let v = window;
            for (const p of parts) v = v ? v[p] : undefined;
            return v === undefined ? null : (typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : String(v));
          } catch (e) { return null; }
        },
        args: [expr],
      });
      return { data: { [name]: result } };
    } catch (e) {
      return { data: { [name]: null }, error: e.message };
    }
  }

  // localStorage / sessionStorage / meta / cookie(document)는 콘텐츠 스크립트에서
  if (tabId) {
    const res = await sendToContent(tabId, { type: 'token', source, key, name });
    return { data: (res && res.data) || { [name]: null } };
  }
  return { error: 'token 단계에 활성 탭이 없습니다.' };
}

async function stepWatchToken(step, ctx) {
  const tabId = ctx.tabId;
  if (!tabId) return { error: 'watch-token 에 활성 탭이 없습니다.' };
  const source = step.source || 'localStorage';
  const key = step.key ? resolveTemplate(step.key, ctx) : '';
  const name = step.name || key || source;
  const cacheKey = step.cacheKey || name;
  const intervalSeconds = Math.max(5, parseInt(step.intervalSeconds || 5, 10));
  const res = await sendToContent(tabId, {
    type: 'startTokenWatch',
    source,
    key,
    name,
    cacheKey,
    intervalSeconds,
  });
  if (res && res.error) return { error: res.error };
  return { data: { [name + '_watching']: true, [name + '_cacheKey']: cacheKey } };
}

async function stepTokenCache(step, ctx) {
  const source = step.source || 'localStorage';
  const key = step.key ? resolveTemplate(step.key, ctx) : '';
  const name = step.name || key || source;
  const cacheKey = step.cacheKey || name;
  const maxAgeSeconds = Math.max(0, parseInt(step.maxAgeSeconds || 5, 10));
  const now = Date.now();
  const cached = await readTokenCache(cacheKey);

  if (cached && cached.value != null && (!maxAgeSeconds || now - cached.at <= maxAgeSeconds * 1000)) {
    return {
      data: {
        [name]: cached.value,
        [name + '_fresh']: true,
        [name + '_ageMs']: now - cached.at,
      },
    };
  }

  const tab = await findTokenSourceTab(step.sourceUrlPattern, ctx.tabId);
  if (tab && tab.id != null) {
    const res = await readTokenFromTab(tab.id, { source, key, name });
    const value = res && res.data ? res.data[name] : null;
    await writeTokenCache(cacheKey, {
      value,
      source,
      key,
      name,
      url: tab.url || '',
      at: Date.now(),
    });
    return {
      data: {
        [name]: value,
        [name + '_fresh']: value != null,
        [name + '_ageMs']: 0,
      },
      error: res && res.error,
    };
  }

  return {
    data: {
      [name]: cached ? cached.value : null,
      [name + '_fresh']: false,
      [name + '_ageMs']: cached ? now - cached.at : null,
    },
    error: cached ? undefined : '신선한 토큰이 없고 출발 웹 탭을 찾지 못했습니다.',
  };
}

async function readTokenFromTab(tabId, step) {
  if (step.source === 'cookie') {
    try {
      const tab = await chrome.tabs.get(tabId);
      const cookies = await chrome.cookies.getAll({ url: tab.url });
      const found = cookies.find((c) => c.name === step.key);
      return { data: { [step.name]: found ? found.value : null } };
    } catch (e) {
      return { data: { [step.name]: null }, error: e.message };
    }
  }
  return sendToContent(tabId, { type: 'token', source: step.source, key: step.key, name: step.name });
}

async function findTokenSourceTab(pattern, fallbackTabId) {
  const tabs = await chrome.tabs.query({});
  if (pattern) {
    const found = tabs.find((tab) => matchUrl(pattern, tab.url || ''));
    if (found) return found;
  }
  if (fallbackTabId != null) {
    try { return await chrome.tabs.get(fallbackTabId); } catch (_) {}
  }
  return null;
}

async function readTokenCache(cacheKey) {
  const got = await chrome.storage.local.get(TOKEN_CACHE_PREFIX + cacheKey);
  return got[TOKEN_CACHE_PREFIX + cacheKey] || null;
}

async function writeTokenCache(cacheKey, entry) {
  await chrome.storage.local.set({ [TOKEN_CACHE_PREFIX + cacheKey]: entry });
}

async function stepStore(step, ctx) {
  const key = resolveTemplate(step.key, ctx);
  const value = step.value !== undefined ? resolveTemplate(step.value, ctx) : ctx.data;
  await chrome.storage.local.set({ [STORE_PREFIX + key]: value });
  return {};
}

async function stepReadStore(step, ctx) {
  const key = resolveTemplate(step.key, ctx);
  const got = await chrome.storage.local.get(STORE_PREFIX + key);
  return { data: { [key]: got[STORE_PREFIX + key] } };
}

async function stepWait(step, ctx) {
  if (step.ms) {
    await new Promise((r) => setTimeout(r, parseInt(step.ms, 10) || 0));
    return {};
  }
  if (step.selector && ctx.tabId) {
    await sendToContent(ctx.tabId, {
      type: 'wait',
      selector: step.selector,
      timeout: step.timeout || 10000,
    });
  }
  return {};
}

async function stepLog(step, ctx) {
  const value = step.value !== undefined ? resolveTemplate(step.value, ctx) : ctx.data;
  console.log('[WebBridge]', value);
  return {};
}

async function stepIf(step, ctx) {
  const fn = new Function('data', 'vars', 'context', `"use strict"; return !!(${step.condition || 'false'});`);
  const ok = fn(ctx.data, ctx.vars, ctx);
  const branch = ok ? step.then : step.else;
  if (Array.isArray(branch)) {
    for (const s of branch) {
      const r = await executeStep(s, ctx);
      if (r.data) ctx.data = { ...ctx.data, ...r.data };
      if (r.vars) ctx.vars = { ...ctx.vars, ...r.vars };
      if (r.error) return r;
    }
  }
  return { data: { _ifResult: ok } };
}

async function stepLoop(step, ctx) {
  const fn = new Function('data', 'vars', 'context', `"use strict"; return (${step.over || '[]'});`);
  const items = await fn(ctx.data, ctx.vars, ctx);
  const itemVar = step.as || 'item';
  const results = [];
  if (Array.isArray(items)) {
    for (let i = 0; i < items.length; i++) {
      ctx.vars[itemVar] = items[i];
      ctx.vars.index = i;
      if (Array.isArray(step.steps)) {
        for (const s of step.steps) {
          const r = await executeStep(s, ctx);
          if (r.data) ctx.data = { ...ctx.data, ...r.data };
          if (r.error) return r;
        }
      }
      results.push(ctx.vars[itemVar]);
    }
  }
  return { data: { _loopResults: results } };
}

/* ============================================================
 * 규칙 실행 (단계 순차 실행)
 * ============================================================ */
async function runRule(ruleOrId, opts = {}) {
  const rule = typeof ruleOrId === 'string' ? await getRule(ruleOrId) : ruleOrId;
  if (!rule) return { ok: false, error: '규칙을 찾을 수 없습니다.' };
  if (!rule.enabled) return { ok: false, error: '비활성화된 규칙입니다.' };

  const ctx = {
    rule: { id: rule.id, name: rule.name },
    data: {},
    vars: {},
    trigger: opts.source || 'manual',
    url: opts.url || '',
    tabId: opts.tabId || null,
  };

  const log = [];
  try {
    for (let i = 0; i < (rule.steps || []).length; i++) {
      const step = rule.steps[i];
      const t0 = Date.now();
      const r = await executeStep(step, ctx);
      log.push({ index: i, type: step.type, ms: Date.now() - t0, ok: !r.error, error: r.error });
      if (r.data) ctx.data = { ...ctx.data, ...r.data };
      if (r.vars) ctx.vars = { ...ctx.vars, ...r.vars };
      if (r.error) {
        return { ok: false, error: r.error, context: ctx, log };
      }
    }
    return { ok: true, context: ctx, log };
  } catch (e) {
    return { ok: false, error: e.message, context: ctx, log };
  }
}

/* ============================================================
 * 메시지 라우팅
 * ============================================================ */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      switch (msg.type) {
        case 'getRules':
          sendResponse({ rules: await getRules() });
          break;
        case 'getRule':
          sendResponse({ rule: await getRule(msg.id) });
          break;
        case 'saveRule':
          sendResponse({ rule: await saveRule(msg.rule) });
          break;
        case 'deleteRule':
          sendResponse({ ok: await deleteRule(msg.id) });
          break;
        case 'runRule': {
          const tab = await getActiveTab();
          sendResponse(await runRule(msg.id, {
            source: 'manual',
            tabId: tab && tab.id,
            url: tab && tab.url,
          }));
          break;
        }
        case 'runRuleOnTab':
          sendResponse(await runRule(msg.id, {
            source: 'manual',
            tabId: msg.tabId,
            url: msg.url,
          }));
          break;
        case 'pageReady': {
          const url = sender.tab ? sender.tab.url : msg.url;
          const tabId = sender.tab ? sender.tab.id : null;
          const rules = await getRules();
          const matching = rules.filter(
            (r) => r.enabled && r.trigger && r.trigger.type === 'page-load' && matchUrl(r.trigger.urlPattern, url)
          );
          for (const r of matching) {
            runRule(r, { source: 'page-load', tabId, url });
          }
          sendResponse({ matched: matching.length });
          break;
        }
        case 'testStep':
          sendResponse(await executeStep(msg.step, msg.context || { data: {}, vars: {}, tabId: msg.tabId }));
          break;
        case 'testRule': {
          // 본문 검증만: 실제 실행은 runRule 사용
          sendResponse({ ok: Array.isArray(msg.rule.steps) });
          break;
        }
        case 'scanTokens': {
          const tab = msg.tabId ? await chrome.tabs.get(msg.tabId) : await getActiveTab();
          sendResponse({ data: await scanTokens(tab) });
          break;
        }
        case 'tokenFresh': {
          const cacheKey = msg.cacheKey || msg.name || msg.key || 'token';
          await writeTokenCache(cacheKey, {
            value: msg.value,
            source: msg.source || '',
            key: msg.key || '',
            name: msg.name || cacheKey,
            url: sender.tab ? sender.tab.url : msg.url || '',
            tabId: sender.tab ? sender.tab.id : null,
            at: msg.at || Date.now(),
          });
          sendResponse({ ok: true });
          break;
        }
        case 'recordStart': {
          const tab = await getActiveTab();
          if (!tab) { sendResponse({ error: '활성 탭 없음' }); break; }
          recordingState.tabId = tab.id;
          await chrome.storage.session.set({ recordingTabId: tab.id });
          await sendToContent(tab.id, { type: 'recordStart' });
          sendResponse({ ok: true, tabId: tab.id });
          break;
        }
        case 'recordStatus': {
          const { recordingTabId } = await chrome.storage.session.get('recordingTabId');
          sendResponse({
            recording: recordingTabId != null,
            tabId: recordingTabId != null ? recordingTabId : recordingState.tabId,
          });
          break;
        }
        case 'recordStop': {
          const { recordingTabId } = await chrome.storage.session.get('recordingTabId');
          const tabId = recordingTabId != null ? recordingTabId : recordingState.tabId;
          recordingState.tabId = null;
          await chrome.storage.session.remove('recordingTabId');
          if (!tabId) { sendResponse({ error: '녹화 중 아님' }); break; }
          const res = await sendToContent(tabId, { type: 'recordStop' });
          const events = (res && res.events) || [];
          const steps = eventsToSteps(events);
          let url = '';
          try { url = (await chrome.tabs.get(tabId)).url; } catch (_) {}
          await chrome.storage.local.set({ pendingMacro: { steps, eventCount: events.length, url, at: Date.now() } });
          chrome.tabs.create({ url: chrome.runtime.getURL('options/options.html') + '#macro' });
          sendResponse({ ok: true, eventCount: events.length });
          break;
        }
        default:
          sendResponse({ error: '알 수 없는 메시지: ' + msg.type });
        }
    } catch (e) {
      sendResponse({ error: e.message });
    }
  })();
  return true;
});

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab;
}

/* ============================================================
 * 단축키 커맨드
 * ============================================================ */
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'run-on-page') {
    const tab = await getActiveTab();
    if (!tab) return;
    const rules = await getRules();
    const matching = rules.filter(
      (r) => r.enabled && r.trigger && r.trigger.type === 'shortcut' && matchUrl(r.trigger.urlPattern, tab.url)
    );
    for (const r of matching) {
      runRule(r, { source: 'shortcut', tabId: tab.id, url: tab.url });
    }
  } else if (command === 'record-toggle') {
    const { recordingTabId } = await chrome.storage.session.get('recordingTabId');
    if (recordingTabId == null && recordingState.tabId == null) {
      const tab = await getActiveTab();
      if (tab) {
        recordingState.tabId = tab.id;
        await chrome.storage.session.set({ recordingTabId: tab.id });
        await sendToContent(tab.id, { type: 'recordStart' });
        chrome.notifications.create({
          type: 'basic', iconUrl: 'icons/icon128.png',
          title: 'WebBridge 녹화', message: '매크로 녹화 시작. 다시 Alt+Shift+R 로 중지.',
        });
      }
    } else {
      await stopRecording();
    }
  }
});

async function stopRecording() {
  const { recordingTabId } = await chrome.storage.session.get('recordingTabId');
  const tabId = recordingTabId != null ? recordingTabId : recordingState.tabId;
  recordingState.tabId = null;
  await chrome.storage.session.remove('recordingTabId');
  if (!tabId) return { error: '녹화 중 아님' };
  const res = await sendToContent(tabId, { type: 'recordStop' });
  const events = (res && res.events) || [];
  const steps = eventsToSteps(events);
  let url = '';
  try { url = (await chrome.tabs.get(tabId)).url; } catch (_) {}
  await chrome.storage.local.set({ pendingMacro: { steps, eventCount: events.length, url, at: Date.now() } });
  chrome.tabs.create({ url: chrome.runtime.getURL('options/options.html') + '#macro' });
  chrome.notifications.create({
    type: 'basic', iconUrl: 'icons/icon128.png',
    title: 'WebBridge 녹화 완료', message: events.length + '개 동작 기록됨. 편집기에서 저장하세요.',
  });
  return { ok: true, eventCount: events.length };
}

/* ============================================================
 * 토큰 스캔 (popup 용)
 * ============================================================ */
async function scanTokens(tab) {
  if (!tab) return { error: '활성 탭 없음' };
  const result = {
    url: tab.url,
    page: {},
    meta: {},
    forms: {},
    links: {},
    images: {},
    localStorage: {},
    sessionStorage: {},
    cookies: {},
    variables: {},
    tokens: {},
  };
  const TOKEN_RE = /token|auth|jwt|access|session|csrf|bearer|apikey|api_key|secret/i;

  // 1) 콘텐츠 스크립트(ISOLATED)에서 localStorage/sessionStorage/document.cookie/meta
  try {
    const res = await sendToContent(tab.id, { type: 'scanTokens' });
    if (res && res.data) {
      result.page = res.data.page || {};
      result.meta = res.data.meta || {};
      result.forms = res.data.forms || {};
      result.links = res.data.links || {};
      result.images = res.data.images || {};
      result.localStorage = res.data.localStorage || {};
      result.sessionStorage = res.data.sessionStorage || {};
      result.cookies = res.data.cookies || {};
      result.tokens = res.data.tokens || {};
    }
  } catch (_) {}

  // 2) chrome.cookies (HttpOnly 포함)
  try {
    const cookies = await chrome.cookies.getAll({ url: tab.url });
    for (const c of cookies) {
      result.cookies[`cookie.${c.name}`] = tokenItem(c.value);
      if (TOKEN_RE.test(c.name)) result.tokens[`cookie.${c.name}`] = tokenItem(c.value);
    }
  } catch (_) {}

  // 3) MAIN 월드에서 흔한 window 변수 스캔
  try {
    const [{ result: vars }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      func: () => {
        const out = {};
        const keys = ['__token','token','accessToken','access_token','authToken','csrfToken','JWT','jwt','apiToken','apiKey','api_key','ENV','env','config','__NUXT__','__INITIAL_STATE__','__APOLLO_STATE__'];
        for (const k of keys) {
          try {
            const v = window[k];
            if (v != null) out[k] = typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : String(v);
          } catch (_) {}
        }
        return out;
      },
    });
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        result.variables[`window.${k}`] = tokenItem(v);
        if (TOKEN_RE.test(k)) result.tokens[`window.${k}`] = tokenItem(v);
      }
    }
  } catch (_) {}

  return result;
}

function truncate(v, max = 200) {
  if (v == null) return null;
  v = String(v);
  return v.length > max ? v.slice(0, max) + '…(' + v.length + ')' : v;
}

function tokenItem(v) {
  const value = v == null ? '' : typeof v === 'string' ? v : JSON.stringify(v);
  return { value, preview: truncate(value) };
}

/* ============================================================
 * 매크로 녹화 이벤트 -> automate 단계 변환
 * ============================================================ */
function eventsToSteps(events) {
  if (!events || !events.length) return [];
  const sub = events.map((e) => {
    const s = { type: e.type, selector: e.selector };
    if (e.value !== undefined) s.value = String(e.value);
    if (e.to !== undefined) s.to = e.to;
    if (e.delay) s.delay = e.delay;
    return s;
  });
  return [{ type: 'automate', tab: 'current', steps: sub }];
}

/* ============================================================
 * 컨텍스트 메뉴 (페이지 우클릭 -> 현재 페이지 규칙 실행)
 * ============================================================ */
chrome.runtime.onInstalled.addListener(async () => {
  try {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: 'webbridge-run-page',
        title: 'WebBridge: 이 페이지에서 규칙 실행',
        contexts: ['page'],
      });
    });
  } catch (_) {}
  await rebuildTriggers();
  // 최초 설치 시 예제 규칙 주입
  const rules = await getRules();
  if (rules.length === 0) {
    const examples = await loadExamples();
    if (examples.length) await chrome.storage.local.set({ [STORAGE_KEY]: examples });
  }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'webbridge-run-page' && tab) {
    const rules = await getRules();
    const matching = rules.filter(
      (r) => r.enabled && r.trigger && (r.trigger.type === 'page-load' || r.trigger.type === 'manual')
    );
    for (const r of matching) {
      runRule(r, { source: 'context', tabId: tab.id, url: tab.url });
    }
  }
});

async function loadExamples() {
  try {
    const url = chrome.runtime.getURL('examples/examples.json');
    const res = await fetch(url);
    return await res.json();
  } catch (e) {
    return [];
  }
}
