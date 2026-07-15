const STORAGE_KEY = 'mockInvestUrl';
const APP_PATH = '/apps/mock-invest/';
const DEFAULT_MOCK_INVEST_URL = 'https://playground.https.gsmsv.site/apps/mock-invest/';

const input = document.querySelector('#mockInvestUrl');
const saveButton = document.querySelector('#saveButton');
const statusText = document.querySelector('#status');

function normalizeMockInvestUrl(value) {
  try {
    const url = new URL(value || DEFAULT_MOCK_INVEST_URL);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    if (!url.pathname.startsWith(APP_PATH)) {
      url.pathname = APP_PATH;
      url.search = '';
      url.hash = '';
    }
    return url.toString();
  } catch {
    return '';
  }
}

function setStatus(message, isError = false) {
  statusText.textContent = message;
  statusText.style.color = isError ? 'var(--red)' : 'var(--accent)';
}

async function saveUrl() {
  const normalized = normalizeMockInvestUrl(input.value.trim());
  if (!normalized) {
    setStatus('올바른 http 또는 https 주소를 입력하세요.', true);
    return;
  }

  input.value = normalized;
  await chrome.storage.sync.set({ [STORAGE_KEY]: normalized });
  setStatus('저장됐습니다.');
}

async function loadUrl() {
  const result = await chrome.storage.sync.get(STORAGE_KEY);
  input.value = result[STORAGE_KEY] || DEFAULT_MOCK_INVEST_URL;
}

saveButton.addEventListener('click', saveUrl);
loadUrl();
