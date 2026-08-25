import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "tests/unit/csv.test.ts",
      "tests/integration/import-service.test.ts",
    ],
  },
});
