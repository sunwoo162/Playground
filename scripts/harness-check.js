const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function readText(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function directDirectories(relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) return [];
  return fs
    .readdirSync(absolutePath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

const failures = [];
const info = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

const pkg = readJson('package.json');
const serverSource = readText('server/index.js');
const bloomIndex = readText('bloom-web/index.html');
const appDirectories = directDirectories('apps');
const builtIndex = exists('dist/index.html') ? readText('dist/index.html') : '';

assert(!exists('playground-web'), 'legacy playground-web source must be removed.');
assert(
  appDirectories.length === 1 && appDirectories[0] === 'desktop',
  `only apps/desktop may remain; found: ${appDirectories.join(', ') || '(none)'}`,
);
assert(Boolean(pkg.scripts?.['build:bloom-web']), 'build:bloom-web script is required.');
assert(
  pkg.scripts?.['build:bloom-web']?.includes('--outDir ../dist'),
  'build:bloom-web must emit BloomBouquet directly to root dist/.',
);
assert(!pkg.scripts?.['build:playground-web'], 'legacy build:playground-web script must be removed.');
assert(!pkg.scripts?.['build:apps'], 'legacy build:apps script must be removed.');
assert(
  pkg.scripts?.build === 'pnpm run build:bloom-web',
  'root build script must build BloomBouquet only.',
);
assert(!/["']\/apps\//.test(serverSource), 'legacy /apps/* static routes must be removed from server/index.js.');
assert(bloomIndex.includes('<title>BloomBouquet</title>'), 'bloom-web shell title must be BloomBouquet.');
assert(exists('dist/index.html'), 'BloomBouquet production build must create dist/index.html.');
assert(builtIndex.includes('<title>BloomBouquet</title>'), 'dist/index.html must be the BloomBouquet shell.');

info.push(`apps/* directories: ${appDirectories.join(', ') || '(none)'}`);
info.push(`root build: ${pkg.scripts?.build || '(missing)'}`);
info.push(`Bloom build: ${pkg.scripts?.['build:bloom-web'] || '(missing)'}`);
info.push(`dist/index.html: ${exists('dist/index.html') ? 'present' : 'missing'}`);

console.log('BloomBouquet production harness check');
console.log('');
for (const line of info) console.log(`INFO  ${line}`);

if (failures.length) {
  console.log('');
  for (const failure of failures) console.log(`FAIL  ${failure}`);
  process.exitCode = 1;
} else {
  console.log('');
  console.log('PASS  BloomBouquet production invariants passed.');
}
