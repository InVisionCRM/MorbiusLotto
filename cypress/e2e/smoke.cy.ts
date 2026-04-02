describe("MORBlotto smoke test", () => {
  it("loads the home page", () => {
    cy.visit("/");
    cy.get("body").should("be.visible");
  });
});
