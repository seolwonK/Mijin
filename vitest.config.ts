import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// 단위 테스트 전용 러너 설정 — e2e(tests/**)는 Playwright가 소유한다.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
