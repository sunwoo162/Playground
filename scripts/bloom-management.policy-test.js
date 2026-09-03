const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const builderPath = 'bloom-web/src/app/BuilderApp.tsx';
const managePath = 'bloom-web/src/app/BouquetManageApp.tsx';
const lunaManagePath = 'bloom-web/src/app/LunaBouquetRegisterApp.tsx';
const lunaParserPath = 'bloom-web/src/app/luna-registration.ts';
const appPath = 'bloom-web/src/app/BloomApp.tsx';
const authPath = 'bloom-web/src/app/BouquetAuthApp.tsx';
const showcasePath = 'bloom-web/src/app/BouquetShowcaseApp.tsx';
const detailPath = 'bloom-web/src/app/BouquetProjectDetailApp.tsx';
const reportPath = 'bloom-web/src/app/BouquetEvaluationReportApp.tsx';
const systemCssPath = 'bloom-web/src/app/bouquet-system.css';
const showcaseCssPath = 'bloom-web/src/app/bouquet-showcase.css';

function source(path) {
  return fs.readFileSync(path, 'utf8');
}

test('Bloom management surface uses bouquet cookie APIs only and stays off the public showcase', () => {
  assert.equal(fs.existsSync(managePath), true, 'BouquetManageApp.tsx must exist');

  const manage = source(managePath);
  const app = source(appPath);
  const showcase = source(showcasePath);

  assert.match(app, /mode\s*===\s*['"]manage['"]/);
  assert.match(app, /<BouquetManageApp\s*\/>/);
  assert.match(manage, /credentials:\s*['"]include['"]/);
  assert.match(manage, /\/api\/bouquet\/auth\/me/);
  assert.match(manage, /\/api\/bloom-bouquet\/teams/);
  assert.match(manage, /\/api\/bloom-bouquet\/projects/);
  assert.match(manage, /evaluationRunId/);
  assert.match(manage, /evaluationStatus\s*!==\s*['"]QUEUED['"]/);
  assert.doesNotMatch(manage, /\/internal\/builder\/worker\//);
  assert.doesNotMatch(manage, /\blocalStorage\b|\bsessionStorage\b/);
  assert.doesNotMatch(showcase, /\?mode=manage|\?mode=auth/);
});

test('public BloomBouquet routes use real detail and report views without mock showcase data', () => {
  const app = source(appPath);
  const showcase = source(showcasePath);

  assert.equal(fs.existsSync(detailPath), true, 'BouquetProjectDetailApp.tsx must exist');
  assert.equal(fs.existsSync(reportPath), true, 'BouquetEvaluationReportApp.tsx must exist');

  const detail = source(detailPath);
  const report = source(reportPath);

  assert.match(app, /searchParams\.get\(['"]project['"]\)/);
  assert.match(app, /searchParams\.get\(['"]report['"]\)/);
  assert.match(app, /<BouquetProjectDetailApp/);
  assert.match(app, /<BouquetEvaluationReportApp/);
  assert.match(showcase, /teamFilter/);
  assert.match(showcase, /sortMode/);
  assert.match(detail, /\/api\/bloom-bouquet\/public\/projects\/\$\{projectId\}/);
  assert.match(report, /\/api\/bloom-bouquet\/public\/evaluations\/\$\{runId\}/);
  assert.doesNotMatch(showcase, /unsplash|images\.unsplash|picsum/i);
  assert.doesNotMatch(showcase, /cardSize\(/);
  assert.doesNotMatch(showcase, /bouquet-bento-grid/);
});

test('BloomBouquet shared visual system uses the editorial neutral and green contract', () => {
  const css = source(systemCssPath);
  const showcaseCss = source(showcaseCssPath);

  assert.match(css, /--bouquet-bg:\s*#fff/i);
  assert.match(css, /--bouquet-accent:\s*#2d5a3d/i);
  assert.match(css, /--bouquet-line:\s*#dfe0e2/i);
  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion/);
  assert.doesNotMatch(css, /--bouquet-radius-xl:\s*40px/);
  assert.match(showcaseCss, /grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
});

test('Luna handoff renders a one-click owner confirmation instead of the three-stage form', () => {
  assert.equal(fs.existsSync(lunaManagePath), true, 'LunaBouquetRegisterApp.tsx must exist');
  assert.equal(fs.existsSync(lunaParserPath), true, 'luna-registration.ts must exist');

  const app = source(appPath);
  const builder = source(builderPath);
  const luna = source(lunaManagePath);
  const parser = source(lunaParserPath);

  assert.match(app, /searchParams\.get\(['"]luna['"]\)/);
  assert.match(app, /<LunaBouquetRegisterApp/);
  assert.match(builder, /bloomBouquetRegistrationUrl/);
  assert.match(builder, /BloomBouquet 등록 열기/);
  assert.match(luna, /\/api\/bloom-bouquet\/luna\/register/);
  assert.match(luna, /BloomBouquet에 등록하고 평가 시작/);
  assert.match(luna, /직접 수정해서 등록/);
  assert.match(luna, /credentials:\s*['"]include['"]/);
  assert.match(luna, /evaluationRunId\s*==\s*null\s*\|\|\s*!body\.submission\.evaluationStatus/);
  assert.doesNotMatch(luna, /evaluationStatus\s*!==\s*['"]QUEUED['"]/);
  assert.match(parser, /schemaVersion\s*!==\s*1/);
  assert.doesNotMatch(luna, /\/internal\/builder\/worker\//);
  assert.doesNotMatch(luna, /\blocalStorage\b|\bsessionStorage\b/);
});

test('Bloom auth return target is symbolic and preserves only bounded Luna handoff data', () => {
  const auth = source(authPath);

  assert.match(auth, /params\.get\(['"]return_to['"]\)\s*===\s*['"]manage['"]/);
  assert.match(auth, /params\.get\(['"]luna['"]\)/);
  assert.match(auth, /\?mode=manage/);
  assert.doesNotMatch(auth, /window\.location\.assign\(returnTarget/);
  assert.doesNotMatch(auth, /window\.location\.href\s*=\s*returnTarget/);
});

test('Builder hero omits the internal runtime pivot note from the user-facing surface', () => {
  const builder = source(builderPath);

  assert.doesNotMatch(builder, /builder-runtime-note/);
  assert.doesNotMatch(builder, /현재 피벗 단계/);
  assert.doesNotMatch(builder, /프로젝트 실행 큐 연결/);
});
