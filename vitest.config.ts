
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      enabled: true,
      exclude: ["node_modules/"],
      provider: "v8",
      reporter: ["lcov"],
      reportOnFailure: true,
    },
    environment: "node",
    include: ["**/*.vitest.ts"],
  }
});
