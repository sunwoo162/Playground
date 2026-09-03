const ecosystem = require('./ecosystem.config.js');

const apps = ecosystem.apps.filter((app) => app.name === 'backend');
if (apps.length !== 1) {
  throw new Error('Expected exactly one backend PM2 app.');
}

module.exports = { apps };
