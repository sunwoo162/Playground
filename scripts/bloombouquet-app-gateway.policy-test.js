const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');

test('public showcase is a launcher, not a login surface', () => {
  const source = fs.readFileSync('bloom-web/src/app/BouquetShowcaseApp.tsx', 'utf8');
  assert.doesNotMatch(source, /\?mode=auth/);
  assert.doesNotMatch(source, /꽃다발 로그인/);
  assert.doesNotMatch(source, /\?mode=manage/);
  assert.doesNotMatch(source, /target="_blank"/);
});

test('gateway preserves legacy routes and includes the machine-owned Luna app registry', () => {
  const nginx = fs.readFileSync('deploy/nginx/bloombouquet.conf', 'utf8');
  assert.match(nginx, /server_name playground\.https\.gsmsv\.site bloombouquet\.https\.gsmsv\.site;/);
  assert.match(nginx, /include \/etc\/nginx\/bloombouquet-apps\.generated\.conf;/);
  assert.match(nginx, /location = \/apps\/evidence-vault/);
  assert.match(nginx, /return 308 \/apps\/evidence-vault\//);
  assert.match(nginx, /location \^~ \/apps\/evidence-vault\//);
  assert.match(nginx, /proxy_pass http:\/\/127\.0\.0\.1:3011;/);
  assert.match(nginx, /location = \/apps\/beriday/);
  assert.match(nginx, /return 308 \/apps\/beriday\//);
  assert.match(nginx, /location \^~ \/apps\/beriday\//);
  assert.match(nginx, /proxy_pass http:\/\/127\.0\.0\.1:3012\//);
  assert.match(nginx, /location \/[\s\S]*proxy_pass http:\/\/127\.0\.0\.1:3000;/);
  assert.doesNotMatch(nginx, /proxy_set_header X-Forwarded-Proto \$scheme/);
  assert.equal((nginx.match(/proxy_set_header X-Forwarded-Proto https;/g) ?? []).length, 3);
});

test('stable parent gateway deployment stays manual while Luna owns only the generated include', () => {
  const workflow = fs.readFileSync('.github/workflows/deploy-bloombouquet-app-gateway.yml', 'utf8');
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /push:/);
  assert.doesNotMatch(workflow, /pull_request:/);
});

test('Beriday deployment is manual-only and targets the fixed production process', () => {
  const workflowPath = '.github/workflows/deploy-beriday.yml';
  assert.equal(fs.existsSync(workflowPath), true, 'deploy-beriday.yml must exist');
  const workflow = fs.readFileSync(workflowPath, 'utf8');

  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /push:/);
  assert.doesNotMatch(workflow, /pull_request:/);
  assert.match(workflow, /\/home\/ubuntu\/bloombouquet\/apps\/beriday/);
  assert.match(workflow, /git reset --hard origin\/main/);
  assert.match(workflow, /npm install/);
  assert.doesNotMatch(workflow, /npm ci/);
  assert.match(workflow, /npm run build/);
  assert.match(workflow, /pm2 serve dist 3012 --spa --name beriday/);
  assert.match(workflow, /http:\/\/127\.0\.0\.1:3012\//);
  assert.match(workflow, /http:\/\/127\.0\.0\.1:3012\/data\/runtime\/manifest\.json/);
});

test('gateway deployment targets the actual enabled default config with a guarded rollback', () => {
  const workflow = fs.readFileSync('.github/workflows/deploy-bloombouquet-app-gateway.yml', 'utf8');

  assert.match(workflow, /appleboy\/ssh-action@029f5b4aeeeb58fdfe1410a5d17f967dacf36262/);
  assert.match(workflow, /http:\/\/127\.0\.0\.1:3000\//);
  assert.match(workflow, /http:\/\/127\.0\.0\.1:3011\/apps\/evidence-vault\/api\/health/);
  assert.match(workflow, /http:\/\/127\.0\.0\.1:3012\//);
  assert.match(workflow, /http:\/\/127\.0\.0\.1:3012\/data\/runtime\/manifest\.json/);
  assert.match(workflow, /ENABLED_CONFIG="\/etc\/nginx\/sites-enabled\/default"/);
  assert.match(workflow, /readlink -f "\$ENABLED_CONFIG"/);
  assert.match(workflow, /proxy_pass http:\/\/127\.0\.0\.1:3000;/);
  assert.match(workflow, /Refusing gateway mutation/);
  assert.doesNotMatch(workflow, /MATCH_COUNT/);
  assert.match(workflow, /sudo cat "\$TARGET_CONFIG" > "\$BACKUP"/);
  assert.match(workflow, /trap restore_gateway EXIT/);
  assert.match(workflow, /sudo nginx -t/);
  assert.match(workflow, /sudo systemctl reload nginx/);
  assert.match(workflow, /https:\/\/\$\{DOMAIN\}\/apps\/evidence-vault\/api\/health/);
  assert.match(workflow, /https:\/\/\$\{DOMAIN\}\/apps\/beriday\//);
  assert.match(workflow, /https:\/\/\$\{DOMAIN\}\/apps\/beriday\/data\/runtime\/manifest\.json/);
});
