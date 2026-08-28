const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const managePath = 'bloom-web/src/app/BouquetManageApp.tsx';
const appPath = 'bloom-web/src/app/BloomApp.tsx';
const authPath = 'bloom-web/src/app/BouquetAuthApp.tsx';
const showcasePath = 'bloom-web/src/app/BouquetShowcaseApp.tsx';

function source(path) {
  return fs.readFileSync(path, 'utf8');
}

test('Bloom management surface uses bouquet cookie APIs only', () => {
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
  assert.match(showcase, /\?mode=manage/);
});

test('Bloom auth return target is symbolic and allowlisted', () => {
  const auth = source(authPath);

  assert.match(auth, /params\.get\(['"]return_to['"]\)\s*===\s*['"]manage['"]/);
  assert.match(auth, /\?mode=manage/);
  assert.doesNotMatch(auth, /window\.location\.assign\(returnTarget/);
  assert.doesNotMatch(auth, /window\.location\.href\s*=\s*returnTarget/);
});
