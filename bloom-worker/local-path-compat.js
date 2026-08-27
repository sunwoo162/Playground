"use strict";

const fs = require("node:fs");
const path = require("node:path");

const originalRealpathSync = fs.realpathSync.bind(fs);

function resolveThroughExistingAncestor(input) {
  const absolute = path.resolve(String(input));
  let current = absolute;
  const suffix = [];

  while (!fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) throw new Error(`No existing ancestor for path: ${absolute}`);
    suffix.unshift(path.basename(current));
    current = parent;
  }

  const realAncestor = originalRealpathSync(current);
  return path.join(realAncestor, ...suffix);
}

fs.realpathSync = function bloomLocalRealpathSync(input, options) {
  try {
    return originalRealpathSync(input, options);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    return resolveThroughExistingAncestor(input);
  }
};

module.exports = { resolveThroughExistingAncestor };
