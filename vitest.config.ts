
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // coverage: {
    //   enabled: true,
    //   provider: "v8",
    //   reporter: ["lcov"],
    //   reportOnFailure: true,
    // },
    environment: "node",
    include: ["**/*.test.ts"],
  }
});
