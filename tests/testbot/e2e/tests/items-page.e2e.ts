import { test, checkRequestPayload, expect, getBaseUrl, newSkyrampPlaywrightPage } from "@skyramp/skyramp";
import { ItemsPage } from "../pages/items-page";
import { createItem, uniqueSuffix } from "../items-api";

// The app has no endpoint that deletes an item: .skyramp/cleanup/items-page.sh removes what these tests create.
const baseUrl = getBaseUrl("SKYRAMP_TEST_BASE_URL", "http://localhost:3000");

test.use({ viewport: { width: 1280, height: 900 } });

test.beforeEach(async ({ page }) => {
  page.setDefaultTimeout(15000);
});

test("Items page lists every stored item by name, in id order", async ({ page, request }) => {
  page = newSkyrampPlaywrightPage(page);
  const suffix = uniqueSuffix();
  const alpha = await createItem(request, baseUrl, `R1a alpha ${suffix}`);
  const beta = await createItem(request, baseUrl, `R1a beta ${suffix}`);
  const items = new ItemsPage(page);

  const stored = await items.open(baseUrl);
  expect(stored.map((i) => i.id)).toEqual([...stored.map((i) => i.id)].sort((a, b) => a - b));
  expect(stored.map((i) => i.id)).toEqual(expect.arrayContaining([alpha.id, beta.id]));

  await expect(items.entries).toHaveCount(stored.length);
  // The order is what this checks: entry i shows the i-th item's name.
  await expect(items.entries).toHaveText(stored.map((i) => i.name));
  await expect(items.entries.filter({ hasText: /undefined/ })).toHaveCount(0);
  await expect(items.entryNamed(alpha.name)).toHaveCount(1);
  await expect(items.entryNamed(alpha.name)).toHaveText(`R1a alpha ${suffix}`);
  await expect(items.entryNamed(beta.name)).toHaveCount(1);
  await expect(items.entryNamed(beta.name)).toHaveText(`R1a beta ${suffix}`);
});

test("Adding an item through the form refreshes the list without a reload and shows its trimmed name", async ({ page, request }) => {
  page = newSkyrampPlaywrightPage(page);
  const suffix = uniqueSuffix();
  const earlier = await createItem(request, baseUrl, `R1b earlier ${suffix}`);
  const name = `R1b added ${suffix}`;
  const items = new ItemsPage(page);

  const before = await items.open(baseUrl);
  await expect(items.entries).toHaveCount(before.length);
  await expect(items.addButton).toBeEnabled();

  // Typed with surrounding spaces: the server stores the name trimmed, and the list shows what it stores.
  await items.newItemInput.fill(`  ${name}  `);
  const posted = page.waitForResponse(
    (r) => new URL(r.url()).pathname === "/api/items" && r.request().method() === "POST",
  );
  const reloaded = items.nextItemsLoad();
  await items.addButton.click();
  const response = await posted;
  checkRequestPayload(response.request().postDataJSON(), { name: `  ${name}  ` });
  expect(response.status()).toBe(201);
  const created = await response.json();
  expect(created.name).toBe(name);

  // Other tests may add items at the same time: the refreshed list is the earlier list with what was added since
  // appended, the new item among them, exactly once.
  const after = await reloaded;
  expect(after.slice(0, before.length).map((i) => i.id)).toEqual(before.map((i) => i.id));
  const createdIndex = after.findIndex((i) => i.id === created.id);
  expect(createdIndex).toBeGreaterThanOrEqual(before.length);
  await expect(page).toHaveURL(`${baseUrl}/items`);
  await expect(items.entries).toHaveCount(after.length);
  await expect(items.entryNamed(name)).toHaveCount(1);
  await expect(items.entryNamed(name)).toHaveText(name);
  await expect(items.entries.filter({ hasText: name })).toHaveCount(1);
  await expect(items.entryNamed(earlier.name)).toHaveCount(1);
  await expect(items.entryNamed(earlier.name)).toHaveText(`R1b earlier ${suffix}`);
  // The order is what this checks: earlier entries keep their names and places, the new item comes after them.
  await expect(items.entries).toHaveText(after.map((i) => i.name));
  await expect(items.newItemInput).toHaveValue("");
  await expect(items.error).toBeHidden();
});

test("An item name with HTML-like characters is shown as literal text", async ({ page, request }) => {
  page = newSkyrampPlaywrightPage(page);
  const name = `<b>bold</b> & co ${uniqueSuffix()}`;
  const created = await createItem(request, baseUrl, name);
  const items = new ItemsPage(page);

  const stored = await items.open(baseUrl);
  await expect(items.entries).toHaveCount(stored.length);
  const entry = items.entryNamed(created.name);
  await expect(entry).toHaveCount(1);
  await expect(entry).toHaveText(name);
  await expect.poll(() => entry.evaluate((el) => el.textContent)).toBe(name);
  await expect.poll(() => entry.evaluate((el) => el.getElementsByTagName("b").length)).toBe(0);
  await expect.poll(() => entry.evaluate((el) => el.childElementCount)).toBe(0);
});

test("Items page shows a created item's name, and no entry is blank", async ({ page, request }) => {
  page = newSkyrampPlaywrightPage(page);
  const name = `F1 visible ${uniqueSuffix()}`;
  const created = await createItem(request, baseUrl, name);
  const items = new ItemsPage(page);

  const stored = await items.open(baseUrl);
  await expect(items.entries).toHaveCount(stored.length);
  await expect(items.entryNamed(name)).toHaveCount(1);
  await expect(items.entryNamed(name)).toHaveText(name);
  await expect(items.entries.filter({ hasText: /\S/ })).toHaveCount(stored.length);
});
