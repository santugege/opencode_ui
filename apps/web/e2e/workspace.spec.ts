import { expect, test } from "@playwright/test";

test("registers, creates a session, uploads a file, sends a message, and revisits history", async ({ page }) => {
  const email = `person-${Date.now()}@example.com`;

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "AI 工作区" })).toBeVisible();

  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码").fill("secret123");
  await page.getByRole("button", { name: "创建账号" }).click();

  await expect(page.getByRole("button", { name: "新建会话" })).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();

  await page.getByRole("button", { name: "新建会话" }).click();
  await expect(page.getByRole("button", { name: "未命名会话 就绪 刚刚" })).toHaveAttribute("aria-current", "page");

  await page.getByLabel("附加文件").setInputFiles({
    buffer: Buffer.from("Quarterly numbers"),
    mimeType: "text/csv",
    name: "quarterly.csv",
  });
  await expect(page.getByRole("article", { name: "quarterly.csv 就绪" })).toBeVisible();

  await page.getByPlaceholder("发送消息给 opencode...").fill("Summarize this spreadsheet.");
  await page.getByRole("button", { name: "发送消息" }).click();

  await expect(page.getByRole("heading", { name: "Summarize this spreadsheet." })).toBeVisible();
  await expect(page.getByRole("list").getByText("Summarize this spreadsheet.")).toBeVisible();
  await expect(page.getByRole("article", { name: "quarterly.csv 就绪" })).toBeVisible();

  await page.getByRole("button", { name: "Summarize this spreadsheet. 就绪 刚刚" }).click();
  await expect(page.getByRole("list").getByText("Summarize this spreadsheet.")).toBeVisible();
});
