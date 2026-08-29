const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const paths = {
  ui: 'bloom-web/src/app/BouquetUI.tsx',
  css: 'bloom-web/src/app/bouquet-system.css',
  showcaseCss: 'bloom-web/src/app/bouquet-showcase.css',
  showcase: 'bloom-web/src/app/BouquetShowcaseApp.tsx',
  detail: 'bloom-web/src/app/BouquetProjectDetailApp.tsx',
  report: 'bloom-web/src/app/BouquetEvaluationReportApp.tsx',
  auth: 'bloom-web/src/app/BouquetAuthApp.tsx',
  luna: 'bloom-web/src/app/LunaBouquetRegisterApp.tsx',
  manage: 'bloom-web/src/app/BouquetManageApp.tsx',
};

function source(path) {
  return fs.existsSync(path) ? fs.readFileSync(path, 'utf8') : '';
}

test('BloomBouquet shares one thin-border editorial visual system', () => {
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
  assert.match(css, /--bouquet-bg:\s*#fff/i);
  assert.match(css, /--bouquet-line:\s*#dfe0e2/i);
  assert.match(css, /--bouquet-accent:\s*#2d5a3d/i);
  assert.match(css, /--bouquet-content:\s*1320px/i);
  assert.match(showcase, /ProjectVisual/);
  assert.match(auth, /BouquetWordmark/);
  assert.match(luna, /Surface/);
  assert.match(manage, /StatusBadge/);
});

test('public showcase is a real project gallery with dedicated detail and agent report views', () => {
  const showcase = source(paths.showcase);
  const detail = source(paths.detail);
  const report = source(paths.report);
  const css = source(paths.showcaseCss);

  assert.match(showcase, /bouquet-project-gallery/);
  assert.match(showcase, /teamFilter/);
  assert.match(showcase, /sortMode/);
  assert.match(showcase, /\/?\?project=\$\{project\.id\}/);
  assert.doesNotMatch(showcase, /bouquet-bento-grid|bouquet-report-sheet|aria-modal="true"/);
  assert.match(detail, /Version History/);
  assert.match(detail, /Agent 평가 리포트 보기/);
  assert.match(detail, /\/api\/bloom-bouquet\/public\/projects\/\$\{projectId\}/);
  assert.match(report, /Senior Agent Review/);
  assert.match(report, /Assessment/);
  assert.match(report, /Recommendation/);
  assert.match(report, /\/api\/bloom-bouquet\/public\/evaluations\/\$\{runId\}/);
  assert.match(css, /grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
});

test('Bouquet auth and Luna handoff use the transplanted editorial surfaces', () => {
  const auth = source(paths.auth);
  const luna = source(paths.luna);
  assert.match(auth, /bouquet-auth-editorial/);
  assert.match(auth, /Field/);
  assert.match(luna, /bouquet-luna-editorial/);
  assert.match(luna, /BloomBouquet에 등록하고 평가 시작/);
});

test('owner management is a dense editorial console while retaining manual fallback flows', () => {
  const manage = source(paths.manage);
  assert.match(manage, /bouquet-console-editorial/);
  assert.match(manage, /bouquet-console-project-row/);
  assert.match(manage, /activePanel/);
  assert.match(manage, /createTeam/);
  assert.match(manage, /createProject/);
  assert.match(manage, /publishSubmission/);
  assert.match(manage, /StatusBadge/);
  assert.doesNotMatch(manage, /aria-label="Project registration stages"/);
});

test('shared UI keeps accessibility and reduced-motion contracts', () => {
  const ui = source(paths.ui);
  const css = source(paths.css);
  assert.match(ui, /HTMLAttributes/);
  assert.match(ui, /\.\.\.rest/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /:focus-visible/);
});

test('public showcase stays free of management entry points and fake imagery', () => {
  const showcase = source(paths.showcase);
  assert.doesNotMatch(showcase, /\?mode=manage|\?mode=auth/);
  assert.doesNotMatch(showcase, /unsplash|picsum/i);
});
