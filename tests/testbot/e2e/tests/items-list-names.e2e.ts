// Items page (/items) lists every item from GET /api/items by its name.
// Drafted from a Skyramp walk of the Items page, then fitted to the ItemsPage page object.
import { test, expect, checkRequestPayload, newSkyrampPlaywrightPage } from "@skyramp/skyramp";
import { ItemsPage, createItem, listItems, uniqueName } from "../pages/items-page";

test("lists each stored item by its name, in id order, on load", async ({ page, request }) => {
  page = newSkyrampPlaywrightPage(page);
  const base = uniqueName("names-on-load");
  const a = await createItem(request, `${base}-A`);
  const b = await createItem(request, `${base}-B`);
  const seeded = await createItem(request, `${base} seeded`);

  const items = new ItemsPage(page);
  const loaded = await items.goto();

  // The page's own GET /api/items holds the items we made, in id order, as the API serves them.
  expect(loaded.map((i) => i.id)).toEqual(expect.arrayContaining([a.id, b.id, seeded.id]));
  expect((await listItems(request)).map((i) => i.id)).toEqual(expect.arrayContaining([a.id, b.id, seeded.id]));

  await test.step("one entry per item from GET /api/items, each reading its name", async () => {
    await expect.soft(items.list).toBeVisible();
    await items.expectListShows(loaded);
  });

  await test.step("the items made here are listed by their exact names, A before B", async () => {
    await expect.soft(items.itemNamed(a.name)).toHaveCount(1);
    await expect.soft(items.itemNamed(b.name)).toHaveCount(1);
    await expect.soft(items.itemNamed(seeded.name)).toHaveCount(1);
    const texts = (await items.items.allTextContents()).map((t) => t.trim());
    expect.soft(texts.indexOf(a.name)).toBeGreaterThanOrEqual(0);
    expect.soft(texts.indexOf(b.name)).toBeGreaterThan(texts.indexOf(a.name));
  });

  await test.step("no entry is blank", async () => {
    await expect(items.items.filter({ hasText: /^\s*$/ })).toHaveCount(0);
  });
});

test("an item added with the form is listed by its name without a reload", async ({ page }) => {
  page = newSkyrampPlaywrightPage(page);
  const name = uniqueName("form-add") + " item";
  const items = new ItemsPage(page);
  const before = await items.goto();
  await expect(items.items).toHaveCount(before.length);

  const reloaded = items.nextItemsResponse();
  const posted = page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/api/items");
  // Surrounding whitespace is trimmed by the app; the list shows the trimmed name.
  await items.addItem(`  ${name}  `);
  const response = await posted;
  checkRequestPayload(response.request().postDataJSON(), { name: `  ${name}  ` });
  expect(response.status()).toBe(201);
  const after = await reloaded;

  await test.step("the form resets with no error shown", async () => {
    await expect.soft(items.newItemInput).toHaveValue("");
    await expect.soft(items.error).toBeHidden();
  });

  await test.step("the new item is the last entry, reading its trimmed name, and the count grew by one", async () => {
    // The page reloaded the list from GET /api/items: every item it showed before stays, and ours comes after them
    // (other tests may add items meanwhile).
    const ours = after.find((i) => i.name === name)!;
    expect(ours, "the reloaded list holds the added item").toBeTruthy();
    expect(after.slice(0, before.length)).toEqual(before);
    expect(ours!.id).toBeGreaterThan(Math.max(0, ...before.map((i) => i.id)));
    await items.expectListShows(after);
    await items.expectListedLast(after, ours);
    await expect(items.itemNamed(name)).toHaveCount(1);
  });
});

test("an item added earlier is still listed by its name after reloading /items", async ({ page }) => {
  page = newSkyrampPlaywrightPage(page);
  const name = uniqueName("after-reload") + " item";
  const items = new ItemsPage(page);
  await items.goto();
  const refreshed = items.nextItemsResponse();
  await items.addItem(name);
  await refreshed;
  await expect(items.newItemInput).toHaveValue("");

  const loaded = await items.reload();
  const ours = loaded.find((i) => i.name === name);
  expect(ours, "GET /api/items still returns the added item").toBeTruthy();

  await test.step("the added item is listed with its exact name, as the last of the items made before the reload", async () => {
    await items.expectListShows(loaded);
    await expect(items.itemNamed(name)).toHaveCount(1);
    await items.expectListedLast(loaded, ours!);
  });
});
