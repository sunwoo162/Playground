const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const paths = {
  ui: 'bloom-web/src/app/BouquetUI.tsx',
  css: 'bloom-web/src/app/bouquet-system.css',
  showcase: 'bloom-web/src/app/BouquetShowcaseApp.tsx',
  auth: 'bloom-web/src/app/BouquetAuthApp.tsx',
  luna: 'bloom-web/src/app/LunaBouquetRegisterApp.tsx',
  manage: 'bloom-web/src/app/BouquetManageApp.tsx',
};

function source(path) {
  return fs.existsSync(path) ? fs.readFileSync(path, 'utf8') : '';
}

test('BloomBouquet shares one premium visual system', () => {
  assert.equal(fs.existsSync(paths.ui), true, 'BouquetUI.tsx must exist');
  assert.equal(fs.existsSync(paths.css), true, 'bouquet-system.css must exist');

  const ui = source(paths.ui);
  const css = source(paths.css);
  const showcase = source(paths.showcase);
  const auth = source(paths.auth);
  const luna = source(paths.luna);
  const manage = source(paths.manage);

  for (const name of ['BouquetWordmark', 'Surface', 'Metric', 'StatusBadge', 'ScoreBadge', 'PrimaryButton', 'SecondaryButton', 'Field', 'EmptyState', 'ProjectVisual']) {
    assert.match(ui, new RegExp(`export function ${name}`));
  }
  assert.match(css, /--bouquet-bg:/);
  assert.match(css, /--bouquet-ink:/);
  assert.match(css, /--bouquet-accent:/);
  assert.match(css, /:focus-visible/);
  assert.match(showcase, /ProjectVisual/);
  assert.match(auth, /BouquetWordmark/);
  assert.match(luna, /Surface/);
  assert.match(manage, /StatusBadge/);
});

test('public showcase uses editorial bento hierarchy and premium review sheet', () => {
  const showcase = source(paths.showcase);
  assert.match(showcase, /bouquet-showcase-header/);
  assert.match(showcase, /bouquet-bento-grid/);
  assert.match(showcase, /bouquet-project-featured/);
  assert.match(showcase, /프로젝트 보기/);
  assert.match(showcase, /평가 보기/);
  assert.match(showcase, /bouquet-report-sheet/);
  assert.match(showcase, /bouquet-report-sticky/);
  assert.match(showcase, /bouquet-key-findings/);
  assert.match(showcase, /aria-modal="true"/);
  assert.match(showcase, /aria-label="Close report"/);
});

test('Bouquet auth and Luna handoff use shared editorial surfaces', () => {
  const auth = source(paths.auth);
  const luna = source(paths.luna);
  assert.match(auth, /bouquet-auth-editorial/);
  assert.match(auth, /Field/);
  assert.match(luna, /luna-register-summary-grid/);
  assert.match(luna, /BloomBouquet에 등록하고 평가 시작/);
});

test('owner management uses a focused rail workspace', () => {
  const manage = source(paths.manage);
  assert.match(manage, /bouquet-manage-rail/);
  assert.match(manage, /bouquet-manage-workspace/);
  assert.match(manage, /activePanel/);
  assert.match(manage, /StatusBadge/);
  assert.doesNotMatch(manage, /aria-label="Project registration stages"/);
});

test('shared UI keeps accessibility and reduced-motion contracts', () => {
  const css = source(paths.css);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /:focus-visible/);
});

test('public showcase stays free of management entry points', () => {
  const showcase = source(paths.showcase);
  assert.doesNotMatch(showcase, /\?mode=manage|\?mode=auth/);
});
