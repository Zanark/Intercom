const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  testMatch: '**/*.test.cjs',
  outputDir: '.local/desktop-test-results',
  workers: 1,
  retries: 0,
  timeout: 30000,
  reporter: 'list',
});
