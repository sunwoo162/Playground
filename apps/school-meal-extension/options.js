const STORAGE_KEY = 'schoolMealUrl';
const APP_PATH = '/apps/school-meal/';
const DEFAULT_SCHOOL_MEAL_URL = 'https://playground.https.gsmsv.site/apps/school-meal/';

const input = document.querySelector('#schoolMealUrl');
const saveButton = document.querySelector('#saveButton');
const testButton = document.querySelector('#testButton');
const statusText = document.querySelector('#status');

function normalizeSchoolMealUrl(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    if (!url.pathname.startsWith(APP_PATH)) {
      url.pathname = APP_PATH;
      url.search = '';
      url.hash = '';
    }
    url.searchParams.delete('compact');
    return url.toString();
  } catch {
    return '';
  }
}

function setStatus(message, isError = false) {
  statusText.textContent = message;
  statusText.style.color = isError ? '#ff6b81' : 'var(--accent)';
}

async function saveUrl() {
  const normalized = normalizeSchoolMealUrl(input.value.trim());
  if (!normalized) {
    setStatus('올바른 http 또는 https 주소를 입력하세요.', true);
    return '';
  }

  input.value = normalized;
  await chrome.storage.sync.set({ [STORAGE_KEY]: normalized });
  setStatus('저장됐습니다.');
  return normalized;
}

async function loadUrl() {
  const result = await chrome.storage.sync.get(STORAGE_KEY);
  input.value = result[STORAGE_KEY] || DEFAULT_SCHOOL_MEAL_URL;
}

saveButton.addEventListener('click', saveUrl);

testButton.addEventListener('click', async () => {
  const url = await saveUrl();
  if (!url) return;
  const popupUrl = new URL(url);
  popupUrl.searchParams.set('compact', '1');
  await chrome.windows.create({
    url: popupUrl.toString(),
    type: 'popup',
    width: 450,
    height: 690,
  });
});

loadUrl();
