const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const testDirectory = __dirname;
const testFiles = fs.readdirSync(testDirectory)
  .filter(file => file.endsWith('.cjs') && file !== path.basename(__filename))
  .sort((left, right) => left.localeCompare(right));
const failures = [];

for (const file of testFiles) {
  console.log(`\n=== ${file} ===`);
  const result = spawnSync(process.execPath, [path.join(testDirectory, file)], {
    cwd: path.resolve(testDirectory, '..'),
    stdio: 'inherit',
    env: process.env,
  });
  if (result.error) {
    console.error(`${file}: ${result.error.message}`);
    failures.push(file);
  } else if (result.status !== 0) {
    failures.push(file);
  }
}

if (failures.length) {
  console.error(`\n${failures.length}/${testFiles.length} test files failed: ${failures.join(', ')}`);
  process.exitCode = 1;
} else {
  console.log(`\nAll ${testFiles.length} test files passed.`);
}
