const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const outputDir = path.resolve(__dirname, '../.tmp/bloom-policy-tests')
const tests = fs.readdirSync(outputDir)
  .filter((name) => name.endsWith('.policy-test.js'))
  .sort()

if (tests.length === 0) {
  throw new Error(`No Bloom policy tests found in ${outputDir}`)
}

for (const test of tests) {
  const result = spawnSync(process.execPath, [path.join(outputDir, test)], {
    stdio: 'inherit',
  })
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

console.log(`Bloom policy tests passed (${tests.length})`)
