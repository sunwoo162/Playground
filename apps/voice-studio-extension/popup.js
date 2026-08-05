const STUDIO_URL = 'https://playground.https.gsmsv.site/apps/voice-studio/';

document.getElementById('openStudio').addEventListener('click', async () => {
  await chrome.tabs.create({ url: STUDIO_URL });
  window.close();
});
