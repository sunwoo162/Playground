const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');

const ACTIVE_PRODUCTION_FILES = [
  'ecosystem.config.js',
  '.github/workflows/deploy.yml',
  '.github/workflows/deploy-bloom-worker.yml',
];

test('active production runtime uses the BloomBouquet server directory', () => {
  for (const file of ACTIVE_PRODUCTION_FILES) {
    const source = fs.readFileSync(file, 'utf8');
    assert.match(source, /\/home\/ubuntu\/bloombouquet|~\/bloombouquet/, `${file} must reference the BloomBouquet server directory`);
    assert.doesNotMatch(source, /\/home\/ubuntu\/playground|~\/playground/, `${file} must not reference the legacy Playground server directory`);
  }
});
