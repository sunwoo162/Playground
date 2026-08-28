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

test('public showcase stays free of management entry points', () => {
  const showcase = source(paths.showcase);
  assert.doesNotMatch(showcase, /\?mode=manage|\?mode=auth/);
});
