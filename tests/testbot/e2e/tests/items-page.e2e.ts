// The Items page shows each item returned by GET /api/items as a row labelled with the item's name.
import { expect, test } from "@playwright/test";
import { checkRequestPayload } from "@skyramp/skyramp";
import { ItemsPage, listItems, runStamp, seedItem } from "../support/items-page";

test.describe("Items page lists items by name", () => {
  test("shows a row per item from GET /api/items, each reading the item's name in id order", async ({ page, request }) => {
    const stamp = runStamp();
    const lamp = await seedItem(request, `Desk lamp ${stamp}`);
    const chair = await seedItem(request, `Office chair ${stamp}`);

    const items = new ItemsPage(page);
    const loadedCount = (await listItems(request)).length;
    await items.goto();
    await expect(items.list).toBeVisible();

    await items.expectRowsMatchApi(request, loadedCount);

    // The seeded items are rows reading exactly their names, Desk lamp before Office chair.
    await expect(items.row(lamp.name)).toHaveCount(1);
    await expect(items.row(chair.name)).toHaveCount(1);
    const texts = await items.rowTexts();
    expect(texts.indexOf(lamp.name)).toBeGreaterThanOrEqual(0);
    expect(texts.indexOf(lamp.name)).toBeLessThan(texts.indexOf(chair.name));
    // No row is blank.
    expect(texts.filter((t) => t.trim() === "")).toEqual([]);
  });

  test("shows a name with markup characters literally as text", async ({ page, request }) => {
    const name = `<b>Tag & "quote" ${runStamp()}</b>`;
    await seedItem(request, name);

    const items = new ItemsPage(page);
    await items.goto();

    const row = items.row(name);
    await expect(row).toHaveCount(1);
    await expect(row).toHaveText(name);
    await expect(row).toHaveJSProperty("childElementCount", 0);
  });

  test("shows an item added with the Add item form right away, without a reload", async ({ page, request }) => {
    const stamp = runStamp();
    const earlier = await seedItem(request, `Earlier item ${stamp}`);
    const name = `Plan item ${stamp}`;

    const items = new ItemsPage(page);
    await items.goto();
    await expect(items.list).toBeVisible();
    await expect(items.error).toBeHidden();

    const posted = await items.addItem(name);
    expect(posted.status()).toBe(201);
    checkRequestPayload(posted.request().postDataJSON(), { name });
    const saved = await posted.json();
    expect(saved.name).toBe(name);

    await expect(items.newItemInput).toHaveValue("");
    await expect(items.error).toBeHidden();
    // The new item is a row reading its name, after the earlier item, which still reads its own name.
    await expect(items.row(name)).toHaveCount(1);
    await expect(items.row(earlier.name)).toHaveCount(1);
    const texts = await items.rowTexts();
    expect(texts.indexOf(earlier.name)).toBeLessThan(texts.indexOf(name));
    expect(texts.filter((t) => t.trim() === "")).toEqual([]);
    // Its position is the one GET /api/items gives it.
    await items.expectRowAtApiPositionOf(request, saved.id, name);
  });

  test("still shows items saved through the form, by name, after a reload", async ({ page, request }) => {
    const stamp = runStamp();
    const earlier = await seedItem(request, `Earlier item ${stamp}`);
    const name = `Plan item ${stamp}`;

    const items = new ItemsPage(page);
    await items.goto();
    const posted = await items.addItem(name);
    expect(posted.status()).toBe(201);
    checkRequestPayload(posted.request().postDataJSON(), { name });
    const saved = await posted.json();

    const loadedCount = (await listItems(request)).length;
    await page.reload();
    await expect(items.list).toBeVisible();

    await expect(items.row(name)).toHaveCount(1);
    await expect(items.row(earlier.name)).toHaveCount(1);
    await items.expectRowAtApiPositionOf(request, saved.id, name);
    await items.expectRowAtApiPositionOf(request, earlier.id, earlier.name);
    await items.expectRowsMatchApi(request, loadedCount);
  });
});
