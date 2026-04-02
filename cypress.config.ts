import { defineConfig } from "cypress";

const baseUrl = process.env.CYPRESS_BASE_URL || "http://morbius.io";

export default defineConfig({
  projectId: "io4itz",
  allowCypressEnv: false,
  video: true,
  screenshotOnRunFailure: true,
  e2e: {
    baseUrl,
    specPattern: "cypress/e2e/**/*.cy.{js,jsx,ts,tsx}",
    supportFile: "cypress/support/e2e.ts",
    setupNodeEvents() {
      // Node event listeners can be added here later.
    },
  },
});
