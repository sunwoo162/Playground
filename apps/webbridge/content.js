/* WebBridge content script
 * 페이지 DOM 에서 데이터 추출 및 자동화 동작 수행
 */
'use strict';

(() => {
  if (window.__webBridgeLoaded) return;
  window.__webBridgeLoaded = true;

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    (async () => {
      try {
        switch (msg.type) {
          case 'extract':
            sendResponse({ data: await doExtract(msg.fields || {}) });
            break;
          case 'automate':
            sendResponse({ data: await doAutomate(msg.steps || []) });
            break;
          case 'wait':
            sendResponse({ ok: await waitForSelector(msg.selector, msg.timeout || 10000) });
            break;
          case 'copy':
            sendResponse({ ok: await doCopy(msg.value) });
            break;
          case 'token':
            sendResponse({ data: await doToken(msg) });
            break;
          case 'scanTokens':
            sendResponse({ data: scanTokensInPage() });
            break;
          case 'startTokenWatch':
            sendResponse({ ok: startTokenWatch(msg) });
            break;
          case 'recordStart':
            sendResponse({ ok: recordStart() });
            break;
          case 'recordStop':
            sendResponse({ events: recordStop() });
            break;
          case 'recordStatus':
            sendResponse({ recording: recordState.active, count: recordState.events.length });
            break;
          case 'ping':
            sendResponse({ ok: true, url: location.href });
            break;
          default:
            sendResponse({ error: '알 수 없는 콘텐츠 메시지: ' + msg.type });
        }
      } catch (e) {
        sendResponse({ error: e.message });
      }
    })();
    return true;
  });

  // 페이지 준비 알림
  try {
    chrome.runtime.sendMessage({ type: 'pageReady', url: location.href }).catch(() => {});
  } catch (_) {}

  const tokenWatchers = {};

  /* ---------- 데이터 추출 ---------- */
  async function doExtract(fields) {
    const out = {};
    for (const [key, spec] of Object.entries(fields)) {
      const cfg = typeof spec === 'string' ? { selector: spec } : spec;
      if (!cfg.selector) {
        out[key] = null;
        continue;
      }
      const els = document.querySelectorAll(cfg.selector);
      if (cfg.multiple) {
        out[key] = Array.from(els).map((el) => readEl(el, cfg));
      } else {
        out[key] = els[0] ? readEl(els[0], cfg) : null;
      }
    }
    return out;
  }

  function readEl(el, cfg) {
    if (cfg.attr) return el.getAttribute(cfg.attr);
    if (cfg.html) return el.innerHTML;
    if (cfg.prop && cfg.prop in el) return el[cfg.prop];
    if (cfg.regex) {
      const txt = (el.innerText || el.textContent || '').trim();
      const m = new RegExp(cfg.regex).exec(txt);
      return m ? (m[1] || m[0]) : null;
    }
    return (el.innerText || el.textContent || '').trim();
  }

  /* ---------- 자동화 ---------- */
  async function doAutomate(steps) {
    const data = {};
    for (const s of steps) {
      switch (s.type) {
        case 'click': {
          const el = await waitForSelector(s.selector, s.timeout || 5000);
          if (el) el.click();
          break;
        }
        case 'input':
        case 'setValue': {
          const el = document.querySelector(s.selector);
          if (el) setNativeValue(el, s.value);
          break;
        }
        case 'select': {
          const el = document.querySelector(s.selector);
          if (el) {
            el.value = s.value;
            el.dispatchEvent(new Event('change', { bubbles: true }));
          }
          break;
        }
        case 'check': {
          const el = document.querySelector(s.selector);
          if (el) {
            el.checked = !!s.value;
            el.dispatchEvent(new Event('change', { bubbles: true }));
          }
          break;
        }
        case 'wait': {
          if (s.ms) await new Promise((r) => setTimeout(r, parseInt(s.ms, 10) || 0));
          else if (s.selector) await waitForSelector(s.selector, s.timeout || 10000);
          break;
        }
        case 'extract': {
          Object.assign(data, await doExtract(s.fields || {}));
          break;
        }
        case 'scroll': {
          if (s.selector) {
            const el = document.querySelector(s.selector);
            if (el) el.scrollIntoView({ behavior: s.behavior || 'smooth', block: 'center' });
          } else {
            window.scrollTo({ top: s.to !== undefined ? s.to : document.body.scrollHeight, behavior: 'smooth' });
          }
          break;
        }
        case 'eval': {
          try {
            const fn = new Function('data', `"use strict"; ${s.code}`);
            const r = fn(data);
            if (r && typeof r === 'object') Object.assign(data, r);
          } catch (e) {
            data._evalError = e.message;
          }
          break;
        }
        case 'submit': {
          const el = s.selector ? document.querySelector(s.selector) : null;
          if (el && el.form) el.form.submit();
          else if (el) el.click();
          break;
        }
        default:
          break;
      }
      if (s.delay) await new Promise((r) => setTimeout(r, parseInt(s.delay, 10) || 0));
    }
    return data;
  }

  function setNativeValue(el, value) {
    const proto = el instanceof HTMLInputElement
      ? HTMLInputElement.prototype
      : el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : el instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : null;
    const setter = proto && Object.getOwnPropertyDescriptor(proto, 'value');
    if (setter && setter.set) setter.set.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function waitForSelector(selector, timeout) {
    return new Promise((resolve) => {
      const existing = document.querySelector(selector);
      if (existing) return resolve(existing);
      const obs = new MutationObserver(() => {
        const el = document.querySelector(selector);
        if (el) {
          obs.disconnect();
          resolve(el);
        }
      });
      obs.observe(document.documentElement, { childList: true, subtree: true });
      setTimeout(() => {
        obs.disconnect();
        resolve(null);
      }, timeout);
    });
  }

  async function doCopy(value) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch (_) {
      const ta = document.createElement('textarea');
      ta.value = value;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (_) {}
      ta.remove();
      return true;
    }
  }

  /* ---------- 토큰 추출 ---------- */
  async function doToken(msg) {
    const source = msg.source || 'localStorage';
    const key = msg.key || '';
    const out = {};
    const name = msg.name || key || source;
    try {
      if (source === 'localStorage' || source === 'sessionStorage') {
        const store = source === 'localStorage' ? localStorage : sessionStorage;
        if (key) out[name] = store.getItem(key);
        else {
          const all = {};
          for (let i = 0; i < store.length; i++) {
            const k = store.key(i);
            all[k] = store.getItem(k);
          }
          out[name] = all;
        }
      } else if (source === 'meta') {
        const el = key
          ? document.querySelector(`meta[name="${CSS.escape(key)}"], meta[property="${CSS.escape(key)}"]`)
          : document.querySelector('meta[name*=token i], meta[name*=csrf i], meta[name*=auth i]');
        out[name] = el ? el.content || el.getAttribute('content') : null;
      } else if (source === 'cookie') {
        // document.cookie (HttpOnly 제외) - background 의 chrome.cookies 가 더 강력
        const cookies = document.cookie ? document.cookie.split('; ') : [];
        if (key) {
          const found = cookies.find((c) => c.startsWith(key + '='));
          out[name] = found ? found.slice(key.length + 1) : null;
        } else {
          const all = {};
          for (const c of cookies) {
            const i = c.indexOf('=');
            if (i > 0) all[c.slice(0, i)] = c.slice(i + 1);
          }
          out[name] = all;
        }
      }
    } catch (e) {
      out[name] = null;
      out._error = e.message;
    }
    return out;
  }

  function startTokenWatch(msg) {
    const cacheKey = msg.cacheKey || msg.name || msg.key || 'token';
    const intervalSeconds = Math.max(5, parseInt(msg.intervalSeconds || 5, 10));
    if (tokenWatchers[cacheKey]) clearInterval(tokenWatchers[cacheKey]);

    const tick = async () => {
      const data = await doToken(msg);
      const value = data[msg.name || msg.key || msg.source];
      try {
        await chrome.runtime.sendMessage({
          type: 'tokenFresh',
          cacheKey,
          source: msg.source,
          key: msg.key,
          name: msg.name,
          value,
          url: location.href,
          at: Date.now(),
        });
      } catch (_) {}
    };

    tick();
    tokenWatchers[cacheKey] = setInterval(tick, intervalSeconds * 1000);
    return true;
  }

  function scanTokensInPage() {
    const result = {
      page: {},
      meta: {},
      forms: {},
      links: {},
      images: {},
      localStorage: {},
      sessionStorage: {},
      cookies: {},
      tokens: {},
      url: location.href,
    };
    const TOKEN_RE = /token|auth|jwt|access|session|csrf|bearer|apikey|api_key/i;
    add(result.page, 'page.url', location.href);
    add(result.page, 'page.origin', location.origin);
    add(result.page, 'page.host', location.host);
    add(result.page, 'page.pathname', location.pathname);
    add(result.page, 'page.title', document.title);
    add(result.page, 'page.lang', document.documentElement.lang || '');
    add(result.page, 'page.canonical', document.querySelector('link[rel="canonical"]')?.href || '');
    add(result.page, 'page.referrer', document.referrer || '');
    try {
      document.querySelectorAll('meta[name],meta[property]').forEach((m) => {
        const n = m.getAttribute('name') || m.getAttribute('property');
        const v = m.content || m.getAttribute('content') || '';
        if (!n || !v) return;
        add(result.meta, `meta.${n}`, v);
        if (TOKEN_RE.test(n)) add(result.tokens, `meta.${n}`, v);
      });
    } catch (_) {}
    try {
      document.querySelectorAll('input,textarea,select').forEach((el, i) => {
        const name = el.name || el.id || el.getAttribute('aria-label') || `field${i + 1}`;
        const type = (el.type || el.tagName).toLowerCase();
        if (['password', 'file'].includes(type)) return;
        const value = el.type === 'checkbox' || el.type === 'radio' ? String(el.checked) : el.value;
        if (value) add(result.forms, `form.${name}`, value);
      });
    } catch (_) {}
    try {
      Array.from(document.links).slice(0, 30).forEach((a, i) => {
        const label = (a.innerText || a.textContent || a.title || a.href || `link${i + 1}`).trim().slice(0, 40);
        if (a.href) add(result.links, `link.${label || i + 1}`, a.href);
      });
    } catch (_) {}
    try {
      Array.from(document.images).slice(0, 30).forEach((img, i) => {
        const label = (img.alt || img.title || img.id || `image${i + 1}`).trim().slice(0, 40);
        if (img.currentSrc || img.src) add(result.images, `image.${label || i + 1}`, img.currentSrc || img.src);
      });
    } catch (_) {}
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        const v = localStorage.getItem(k);
        add(result.localStorage, `localStorage.${k}`, v);
        if (TOKEN_RE.test(k) || (v && v.length > 20)) add(result.tokens, `localStorage.${k}`, v);
      }
    } catch (_) {}
    try {
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        const v = sessionStorage.getItem(k);
        add(result.sessionStorage, `sessionStorage.${k}`, v);
        if (TOKEN_RE.test(k) || (v && v.length > 20)) add(result.tokens, `sessionStorage.${k}`, v);
      }
    } catch (_) {}
    try {
      document.cookie.split('; ').forEach((c) => {
        const i = c.indexOf('=');
        if (i > 0) {
          const k = c.slice(0, i);
          const v = c.slice(i + 1);
          add(result.cookies, `cookie.${k}`, v);
          if (TOKEN_RE.test(k)) add(result.tokens, `cookie.${k}`, v);
        }
      });
    } catch (_) {}
    return result;
  }

  function add(obj, key, value) {
    if (value === undefined || value === null || value === '') return;
    obj[key] = tokenItem(value);
  }

  function truncate(v, max = 120) {
    if (v == null) return null;
    v = String(v);
    return v.length > max ? v.slice(0, max) + '…(' + v.length + ')' : v;
  }

  function tokenItem(v) {
    return { value: v == null ? '' : String(v), preview: truncate(v) };
  }

  /* ---------- 매크로 녹화 ---------- */
  const recordState = { active: false, events: [], lastTs: 0 };

  function buildSelector(el) {
    if (!el || el.nodeType !== 1) return '';
    if (el.id && document.querySelectorAll(`#${CSS.escape(el.id)}`).length === 1) {
      return `#${CSS.escape(el.id)}`;
    }
    const attrs = ['data-testid', 'data-test', 'data-cy', 'data-id', 'name', 'role'];
    for (const a of attrs) {
      const v = el.getAttribute(a);
      if (v) {
        const sel = `${el.tagName.toLowerCase()}[${a}="${CSS.escape(v)}"]`;
        if (document.querySelectorAll(sel).length === 1) return sel;
      }
    }
    const parts = [];
    let cur = el;
    while (cur && cur.nodeType === 1 && cur !== document.documentElement) {
      let sel = cur.tagName.toLowerCase();
      const parent = cur.parentElement;
      if (parent) {
        const sibs = Array.from(parent.children).filter((n) => n.tagName === cur.tagName);
        if (sibs.length > 1) sel += `:nth-of-type(${sibs.indexOf(cur) + 1})`;
      }
      parts.unshift(sel);
      cur = parent;
      if (parts.length >= 6) break;
    }
    return parts.join(' > ');
  }

  function recordEvent(type, el, extra) {
    if (!recordState.active) return;
    const selector = buildSelector(el);
    if (!selector) return;
    const now = Date.now();
    const delay = recordState.lastTs ? Math.min(3000, Math.max(0, now - recordState.lastTs)) : 0;
    recordState.lastTs = now;
    recordState.events.push({ type, selector, delay, ...extra });
  }

  function onRecordClick(e) {
    if (!recordState.active) return;
    const el = e.target.closest('a,button,input,select,textarea,[role=button],[onclick]') || e.target;
    recordEvent('click', el);
  }
  function onRecordChange(e) {
    if (!recordState.active) return;
    const el = e.target;
    const tag = el.tagName;
    const type = (el.getAttribute && el.getAttribute('type')) || '';
    if (tag === 'SELECT') recordEvent('select', el, { value: el.value });
    else if (type === 'checkbox' || type === 'radio') recordEvent('check', el, { value: el.checked });
    else if (tag === 'INPUT' || tag === 'TEXTAREA') recordEvent('input', el, { value: el.value });
  }
  function onRecordScroll() {
    if (!recordState.active) return;
    recordEvent('scroll', document.scrollingElement || document.body, { to: window.scrollY });
  }

  function recordStart() {
    recordState.events = [];
    recordState.lastTs = 0;
    recordState.active = true;
    document.addEventListener('click', onRecordClick, true);
    document.addEventListener('change', onRecordChange, true);
    window.addEventListener('scroll', onRecordScroll, true);
    return true;
  }

  function recordStop() {
    recordState.active = false;
    document.removeEventListener('click', onRecordClick, true);
    document.removeEventListener('change', onRecordChange, true);
    window.removeEventListener('scroll', onRecordScroll, true);
    const events = recordState.events.slice();
    recordState.events = [];
    return events;
  }
})();
