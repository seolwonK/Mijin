import { config as loadEnv } from 'dotenv';
import { defineConfig, devices } from '@playwright/test';
import { ipHeaders } from './tests/helpers/ip';

// .env 를 **명시적으로** 로드한다.
// 이 줄이 없으면 AUTH_SECRET 은 @prisma/client import 부수효과로만 들어와
// import 순서에 따라 조용히 사라진다 (tests/helpers/auth.ts 가 이 값에 의존).
loadEnv({ quiet: true });

export default defineConfig({
  testDir: 'tests',
  globalSetup: './tests/global-setup.ts',
  globalTeardown: './tests/global-teardown.ts',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    // UI 층 기본 레이트리밋 버킷. 실행마다 달라지므로 1회차가 태운 버킷이
    // 2회차에 살아남지 않는다. 스펙이 더 잘게 나누고 싶으면
    // `test.use({ extraHTTPHeaders: ipHeaders('<seed>') })` 로 덮어쓴다.
    extraHTTPHeaders: ipHeaders('ui-default'),
  },
  webServer: {
    // 가드가 dev 서버 **부팅 전에** 자동배정 워커를 끈다.
    // Playwright 는 이 명령을 shell 로 띄우므로(runner/index.js:841) `&&` 체이닝이
    // 성립하고, 가드가 exit 1 하면 테스트 실행 전에 중단된다.
    command: 'npx tsx tests/pretest-guard.ts && npm run dev',
    url: 'http://localhost:3000',
    // ⚠️ 절대 true 로 되돌리지 말 것. 이미 뜬 서버를 재사용하면 아래 env 가
    // 조용히 폐기되고(runner/index.js:817-827) 실 SMS 게이트웨이(solapi)로
    // 과금 발송이 나간다.
    reuseExistingServer: false,
    // Next 의 .env 로더는 이미 정의된 process.env 를 덮어쓰지 않으므로
    // 여기서 준 값이 .env 의 SMS_PROVIDER="solapi" 를 이긴다 (실측 확인).
    //
    // R2_BUCKET 을 비우는 이유도 같은 계열이다. .env 에 실 자격증명이 들어 있으면 E2E 가
    // 만드는 접수 사진이 **운영 버킷에** 실제로 쌓이고, 테스트 정리는 DB 만 지우므로
    // 오브젝트가 영구 잔재로 남는다. 빈 값이면 사진은 DB(StoredFile) 폴백으로 저장되고
    // 픽스처 정리가 그 행까지 회수한다(helpers/fixtures.ts).
    env: { SMS_PROVIDER: 'console', R2_BUCKET: '' },
    timeout: 180_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
