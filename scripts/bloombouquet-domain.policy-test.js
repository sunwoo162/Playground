const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const NEW_ORIGIN = 'https://bloombouquet.https.gsmsv.site';
const OLD_ORIGIN = 'https://playground.https.gsmsv.site';

const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('active BloomBouquet production contracts use the replacement domain', () => {
  const activeFiles = [
    'README.md',
    'backend/src/main/resources/application.yml',
    'scripts/notion-sync.js',
    '.github/workflows/deploy.yml',
  ];

  for (const file of activeFiles) {
    const source = read(file);
    assert.equal(
      source.includes(OLD_ORIGIN),
      false,
      `${file} must not reference the retired Playground origin`,
    );
  }

  assert.match(read('README.md'), /https:\/\/bloombouquet\.https\.gsmsv\.site\//);
  assert.match(
    read('backend/src/main/resources/application.yml'),
    /allowed-origins:\s*https:\/\/bloombouquet\.https\.gsmsv\.site/,
  );
  assert.match(read('scripts/notion-sync.js'), /https:\/\/bloombouquet\.https\.gsmsv\.site/);

  const deploy = read('.github/workflows/deploy.yml');
  assert.match(deploy, /bloombouquet\.https\.gsmsv\.site/);
  assert.match(deploy, /Verify BloomBouquet public domain/);
});
