module.exports = {
  apps: [
    {
      name: 'playground',
      script: './server/index.js',
      cwd: '/home/ubuntu/playground',
      env_file: '/home/ubuntu/playground/.env',
    },
    {
      name: 'backend',
      script: '/home/ubuntu/playground/backend/build/libs/playground-backend-0.0.1-SNAPSHOT.jar',
      interpreter: 'java',
      interpreter_args: '-jar',
      args: '--app.jwt.secret=playground-jwt-secret-2024-secure-key',
      cwd: '/home/ubuntu/playground',
    },
  ],
};
