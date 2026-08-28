const fs = require('fs');
const path = require('path');

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .reduce((env, line) => {
      const index = line.indexOf('=');
      const key = line.slice(0, index).trim();
      const value = line.slice(index + 1).trim().replace(/^['"]|['"]$/g, '');
      if (key) env[key] = value;
      return env;
    }, {});
}

const root = __dirname;
const sharedEnv = readEnvFile(path.join(root, '.env'));
const backendEnv = readEnvFile(path.join(root, '.env.backend'));
const workerToken = backendEnv.BUILDER_WORKER_TOKEN || sharedEnv.BUILDER_WORKER_TOKEN || '';

module.exports = {
  apps: [
    {
      name: 'playground',
      script: './server/index.js',
      cwd: '/home/ubuntu/playground',
      env_file: '/home/ubuntu/playground/.env',
      env: sharedEnv,
    },
    {
      name: 'backend',
      script: '/home/ubuntu/playground/backend/build/libs/playground-backend-0.0.1-SNAPSHOT.jar',
      interpreter: 'java',
      interpreter_args: '-jar',
      cwd: '/home/ubuntu/playground',
      env: {
        ...sharedEnv,
        ...backendEnv,
        JWT_SECRET: sharedEnv.JWT_SECRET || backendEnv.JWT_SECRET || '',
        BUILDER_WORKER_TOKEN: workerToken,
        APP_CORS_ALLOWED_ORIGINS: 'https://bloombouquet.https.gsmsv.site',
        HIBERNATE_DDL_AUTO: 'validate',
        FLYWAY_ENABLED: 'true',
      },
    },
    {
      name: 'bloom-worker',
      script: './bloom-worker/run.js',
      cwd: '/home/ubuntu/playground',
      autorestart: true,
      restart_delay: 5000,
      max_restarts: 20,
      env: {
        ...sharedEnv,
        NODE_ENV: 'production',
        BUILDER_WORKER_TOKEN: workerToken,
        BLOOM_WORKER_MODE: sharedEnv.BLOOM_WORKER_MODE || 'evaluator',
        BLOOM_API_BASE_URL: sharedEnv.BLOOM_API_BASE_URL || 'http://localhost:8080',
        BLOOM_GITHUB_ORGANIZATION: sharedEnv.BLOOM_GITHUB_ORGANIZATION || 'sunwoo162',
        BLOOM_WORKSPACE_ROOT: sharedEnv.BLOOM_WORKSPACE_ROOT || '/home/ubuntu/bloom-workspaces',
        BLOOM_WORKER_ID: sharedEnv.BLOOM_WORKER_ID || 'bloom-worker-production',
        BLOOM_TEAM_ID: sharedEnv.BLOOM_TEAM_ID || 'rose',
        BLOOM_TEAM_NAME: sharedEnv.BLOOM_TEAM_NAME || 'Rose',
      },
    },
  ],
};
