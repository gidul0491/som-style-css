import { defineConfig } from "vitest/config";

/** Real-browser checks; needs `npx playwright install chromium` once. */
export default defineConfig({
  test: {
    include: ["tests/browser/**/*.test.ts"],
    testTimeout: 20000,
  },
});
