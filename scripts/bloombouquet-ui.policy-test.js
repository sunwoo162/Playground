const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const paths = {
  ui: 'bloom-web/src/app/BouquetUI.tsx',
  css: 'bloom-web/src/app/bouquet-system.css',
  showcaseCss: 'bloom-web/src/app/bouquet-showcase.css',
  authCss: 'bloom-web/src/app/bouquet-auth.css',
  lunaCss: 'bloom-web/src/app/luna-bouquet-register.css',
  manageCss: 'bloom-web/src/app/bouquet-manage.css',
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
  assert.match(css, /--bouquet-content:\s*1280px/i);
  assert.match(css, /bouquet-kicker\s*\{[^}]*font-size:\s*11px/s);
  assert.match(css, /bouquet-metric span\s*\{[^}]*font-size:\s*10px/s);
  assert.match(css, /bouquet-status-badge\s*\{[^}]*font-size:\s*10px/s);
  assert.match(css, /bouquet-score-badge span\s*\{[^}]*font-size:\s*10px/s);
  assert.match(showcase, /ProjectVisual/);
  assert.match(auth, /BouquetWordmark/);
  assert.match(luna, /Surface/);
  assert.match(manage, /StatusBadge/);
});

test('public showcase uses a balanced product-site typography and layout scale', () => {
  const css = source(paths.showcaseCss);

  assert.match(css, /bouquet-showcase-shell\s*\{[^}]*padding:\s*0 32px 88px/s);
  assert.match(css, /bouquet-showcase-hero\s*\{[^}]*padding:\s*clamp\(64px,\s*7vw,\s*84px\) 0 38px/s);
  assert.match(css, /bouquet-showcase-intro h1\s*\{[^}]*font-size:\s*clamp\(44px,\s*5\.4vw,\s*72px\)[^}]*line-height:\s*1\.02[^}]*letter-spacing:\s*-\.04em/s);
  assert.match(css, /bouquet-showcase-copy\s*\{[^}]*max-width:\s*620px[^}]*font-size:\s*16px[^}]*line-height:\s*1\.7/s);
  assert.match(css, /bouquet-team-filter button,[\s\S]*?font-size:\s*11px/s);
  assert.match(css, /bouquet-project-gallery\s*\{[^}]*gap:\s*36px 28px/s);
  assert.match(css, /bouquet-project-heading p\s*\{[^}]*font-size:\s*14px[^}]*line-height:\s*1\.65/s);
  assert.match(css, /bouquet-project-meta span\s*\{[^}]*font-size:\s*11px/s);
  assert.match(css, /bouquet-project-card \.bouquet-score-badge strong\s*\{\s*font-size:\s*28px/s);
  assert.match(css, /@media \(max-width:\s*700px\)[\s\S]*?bouquet-showcase-intro h1\s*\{\s*font-size:\s*clamp\(38px,\s*11vw,\s*48px\)/s);
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
  const authCss = source(paths.authCss);
  const lunaCss = source(paths.lunaCss);

  assert.match(auth, /bouquet-auth-editorial/);
  assert.match(auth, /Field/);
  assert.match(luna, /bouquet-luna-editorial/);
  assert.match(luna, /BloomBouquet에 등록하고 평가 시작/);
  assert.doesNotMatch(authCss, /radial-gradient|border-radius:\s*999px/i);
  assert.doesNotMatch(lunaCss, /rgba\(23,\s*21,\s*24,\s*\.045\)|box-shadow:/i);
});

test('owner management is a dense editorial console while retaining manual fallback flows', () => {
  const manage = source(paths.manage);
  const manageCss = source(paths.manageCss);

  assert.match(manage, /bouquet-console-editorial/);
  assert.match(manage, /bouquet-console-project-row/);
  assert.match(manage, /activePanel/);
  assert.match(manage, /createTeam/);
  assert.match(manage, /createProject/);
  assert.match(manage, /publishSubmission/);
  assert.match(manage, /StatusBadge/);
  assert.doesNotMatch(manage, /aria-label="Project registration stages"/);
  assert.doesNotMatch(manageCss, /radial-gradient|box-shadow:\s*var\(--bouquet-shadow\)/i);
  assert.match(manageCss, /bouquet-console-project-row/);
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
