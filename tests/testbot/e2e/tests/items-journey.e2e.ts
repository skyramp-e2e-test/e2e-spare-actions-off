// Journey: sign in, add an item and see it listed on the Items page. Started from a Skyramp walk draft.
import { test, checkRequestPayload, expect, newSkyrampPlaywrightPage } from "@skyramp/skyramp";
import { ItemsPage, createItem, listItems, uiBaseUrl, uniq } from "../pages/items-page";

test("signs in, adds an item and sees every item listed by name", async ({ page, request }) => {
  const username = process.env.SKYRAMP_UI_USERNAME;
  const password = process.env.SKYRAMP_UI_PASSWORD;
  if (!username || !password) throw new Error("SKYRAMP_UI_USERNAME and SKYRAMP_UI_PASSWORD must be set to sign in");
  page = newSkyrampPlaywrightPage(page);
  const u = uniq();
  const legacyName = `Legacy ${u}`;
  const journeyName = `Journey item ${u}`;
  await createItem(request, legacyName);
  const items = new ItemsPage(page);

  await test.step("1. sign in on /login and land on /items", async () => {
    await page.goto(`${uiBaseUrl}/login`);
    await page.getByLabel("Email").fill(username);
    await page.getByLabel("Password").fill(password);
    const loaded = page.waitForResponse((r) => r.url().endsWith("/api/items") && r.request().method() === "GET");
    await page.getByRole("button", { name: "Sign in" }).click();
    await loaded;
    await expect(page).toHaveURL(/\/items$/);
    await expect.soft(items.userStatus).toHaveText(`Signed in as ${username}`);
  });

  await test.step("2. the list shows each existing item by name", async () => {
    await expect(items.list).toBeAttached();
    await expect.soft(items.entry(legacyName)).toHaveCount(1);
    expect.soft((await items.entries.allTextContents()).filter((t) => t.trim() === "")).toEqual([]);
  });

  await test.step("3. add an item through the form", async () => {
    await items.newItemInput.fill(journeyName);
    const posted = page.waitForResponse((r) => r.url().endsWith("/api/items") && r.request().method() === "POST");
    const reloaded = page.waitForResponse((r) => r.url().endsWith("/api/items") && r.request().method() === "GET");
    await items.addButton.click();
    const response = await posted;
    checkRequestPayload(response.request().postDataJSON(), { name: journeyName });
    await reloaded;
    await expect.soft(items.newItemInput).toHaveValue("");
    await expect.soft(items.error).toBeHidden();
    await expect.soft(items.entry(journeyName)).toHaveCount(1);
  });

  await test.step("4. after a reload the list still shows both items by name, in id order", async () => {
    const loaded = page.waitForResponse((r) => r.url().endsWith("/api/items") && r.request().method() === "GET");
    await page.reload();
    await loaded;
    await expect.soft(items.userStatus).toHaveText(`Signed in as ${username}`);
    await expect.soft(items.entry(legacyName)).toHaveCount(1);
    await expect.soft(items.entry(journeyName)).toHaveCount(1);
    const texts = await items.entries.allTextContents();
    expect.soft(texts.filter((t) => t.trim() === "")).toEqual([]);
    expect.soft(texts.indexOf(legacyName)).toBeGreaterThanOrEqual(0);
    expect.soft(texts.indexOf(legacyName)).toBeLessThan(texts.indexOf(journeyName));
    const stored = (await listItems(request)).filter((i) => i.name === journeyName);
    expect.soft(stored).toHaveLength(1);
    await expect(items.newItemInput).toHaveValue("");
    await expect(items.error).toBeHidden();
  });
});
