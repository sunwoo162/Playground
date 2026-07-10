const STORAGE_KEY = 'schoolMealUrl';
const APP_PATH = '/apps/school-meal/';
const DEFAULT_SCHOOL_MEAL_URL = 'https://playground.https.gsmsv.site/apps/school-meal/';

const frame = document.querySelector('#schoolFrame');
const loading = document.querySelector('#loading');
const errorState = document.querySelector('#errorState');
const toggleSettingsButton = document.querySelector('#toggleSettings');
const openOptionsFromErrorButton = document.querySelector('#openOptionsFromError');
let currentUrl = '';

function normalizeSchoolMealUrl(value) {
  try {
    const url = new URL(value || DEFAULT_SCHOOL_MEAL_URL);
    if (url.origin !== new URL(DEFAULT_SCHOOL_MEAL_URL).origin) return '';
    if (!url.pathname.startsWith(APP_PATH)) {
      url.pathname = APP_PATH;
    }
    url.searchParams.set('compact', '1');
    url.hash = '';
    return url.toString();
  } catch {
    return '';
  }
}

function showError() {
  loading.classList.add('hidden');
  frame.classList.add('hidden');
  errorState.classList.remove('hidden');
}

async function openOptions() {
  await chrome.runtime.openOptionsPage();
}

function setFrameView(view) {
  if (!currentUrl) return;
  const url = new URL(currentUrl);
  url.searchParams.set('compact', '1');
  if (view === 'settings') {
    url.searchParams.set('view', 'settings');
    toggleSettingsButton.textContent = '급식';
    toggleSettingsButton.title = '급식표 보기';
  } else {
    url.searchParams.delete('view');
    toggleSettingsButton.textContent = '설정';
    toggleSettingsButton.title = '알레르기 설정';
  }
  currentUrl = url.toString();
  frame.classList.add('hidden');
  loading.classList.remove('hidden');
  frame.src = currentUrl;
}

async function loadPopup() {
  const result = await chrome.storage.sync.get(STORAGE_KEY);
  const targetUrl = normalizeSchoolMealUrl(result[STORAGE_KEY] || DEFAULT_SCHOOL_MEAL_URL);

  if (!targetUrl) {
    showError();
    return;
  }

  if (!result[STORAGE_KEY]) {
    await chrome.storage.sync.set({ [STORAGE_KEY]: DEFAULT_SCHOOL_MEAL_URL });
  }

  frame.addEventListener('load', () => {
    loading.classList.add('hidden');
    frame.classList.remove('hidden');
  });
  frame.addEventListener('error', showError, { once: true });
  currentUrl = targetUrl;
  frame.src = currentUrl;
}

toggleSettingsButton.addEventListener('click', () => {
  const url = new URL(currentUrl || DEFAULT_SCHOOL_MEAL_URL);
  setFrameView(url.searchParams.get('view') === 'settings' ? 'main' : 'settings');
});
openOptionsFromErrorButton.addEventListener('click', openOptions);
loadPopup();
