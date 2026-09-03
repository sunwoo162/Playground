const ecosystem = require('./ecosystem.config.js');

const apps = ecosystem.apps.filter((app) => app.name === 'playground');
if (apps.length !== 1) {
  throw new Error('Expected exactly one playground PM2 app.');
}

module.exports = { apps };
