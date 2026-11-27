import { test, expect, checkRequestPayload, newSkyrampPlaywrightPage } from "@skyramp/skyramp";
import { ItemsPage, baseUrl, uiCredentials, type StoredItem } from "../support/items-page";

test("sign in, see my items listed by name, and add a new one", async ({ page }) => {
  page = newSkyrampPlaywrightPage(page);
  // Items can't be deleted through the app (no DELETE route), so each name is unique to the run.
  const ts = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const alpha = `Journey alpha ${ts}`;
  const beta = `Journey beta ${ts}`;
  const { username } = uiCredentials();
  const itemsPage = new ItemsPage(page);
  let before: StoredItem[] = [];
  let latest: StoredItem[] = [];

  await test.step("1. sign in at /login and land on /items", async () => {
    await page.goto(`${baseUrl}/login`);
    before = await itemsPage.signIn(false);
    latest = before;
  });

  await test.step("2. the list shows each item by name in API order", async () => {
    await expect.soft(itemsPage.list).toBeVisible();
    await itemsPage.expectListShows(before, true);
  });

  await test.step("3. add 'Journey alpha'", async () => {
    const { created, items } = await itemsPage.addItem(alpha);
    checkRequestPayload(created.request().postDataJSON(), { name: alpha });
    expect.soft(created.status()).toBe(201);
    latest = items;
    await expect.soft(itemsPage.items.filter({ hasText: alpha })).toHaveText([alpha]);
    await expect.soft(itemsPage.newItemInput).toHaveValue("");
    await expect.soft(itemsPage.error).toBeHidden();
  });

  await test.step("4. add 'Journey beta'", async () => {
    const { created, items } = await itemsPage.addItem(beta);
    checkRequestPayload(created.request().postDataJSON(), { name: beta });
    expect.soft(created.status()).toBe(201);
    latest = items;
    await expect.soft(itemsPage.items.filter({ hasText: beta })).toHaveText([beta]);
    const names = items.map((i) => i.name);
    expect.soft(names.indexOf(beta)).toBeGreaterThan(names.indexOf(alpha));
    await expect.soft(itemsPage.newItemInput).toHaveValue("");
  });

  await test.step("5. reload: the same list is shown", async () => {
    const shownBefore = await itemsPage.items.allTextContents();
    const afterReload = await itemsPage.reload();
    await expect(itemsPage.userStatus).toHaveText(`Signed in as ${username}`);
    await expect(itemsPage.error).toBeHidden();
    await expect(itemsPage.newItemInput).toHaveValue("");
    // Every entry is its item's name from GET /api/items in id order, none blank.
    await itemsPage.expectListShows(afterReload);
    // Both added items are there once, alpha then beta, after every item shown before the journey.
    const names = afterReload.map((i) => i.name);
    const a = afterReload.filter((i) => i.name === alpha);
    const b = afterReload.filter((i) => i.name === beta);
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
    expect(names.indexOf(beta)).toBeGreaterThan(names.indexOf(alpha));
    expect(before.every((i) => i.id < a[0].id)).toBe(true);
    expect(afterReload.length).toBeGreaterThanOrEqual(before.length + 2);
    // What was shown before the reload is still shown, in the same order.
    expect(afterReload.slice(0, latest.length).map((i) => i.name)).toEqual(latest.map((i) => i.name));
    expect(shownBefore.slice(0, latest.length)).toEqual(latest.map((i) => i.name));
  });
});
