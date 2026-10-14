// Playwright 자동 테스트 설정
// - 이 PC에 설치된 Edge를 사용한다 (테스트용 브라우저를 따로 내려받지 않음)
// - index.html을 서버 없이 파일로 직접 연다 (실제 사용 환경과 같음)
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: true,
  reporter: 'list',
  use: {
    channel: 'msedge',
    headless: true,
    viewport: { width: 1600, height: 1000 },
    screenshot: 'only-on-failure',
  },
});
