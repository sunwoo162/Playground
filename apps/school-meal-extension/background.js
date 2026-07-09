const STORAGE_KEY = 'schoolMealUrl';
const APP_PATH = '/apps/school-meal/';

function normalizeSchoolMealUrl(value) {
  if (!value) return '';

  try {
    const url = new URL(value);
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

async function getStoredUrl() {
  const result = await chrome.storage.sync.get(STORAGE_KEY);
  return normalizeSchoolMealUrl(result[STORAGE_KEY]);
}

function getUrlFromTab(tab) {
  if (!tab?.url) return '';

  try {
    const url = new URL(tab.url);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    return `${url.origin}${APP_PATH}`;
  } catch {
    return '';
  }
}

chrome.action.onClicked.addListener(async (tab) => {
  const storedUrl = await getStoredUrl();
  const targetUrl = storedUrl || getUrlFromTab(tab);

  if (!targetUrl) {
    await chrome.runtime.openOptionsPage();
    return;
  }

  if (!storedUrl) {
    await chrome.storage.sync.set({ [STORAGE_KEY]: targetUrl });
  }

  await chrome.windows.create({
    url: targetUrl,
    type: 'popup',
    width: 980,
    height: 760,
  });
});
