const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const envPath = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(process.cwd(), '.env');

function isValidSecret(secret) {
  return typeof secret === 'string'
    && secret.length >= 32
    && !secret.includes('playground-jwt-secret-2024');
}

function readEnvValue(content, key) {
  const line = content
    .split(/\r?\n/)
    .find((entry) => entry.trim().startsWith(`${key}=`));
  if (!line) return '';
  return line.slice(line.indexOf('=') + 1).trim().replace(/^['"]|['"]$/g, '');
}

function upsertEnvValue(content, key, value) {
  const lines = content.split(/\r?\n/);
  const index = lines.findIndex((entry) => entry.trim().startsWith(`${key}=`));
  if (index >= 0) {
    lines[index] = `${key}=${value}`;
  } else {
    if (lines.length > 0 && lines[lines.length - 1] !== '') lines.push('');
    lines.push(`${key}=${value}`);
  }
  return `${lines.join('\n').replace(/\n+$/g, '')}\n`;
}

if (!fs.existsSync(envPath)) {
  console.error(`Production env file is missing: ${envPath}`);
  process.exit(1);
}

const content = fs.readFileSync(envPath, 'utf8');
const currentSecret = readEnvValue(content, 'JWT_SECRET');

if (isValidSecret(currentSecret)) {
  console.log('Production JWT secret is valid.');
  process.exit(0);
}

const nextSecret = crypto.randomBytes(48).toString('base64url');
const updated = upsertEnvValue(content, 'JWT_SECRET', nextSecret);
fs.writeFileSync(envPath, updated, { mode: 0o600 });
console.log('Production JWT secret was regenerated and persisted.');
