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

function getPortalAppIds() {
  const source = readText('playground-web/src/entities/app-item/model/apps.ts');
  return new Set(Array.from(source.matchAll(/id:\s*['"]([^'"]+)['"]/g)).map((match) => match[1]));
}

function getServerAppRoutes() {
  const source = readText('server/index.js');
  return new Set(Array.from(source.matchAll(/['"]\/apps\/([^'"/*]+)(?:\/\*)?['"]/g)).map((match) => match[1]));
}

function getBuildScriptAppIds() {
  const pkg = readJson('package.json');
  const buildApps = pkg.scripts?.['build:apps'] || '';
  const ids = [
    ...Array.from(buildApps.matchAll(/--prefix\s+apps\/([^\s&]+)/g)),
    ...Array.from(buildApps.matchAll(/--filter\s+(?:\.\/)?apps\/([^\s&]+)/g)),
  ].map((match) => match[1]);
  return new Set(ids);
}

function classifyApp(app) {
  const appPath = `apps/${app.id}`;
  const packagePath = `${appPath}/package.json`;
  const hasPackage = exists(packagePath);
  const packageJson = hasPackage ? readJson(packagePath) : null;
  return {
    ...app,
    appPath,
    hasDirectory: exists(appPath),
    hasPackage,
    hasBuildScript: Boolean(packageJson?.scripts?.build),
    hasDist: exists(`${appPath}/dist`),
    hasProductDoc: exists(`${appPath}/README.md`) || exists(`${appPath}/PRODUCT.md`),
  };
}

const registry = readJson('docs/app-registry.json');
const rootPackage = readJson('package.json');
const portalIds = getPortalAppIds();
const serverRoutes = getServerAppRoutes();
const buildScriptIds = getBuildScriptAppIds();
const registryIds = new Set(registry.apps.map((app) => app.id));

const failures = [];
const warnings = [];
const info = [];

if (!rootPackage.scripts?.build || !rootPackage.scripts?.['build:apps']) {
  failures.push('Root package.json must define build and build:apps scripts.');
}

for (const app of registry.apps.map(classifyApp)) {
  if (!app.hasDirectory) {
    failures.push(`${app.id}: registry entry points to a missing apps/${app.id} directory.`);
    continue;
  }

  if (!portalIds.has(app.id)) {
    warnings.push(`${app.id}: registered product is not listed in the portal APPS array.`);
  }

  if (!serverRoutes.has(app.id)) {
    warnings.push(`${app.id}: registered product has no /apps/${app.id} static route in server/index.js.`);
  }

  if (app.hasPackage && !app.hasBuildScript) {
    failures.push(`${app.id}: package.json exists but has no build script.`);
  }

  if (app.hasPackage && app.hasBuildScript && !buildScriptIds.has(app.id)) {
    warnings.push(`${app.id}: buildable app is not included in root build:apps.`);
  }

  if (app.priority <= 2 && app.status !== 'disabled' && app.hasPackage && !app.hasDist) {
    warnings.push(`${app.id}: priority ${app.priority} app has no dist directory yet. Run its build before deployment.`);
  }

  if (app.priority <= 2 && app.hasPackage && !app.hasProductDoc) {
    warnings.push(`${app.id}: priority ${app.priority} app has no README.md or PRODUCT.md.`);
  }
}

for (const id of portalIds) {
  if (id.startsWith('cs')) continue;
  if (!registryIds.has(id)) {
    warnings.push(`${id}: portal exposes an app that is missing from docs/app-registry.json.`);
  }
}

for (const id of buildScriptIds) {
  if (!registryIds.has(id)) {
    warnings.push(`${id}: root build:apps includes an app that is missing from docs/app-registry.json.`);
  }
}

info.push(`Registry apps: ${registry.apps.length}`);
info.push(`Portal app ids: ${portalIds.size}`);
info.push(`Server /apps routes: ${serverRoutes.size}`);
info.push(`Root build:apps entries: ${buildScriptIds.size}`);

console.log('Playground harness check');
console.log('');
for (const line of info) console.log(`INFO  ${line}`);

if (warnings.length) {
  console.log('');
  for (const warning of warnings) console.log(`WARN  ${warning}`);
}

if (failures.length) {
  console.log('');
  for (const failure of failures) console.log(`FAIL  ${failure}`);
  process.exitCode = 1;
} else {
  console.log('');
  console.log('PASS  Harness invariants passed.');
}
