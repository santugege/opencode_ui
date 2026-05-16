import { expect, test } from "@playwright/test";

test("registers, creates a session, uploads a file, sends a message, and revisits history", async ({ page }) => {
  const email = `person-${Date.now()}@example.com`;

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "AI Workspace" })).toBeVisible();

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("secret123");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page.getByRole("button", { name: "New session" })).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();

  await page.getByRole("button", { name: "New session" }).click();
  await expect(page.getByRole("button", { name: "Untitled session ready Now" })).toHaveAttribute("aria-current", "page");

  await page.getByLabel("Attach files").setInputFiles({
    buffer: Buffer.from("Quarterly numbers"),
    mimeType: "text/csv",
    name: "quarterly.csv",
  });
  await expect(page.getByRole("article", { name: "quarterly.csv Ready" })).toBeVisible();

  await page.getByPlaceholder("Message opencode...").fill("Summarize this spreadsheet.");
  await page.getByRole("button", { name: "Send message" }).click();

  await expect(page.getByRole("heading", { name: "Summarize this spreadsheet." })).toBeVisible();
  await expect(page.getByRole("list").getByText("Summarize this spreadsheet.")).toBeVisible();
  await expect(page.getByRole("article", { name: "quarterly.csv Ready" })).toBeVisible();

  await page.getByRole("button", { name: "Summarize this spreadsheet. ready Now" }).click();
  await expect(page.getByRole("list").getByText("Summarize this spreadsheet.")).toBeVisible();
});
