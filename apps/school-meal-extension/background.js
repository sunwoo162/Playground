const STORAGE_KEY = 'schoolMealUrl';
const APP_PATH = '/apps/school-meal/';
const DEFAULT_SCHOOL_MEAL_URL = 'https://playground.https.gsmsv.site/apps/school-meal/';

function normalizeSchoolMealUrl(value) {
  if (!value) return '';

  try {
    const url = new URL(value);
    if (!url.pathname.startsWith(APP_PATH)) {
      url.pathname = APP_PATH;
      url.search = '';
      url.hash = '';
    }
    url.searchParams.set('compact', '1');
    return url.toString();
  } catch {
    return '';
  }
}

async function getStoredUrl() {
  const result = await chrome.storage.sync.get(STORAGE_KEY);
  return normalizeSchoolMealUrl(result[STORAGE_KEY]);
}

chrome.action.onClicked.addListener(async () => {
  const storedUrl = await getStoredUrl();
  const targetUrl = storedUrl || normalizeSchoolMealUrl(DEFAULT_SCHOOL_MEAL_URL);

  if (!storedUrl) {
    await chrome.storage.sync.set({ [STORAGE_KEY]: DEFAULT_SCHOOL_MEAL_URL });
  }

  await chrome.windows.create({
    url: targetUrl,
    type: 'popup',
    width: 450,
    height: 690,
  });
});
