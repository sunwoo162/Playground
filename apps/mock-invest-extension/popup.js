const STORAGE_KEY = 'mockInvestUrl';
const DEFAULT_MOCK_INVEST_URL = 'https://playground.https.gsmsv.site/apps/mock-invest/';

const statusEl = document.querySelector('#status');
const listEl = document.querySelector('#watchlist');
const emptyEl = document.querySelector('#emptyState');
const refreshButton = document.querySelector('#refreshButton');
const openAppButton = document.querySelector('#openAppButton');
let currentAppUrl = DEFAULT_MOCK_INVEST_URL;
let currentOrigin = '';

function normalizeBaseUrl(value) {
  try {
    const url = new URL(value || DEFAULT_MOCK_INVEST_URL);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    return url.origin;
  } catch {
    return '';
  }
}

function money(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return '시세 없음';
  return `$${number.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function percent(value) {
  if (value === null || value === undefined || value === '') return '-';
  const number = Number(value);
  if (!Number.isFinite(number)) return '-';
  const sign = number > 0 ? '+' : '';
  return `${sign}${number.toFixed(2)}%`;
}

function changeClass(value) {
  const number = Number(value);
  if (number > 0) return 'positive';
  if (number < 0) return 'negative';
  return 'neutral';
}

function setStatus(message, visible = true) {
  statusEl.textContent = message;
  statusEl.classList.toggle('hidden', !visible);
}

function mergeStocks(watchlist, holdings) {
  const items = new Map();

  for (const stock of watchlist) {
    if (!stock.symbol) continue;
    items.set(stock.symbol, {
      ...stock,
      watchlisted: true,
      holding: false,
    });
  }

  for (const holding of holdings) {
    if (!holding.symbol) continue;
    const current = items.get(holding.symbol) || {};
    items.set(holding.symbol, {
      ...current,
      symbol: holding.symbol,
      name: current.name || holding.name,
      sector: current.sector || '보유 종목',
      price: current.price || holding.currentPrice,
      change: current.change,
      changeRate: current.changeRate,
      high: current.high,
      low: current.low,
      realtime: current.realtime,
      holding: true,
      watchlisted: Boolean(current.watchlisted),
      quantity: holding.quantity,
      averagePrice: holding.averagePrice,
      evaluated: holding.evaluated,
      profit: holding.profit,
      profitRate: holding.profitRate,
    });
  }

  return Array.from(items.values()).sort((a, b) => {
    if (a.holding !== b.holding) return a.holding ? -1 : 1;
    return String(a.name || a.symbol).localeCompare(String(b.name || b.symbol), 'ko');
  });
}

function render(stocks, warning = '') {
  listEl.innerHTML = '';
  if (!stocks.length) {
    listEl.classList.add('hidden');
    emptyEl.classList.remove('hidden');
    setStatus(warning, Boolean(warning));
    return;
  }

  emptyEl.classList.add('hidden');
  listEl.classList.remove('hidden');
  setStatus(warning, Boolean(warning));

  for (const stock of stocks) {
    const card = document.createElement('article');
    card.className = 'stock-card';
    const hasLivePrice = stock.realtime !== false && Number(stock.price) > 0;
    const change = hasLivePrice ? Number(stock.change) : Number.NaN;
    const changeRate = hasLivePrice ? Number(stock.changeRate) : Number.NaN;
    const tone = hasLivePrice ? changeClass(changeRate) : 'neutral';
    const quoteChangeText = hasLivePrice && Number.isFinite(change)
      ? `${signedMoney(change)} · ${percent(stock.changeRate)}`
      : '시세 없음';
    const holdingProfit = Number(stock.profit);
    const holdingProfitText = stock.holding && Number.isFinite(holdingProfit)
      ? `${signedMoney(holdingProfit)} · ${percent(stock.profitRate)}`
      : '';
    const badges = [
      stock.holding ? '<span class="badge owned">보유</span>' : '',
      stock.watchlisted ? '<span class="badge">관심</span>' : '',
    ].join('');
    card.innerHTML = `
      <div class="stock-top">
        <div class="stock-name">
          <div class="badges">${badges}</div>
          <strong>${escapeHtml(stock.name || stock.symbol)}</strong>
          <span>${escapeHtml(stock.symbol || '-')} · ${escapeHtml(stock.sector || 'US')}</span>
        </div>
        <div>
          <div class="price">${money(stock.price)}</div>
          <div class="change ${tone}">${quoteChangeText}</div>
        </div>
      </div>
      <div class="stock-meta">
        ${stock.holding ? `
          <span>${Number(stock.quantity).toLocaleString('en-US')}주 보유</span>
          <span class="${changeClass(stock.profitRate)}">${holdingProfitText}</span>
        ` : `
          <span>고가 ${hasLivePrice ? money(stock.high) : '-'}</span>
          <span>저가 ${hasLivePrice ? money(stock.low) : '-'}</span>
        `}
      </div>
      <div class="trade-form" data-symbol="${escapeHtml(stock.symbol || '')}">
        <input type="number" min="1" step="1" value="1" aria-label="주문 수량" />
        <button class="buy-button" type="button" data-action="buy">매수</button>
        <button class="sell-button" type="button" data-action="sell" ${stock.holding ? '' : 'disabled'}>매도</button>
      </div>
    `;
    listEl.appendChild(card);
  }
}

function signedMoney(value) {
  if (value === null || value === undefined || value === '') return '-';
  const number = Number(value);
  if (!Number.isFinite(number)) return '-';
  const sign = number > 0 ? '+' : '';
  return `${sign}$${number.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

async function loadWatchlist() {
  setStatus('보유 종목과 관심 종목을 불러오는 중...');
  listEl.classList.add('hidden');
  emptyEl.classList.add('hidden');

  const stored = await chrome.storage.sync.get(STORAGE_KEY);
  currentAppUrl = stored[STORAGE_KEY] || DEFAULT_MOCK_INVEST_URL;
  currentOrigin = normalizeBaseUrl(currentAppUrl);
  if (!currentOrigin) {
    setStatus('옵션에서 올바른 모의 투자 주소를 설정해주세요.');
    return;
  }

  if (!stored[STORAGE_KEY]) {
    await chrome.storage.sync.set({ [STORAGE_KEY]: DEFAULT_MOCK_INVEST_URL });
  }

  try {
    const [watchlistResult, portfolioResult] = await Promise.all([
      fetchJson(`${currentOrigin}/api/mock-invest/watchlist`),
      fetchJson(`${currentOrigin}/api/mock-invest/portfolio`),
    ]);

    if (watchlistResult.status === 401 || portfolioResult.status === 401) {
      setStatus('로그인이 필요합니다. 놀이터에 로그인한 뒤 다시 열어주세요.');
      return;
    }

    const watchlist = Array.isArray(watchlistResult.data) ? watchlistResult.data : [];
    const holdings = Array.isArray(portfolioResult.data?.holdings) ? portfolioResult.data.holdings : [];
    const failed = [watchlistResult, portfolioResult].filter((result) => !result.ok);
    const warning = failed.length > 0 ? '일부 정보를 불러오지 못했습니다. 새로고침을 눌러 다시 시도하세요.' : '';
    render(mergeStocks(watchlist, holdings), warning);
  } catch {
    setStatus('서버에 연결할 수 없습니다.');
  }
}

async function submitTrade(symbol, action, quantity) {
  if (!currentOrigin) {
    setStatus('옵션에서 올바른 모의 투자 주소를 설정해주세요.');
    return;
  }

  setStatus(`${symbol} ${quantity}주 ${action === 'buy' ? '매수' : '매도'} 요청 중...`);
  const result = await postJson(`${currentOrigin}/api/mock-invest/trades/${action}`, {
    symbol,
    quantity,
  });

  if (result.status === 401) {
    setStatus('로그인이 필요합니다. 놀이터에 로그인한 뒤 다시 시도해주세요.');
    return;
  }
  if (!result.ok) {
    setStatus(result.message || `${action === 'buy' ? '매수' : '매도'}에 실패했습니다. (${result.status || 'network'})`);
    return;
  }

  setStatus(`${symbol} ${quantity}주 ${action === 'buy' ? '매수' : '매도'} 완료`);
  await loadWatchlist();
}

async function fetchJson(url) {
  try {
    const response = await fetch(url, {
      credentials: 'include',
      cache: 'no-store',
    });
    if (!response.ok) {
      return { ok: false, status: response.status, data: null };
    }
    return { ok: true, status: response.status, data: await response.json() };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}

async function postJson(url, body) {
  try {
    const response = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    let data = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }
    return {
      ok: response.ok,
      status: response.status,
      data,
      message: data?.message || data?.error,
    };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}

function openMockInvestApp() {
  const target = currentAppUrl || DEFAULT_MOCK_INVEST_URL;
  chrome.tabs.create({ url: target });
}

listEl.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button || button.disabled) return;
  const form = button.closest('.trade-form');
  const symbol = form?.dataset.symbol;
  const input = form?.querySelector('input');
  const quantity = Number(input?.value);
  if (!symbol || !Number.isInteger(quantity) || quantity < 1) {
    setStatus('주문 수량은 1 이상의 정수로 입력해주세요.');
    return;
  }

  const action = button.dataset.action;
  button.disabled = true;
  try {
    await submitTrade(symbol, action, quantity);
  } finally {
    button.disabled = false;
  }
});

refreshButton.addEventListener('click', loadWatchlist);
openAppButton.addEventListener('click', openMockInvestApp);
loadWatchlist();
