import tsconfigPaths from "vite-tsconfig-paths"
import type { ViteUserConfig } from "vitest/config"

const config: ViteUserConfig = {
  plugins: [tsconfigPaths({ ignoreConfigErrors: true })],
  test: {
    include: ["packages/*/test/**/*.test.ts"],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/coverage/**",
      "**/dtslint/**"
    ],
    coverage: {
      provider: "v8",
      reportsDirectory: "coverage",
      exclude: [
        "node_modules/",
        "dist/",
        "coverage/",
        "dtslint/",
        "**/*.d.ts",
        "**/*.config.*",
        "**/vitest.shared.*"
      ]
    }
  }
}

export default config
