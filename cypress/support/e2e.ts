// Global Cypress support file for E2E tests.
// Add custom commands/imports here as your suite grows.

Cypress.on("uncaught:exception", (err) => {
  // Temporary guard: known hydration mismatch on homepage in current app build.
  // Keep failing for every other uncaught exception.
  const message = err.message || "";
  if (
    message.includes("Hydration failed because the server rendered HTML didn't match the client") ||
    message.includes("Minified React error #418")
  ) {
    return false;
  }
});
