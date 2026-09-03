const fs = require('node:fs/promises');

async function exists(fsImpl, filePath) {
  try {
    await fsImpl.access(filePath);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

function createBuilderDrainState({ drainFile, busyFile, fsImpl = fs }) {
  if (!drainFile || !busyFile) throw new Error('Builder drain and busy file paths are required.');
  return {
    isDraining: () => exists(fsImpl, drainFile),
    async withBusy(operation) {
      await fsImpl.writeFile(busyFile, `${process.pid}\n`, 'utf8');
      try {
        return await operation();
      } finally {
        await fsImpl.rm(busyFile, { force: true });
      }
    },
  };
}

module.exports = { createBuilderDrainState };
