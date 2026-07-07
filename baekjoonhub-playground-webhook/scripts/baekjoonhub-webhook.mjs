import crypto from 'node:crypto';
import fs from 'node:fs';

const DEFAULT_PLAYGROUND_URL = 'https://your-playground.example.com';
const IGNORED_EXTENSIONS = new Set([
  '.md', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.txt',
]);

function readEvent() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath || !fs.existsSync(eventPath)) return null;
  return JSON.parse(fs.readFileSync(eventPath, 'utf8'));
}

function extname(filePath) {
  const match = filePath.match(/(\.[^./\\]+)$/);
  return match ? match[1].toLowerCase() : '';
}

function isCodePath(filePath) {
  if (!filePath || filePath.includes('/.github/')) return false;
  if (IGNORED_EXTENSIONS.has(extname(filePath))) return false;
  return /백준|baekjoon|프로그래머스|programmers/i.test(filePath);
}

function cleanTitle(value) {
  return decodeURIComponent(String(value || ''))
    .replace(/^[0-9]+\.\s*/, '')
    .replace(/\u2005/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseBaekjoon(parts) {
  const level = parts[1] || '';
  const problemDir = parts[2] || parts[parts.length - 2] || '';
  const match = problemDir.match(/^(\d+)\.?\s*(.+)?$/);

  return {
    platform: 'baekjoon',
    level,
    number: match?.[1] || '',
    title: cleanTitle(match?.[2] || problemDir),
  };
}

function parseProgrammers(parts) {
  const levelPart = parts[1] || '';
  const problemDir = parts[2] || parts[parts.length - 2] || '';
  const level = levelPart.replace(/^lv\.?/i, '').replace(/^level/i, '');

  return {
    platform: 'programmers',
    level,
    number: '',
    title: cleanTitle(problemDir),
  };
}

function parseProblem(filePath) {
  const normalized = filePath.replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);
  const root = parts[0]?.toLowerCase() || '';

  if (root.includes('백준') || root.includes('baekjoon')) {
    return { ...parseBaekjoon(parts), path: normalized };
  }

  if (root.includes('프로그래머스') || root.includes('programmers')) {
    return { ...parseProgrammers(parts), path: normalized };
  }

  return null;
}

function changedFiles(event) {
  const files = new Set();
  for (const commit of event?.commits || []) {
    for (const key of ['added', 'modified']) {
      for (const filePath of commit[key] || []) files.add(filePath);
    }
  }
  return [...files].filter(isCodePath);
}

function buildUrl(item) {
  const base = (process.env.PLAYGROUND_URL || DEFAULT_PLAYGROUND_URL).replace(/\/$/, '');
  const repo = process.env.GITHUB_REPOSITORY || '';
  const commitSha = process.env.GITHUB_SHA || '';
  const params = new URLSearchParams({
    title: item.title,
    platform: item.platform,
    level: item.level,
    number: item.number,
    repo,
    commitSha,
  });

  return `${base}/apps/coding-log/?${params.toString()}`;
}

async function postWebhook(payload) {
  const webhookUrl = process.env.WEBHOOK_URL;
  if (!webhookUrl) return;

  const body = JSON.stringify(payload);
  const headers = { 'content-type': 'application/json' };
  const secret = process.env.WEBHOOK_SECRET;

  if (secret) {
    const signature = crypto.createHmac('sha256', secret).update(body).digest('hex');
    headers['x-playground-signature'] = `sha256=${signature}`;
  }

  const res = await fetch(webhookUrl, { method: 'POST', headers, body });
  if (!res.ok) {
    throw new Error(`Webhook failed: ${res.status} ${await res.text()}`);
  }
}

function writeSummary(items) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  const lines = [
    '# Playground Coding Log',
    '',
    items.length ? 'Detected solved problem files:' : 'No BaekjoonHub problem file changes detected.',
    '',
  ];

  for (const item of items) {
    lines.push(`- [${item.platform} ${item.number ? `${item.number} ` : ''}${item.title}](${item.url})`);
    lines.push(`  - Path: \`${item.path}\``);
  }

  const output = `${lines.join('\n')}\n`;
  if (summaryPath) fs.appendFileSync(summaryPath, output);
  console.log(output);
}

async function main() {
  const event = readEvent();
  const files = changedFiles(event);
  const items = files
    .map(parseProblem)
    .filter(Boolean)
    .map(item => ({ ...item, url: buildUrl(item) }));

  const payload = {
    repository: process.env.GITHUB_REPOSITORY || '',
    commitSha: process.env.GITHUB_SHA || '',
    sender: process.env.GITHUB_ACTOR || event?.sender?.login || '',
    items,
  };

  writeSummary(items);

  if (items.length > 0) {
    await postWebhook(payload);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

