import { test, expect, checkRequestPayload, newSkyrampPlaywrightPage } from "@skyramp/skyramp";
import { ItemsPage, createItem } from "../support/items-page";

// Items can't be deleted through the app (no DELETE route), so each name is unique to the run.
const stamp = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

test.describe("Items page shows each item by name", () => {
  test("lists every stored item by its name in API order, including items created before the page opened", async ({ page, request }) => {
    page = newSkyrampPlaywrightPage(page);
    const ts = stamp();
    const apple = await createItem(request, `Seed apple ${ts}`);
    const pear = await createItem(request, `Seed pear ${ts}`);
    expect(apple.name).toBe(`Seed apple ${ts}`);
    expect(pear.name).toBe(`Seed pear ${ts}`);

    const itemsPage = new ItemsPage(page);
    const loaded = await itemsPage.signIn();

    // The page loaded both seeded items, apple before pear (id order).
    const names = loaded.map((i) => i.name);
    expect(names.indexOf(`Seed apple ${ts}`)).toBeGreaterThanOrEqual(0);
    expect(names.indexOf(`Seed pear ${ts}`)).toBeGreaterThan(names.indexOf(`Seed apple ${ts}`));

    // One entry per item the API returned, entry i's text exactly items[i].name, none blank.
    await itemsPage.expectListShows(loaded);
    await expect(itemsPage.items.filter({ hasText: `Seed apple ${ts}` })).toHaveText([`Seed apple ${ts}`]);
    await expect(itemsPage.items.filter({ hasText: `Seed pear ${ts}` })).toHaveText([`Seed pear ${ts}`]);
  });

  test("shows a stored item's name in its entry and no entry is blank", async ({ page, request }) => {
    page = newSkyrampPlaywrightPage(page);
    const name = `F1 item ${stamp()}`;
    await createItem(request, name);

    const itemsPage = new ItemsPage(page);
    const loaded = await itemsPage.signIn();

    await expect(itemsPage.items.filter({ hasText: name })).toHaveCount(1);
    await expect(itemsPage.items.filter({ hasText: name })).toHaveText([name]);
    await expect(itemsPage.items).toHaveCount(loaded.length);
    await expect(itemsPage.items.filter({ hasText: /^\s*$/ })).toHaveCount(0);
  });

  test("adding an item refreshes the list with the trimmed name, clears the input and keeps it after reload", async ({ page }) => {
    page = newSkyrampPlaywrightPage(page);
    const ts = stamp();
    const typed = `  Walk item ${ts}  `;
    const stored = `Walk item ${ts}`;

    const itemsPage = new ItemsPage(page);
    const before = await itemsPage.signIn();
    await expect(itemsPage.items).toHaveCount(before.length);

    const { created, items } = await itemsPage.addItem(typed);
    checkRequestPayload(created.request().postDataJSON(), { name: typed });
    expect(created.status()).toBe(201);
    expect((await created.json()).name).toBe(stored);

    // The list refreshed without a reload: it holds exactly what the page fetched, the new entry included once.
    await itemsPage.expectListShows(items);
    await expect(itemsPage.items.filter({ hasText: stored })).toHaveText([stored]);
    // The new item comes after every item the page showed before it (id order), so it is appended.
    const added = items.filter((i) => i.name === stored);
    expect(added).toHaveLength(1);
    expect(before.every((i) => i.id < added[0].id)).toBe(true);
    expect(items.length).toBeGreaterThanOrEqual(before.length + 1);
    await expect(itemsPage.newItemInput).toHaveValue("");
    await expect(itemsPage.error).toBeHidden();

    const afterReload = await itemsPage.reload();
    await itemsPage.expectListShows(afterReload);
    await expect(itemsPage.items.filter({ hasText: stored })).toHaveText([stored]);
  });

  test("shows an item name with markup-like characters as literal text", async ({ page, request }) => {
    page = newSkyrampPlaywrightPage(page);
    const label = `bold ${stamp()}`;
    const name = `<b>${label}</b>`;
    await createItem(request, name);

    const itemsPage = new ItemsPage(page);
    await itemsPage.signIn();

    const entry = itemsPage.items.filter({ hasText: name });
    await expect(entry).toHaveCount(1);
    await expect(entry).toHaveText(name);
    // Had the markup been parsed, a <b> element with exactly this text would be inside the list.
    await expect(itemsPage.list.getByText(label, { exact: true })).toHaveCount(0);
  });
});
