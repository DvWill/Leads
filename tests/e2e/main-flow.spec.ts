import { expect, test } from "@playwright/test";

test("administrador entra e acessa os módulos principais", async ({ page }) => {
  const email = process.env.DEMO_ADMIN_EMAIL;
  const password = process.env.DEMO_ADMIN_PASSWORD;

  test.skip(!email || !password, "Credenciais demo não configuradas.");

  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email!);
  await page.getByLabel("Senha", { exact: true }).fill(password!);
  await page.getByRole("button", { name: "Entrar" }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: /olá/i })).toBeVisible();

  for (const path of ["leads", "tarefas", "equipe", "relatorios", "auditoria", "configuracoes"]) {
    await page.goto(`/${path}`);
    await expect(page).not.toHaveURL(/\/login$/);
    await expect(page.locator("main")).toBeVisible();
  }
});
