const STORAGE_KEY = 'mockInvestUrl';
const DEFAULT_MOCK_INVEST_URL = 'https://playground.https.gsmsv.site/apps/mock-invest/';

const statusEl = document.querySelector('#status');
const listEl = document.querySelector('#watchlist');
const emptyEl = document.querySelector('#emptyState');
const refreshButton = document.querySelector('#refreshButton');

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

function render(stocks) {
  listEl.innerHTML = '';
  if (!stocks.length) {
    listEl.classList.add('hidden');
    emptyEl.classList.remove('hidden');
    setStatus('', false);
    return;
  }

  emptyEl.classList.add('hidden');
  listEl.classList.remove('hidden');
  setStatus('', false);

  for (const stock of stocks) {
    const card = document.createElement('article');
    card.className = 'stock-card';
    const hasLivePrice = stock.realtime !== false && Number(stock.price) > 0;
    const change = hasLivePrice ? Number(stock.change) : Number.NaN;
    const changeRate = hasLivePrice ? Number(stock.changeRate) : Number.NaN;
    const tone = hasLivePrice ? changeClass(changeRate) : 'neutral';
    const changeText = hasLivePrice && Number.isFinite(change)
      ? `${signedMoney(change)} · ${percent(stock.changeRate)}`
      : '시세 없음';
    card.innerHTML = `
      <div class="stock-top">
        <div class="stock-name">
          <strong>${escapeHtml(stock.name || stock.symbol)}</strong>
          <span>${escapeHtml(stock.symbol || '-')} · ${escapeHtml(stock.sector || 'US')}</span>
        </div>
        <div>
          <div class="price">${money(stock.price)}</div>
          <div class="change ${tone}">${changeText}</div>
        </div>
      </div>
      <div class="stock-meta">
        <span>고가 ${hasLivePrice ? money(stock.high) : '-'}</span>
        <span>저가 ${hasLivePrice ? money(stock.low) : '-'}</span>
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
  setStatus('관심 종목을 불러오는 중...');
  listEl.classList.add('hidden');
  emptyEl.classList.add('hidden');

  const stored = await chrome.storage.sync.get(STORAGE_KEY);
  const origin = normalizeBaseUrl(stored[STORAGE_KEY] || DEFAULT_MOCK_INVEST_URL);
  if (!origin) {
    setStatus('옵션에서 올바른 모의 투자 주소를 설정해주세요.');
    return;
  }

  if (!stored[STORAGE_KEY]) {
    await chrome.storage.sync.set({ [STORAGE_KEY]: DEFAULT_MOCK_INVEST_URL });
  }

  try {
    const response = await fetch(`${origin}/api/mock-invest/watchlist`, {
      credentials: 'include',
      cache: 'no-store',
    });
    if (response.status === 401) {
      setStatus('로그인이 필요합니다. 놀이터에 로그인한 뒤 다시 열어주세요.');
      return;
    }
    if (!response.ok) {
      setStatus(`관심 종목을 불러오지 못했습니다. (${response.status})`);
      return;
    }
    render(await response.json());
  } catch {
    setStatus('서버에 연결할 수 없습니다.');
  }
}

refreshButton.addEventListener('click', loadWatchlist);
loadWatchlist();
