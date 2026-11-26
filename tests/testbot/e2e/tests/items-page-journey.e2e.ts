// Journey: sign in, add an item on the Items page and see it listed by name.
// Drafted from a Skyramp walk of /login -> /items -> Add item, then fitted to the ItemsPage page object.
import { test, expect, checkRequestPayload, newSkyrampPlaywrightPage } from "@skyramp/skyramp";
import { ApiItem, ItemsPage, baseUrl, uniqueName } from "../pages/items-page";

test("sign in, add an item on the Items page and see it listed by name", async ({ page }) => {
  page = newSkyrampPlaywrightPage(page);
  const username = process.env.SKYRAMP_UI_USERNAME;
  const password = process.env.SKYRAMP_UI_PASSWORD;
  if (!username || !password) {
    throw new Error("SKYRAMP_UI_USERNAME and SKYRAMP_UI_PASSWORD must be set: this test signs in through /login");
  }
  const signedIn = `Signed in as ${username}`;
  const name = uniqueName("journey") + " item";
  const items = new ItemsPage(page);
  let before: ApiItem[] = [];

  await test.step("1. sign in on /login and land on /items", async () => {
    await page.goto(`${baseUrl}/login`);
    await page.getByLabel("Email").fill(username);
    await page.getByLabel("Password").fill(password);
    const loaded = items.nextItemsResponse();
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(`${baseUrl}/items`);
    await expect.soft(items.userStatus).toHaveText(signedIn);
    before = await loaded;
  });

  await test.step("2. the list shows one entry per item from GET /api/items, each by its name", async () => {
    await expect.soft(items.items).toHaveCount(before.length);
    await expect.soft(items.items).toHaveText(before.map((i) => i.name));
    await expect.soft(items.items.filter({ hasText: /^\s*$/ })).toHaveCount(0);
  });

  let after: ApiItem[] = [];
  let ours: ApiItem | undefined;
  await test.step("3. add an item with the form; it is listed last by its name", async () => {
    const reloaded = items.nextItemsResponse();
    const posted = page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/api/items");
    await items.addItem(name);
    const response = await posted;
    checkRequestPayload(response.request().postDataJSON(), { name });
    expect(response.status()).toBe(201);
    after = await reloaded;
    ours = after.find((i) => i.name === name);
    expect(ours, "the reloaded list holds the added item").toBeTruthy();
    // Every item shown before stays, and ours comes after them (other tests may add items meanwhile).
    expect.soft(after.slice(0, before.length)).toEqual(before);
    expect.soft(ours!.id).toBeGreaterThan(Math.max(0, ...before.map((i) => i.id)));
    await expect.soft(items.newItemInput).toHaveValue("");
    await expect.soft(items.error).toBeHidden();
    await expect.soft(items.items).toHaveCount(after.length);
    await expect.soft(items.items).toHaveText(after.map((i) => i.name));
    await test.step("the added item is the last entry, by its name", () => items.expectListedLast(after, ours!, { soft: true }));
  });

  await test.step("4. after a reload the item is still listed last by its name and the user still signed in", async () => {
    const loaded = await items.reload();
    await expect.soft(items.userStatus).toHaveText(signedIn);
    await expect.soft(items.items).toHaveCount(loaded.length);
    await expect.soft(items.items).toHaveText(loaded.map((i) => i.name));
    await expect.soft(items.items.filter({ hasText: /^\s*$/ })).toHaveCount(0);
    await test.step("the added item is still the last entry, by its name", () => items.expectListedLast(loaded, ours!, { soft: true }));
  });
});
