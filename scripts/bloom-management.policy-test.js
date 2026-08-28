const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const managePath = 'bloom-web/src/app/BouquetManageApp.tsx';
const lunaManagePath = 'bloom-web/src/app/LunaBouquetRegisterApp.tsx';
const lunaParserPath = 'bloom-web/src/app/luna-registration.ts';
const appPath = 'bloom-web/src/app/BloomApp.tsx';
const authPath = 'bloom-web/src/app/BouquetAuthApp.tsx';
const showcasePath = 'bloom-web/src/app/BouquetShowcaseApp.tsx';

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
  assert.doesNotMatch(showcase, /\?mode=manage/);
});

test('Luna handoff renders a one-click owner confirmation instead of the three-stage form', () => {
  assert.equal(fs.existsSync(lunaManagePath), true, 'LunaBouquetRegisterApp.tsx must exist');
  assert.equal(fs.existsSync(lunaParserPath), true, 'luna-registration.ts must exist');

  const app = source(appPath);
  const luna = source(lunaManagePath);
  const parser = source(lunaParserPath);

  assert.match(app, /searchParams\.get\(['"]luna['"]\)/);
  assert.match(app, /<LunaBouquetRegisterApp/);
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
