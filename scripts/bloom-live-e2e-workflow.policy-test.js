const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');

const WORKFLOW = '.github/workflows/bloom-live-e2e.yml';

test('Bloom Live E2E workflow is manual-only and least-privilege', () => {
  assert.equal(fs.existsSync(WORKFLOW), true, 'Bloom Live E2E workflow must exist');
  const source = fs.readFileSync(WORKFLOW, 'utf8');

  assert.match(source, /workflow_dispatch:/);
  assert.doesNotMatch(source, /\bpush:/);
  assert.doesNotMatch(source, /pull_request:/);
  assert.match(source, /permissions:\s*\n\s*contents:\s*read/);
  assert.match(source, /appleboy\/ssh-action@[0-9a-f]{40}/);
});

test('Bloom Live E2E workflow uses the normal Builder API with ephemeral auth', () => {
  const source = fs.readFileSync(WORKFLOW, 'utf8');

  assert.match(source, /\[BLOOM-E2E-SMOKE\]/);
  assert.match(source, /templateId[^\n]+live-e2e/);
  assert.match(source, /POST[^\n]*\/api\/builder\/projects/);
  assert.match(source, /\/api\/builder\/projects\/\$\{PROJECT_ID\}\/runs/);
  assert.match(source, /Authorization: Bearer \$\{TOKEN\}/);
  assert.match(source, /expiresIn:\s*['"]1h['"]/);
  assert.doesNotMatch(source, /echo[^\n]*\$\{?TOKEN\}?/);
  assert.doesNotMatch(source, /GITHUB_ENV[^\n]*TOKEN/);
});

test('Bloom Live E2E failure diagnostics capture local model memory evidence', () => {
  const source = fs.readFileSync(WORKFLOW, 'utf8');

  assert.match(source, /pm2 status bloom-evaluator-llm/);
  assert.match(source, /pm2 logs bloom-evaluator-llm --lines 160 --nostream/);
  assert.match(source, /free -m/);
  assert.match(source, /swapon --show/);
  assert.match(source, /dmesg[^\n]*out of memory\|oom\|killed process/i);
});
