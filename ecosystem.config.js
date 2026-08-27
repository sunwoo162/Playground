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
      },
    },
  ],
};
