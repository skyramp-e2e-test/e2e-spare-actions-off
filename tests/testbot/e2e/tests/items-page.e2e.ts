// The Items page (/items) lists every stored item by name and refuses a blank one.
// Started from Skyramp walk drafts (items_list, add_item, add_blank_item).
import { test, checkRequestPayload, expect, newSkyrampPlaywrightPage } from "@skyramp/skyramp";
import { ItemsPage, createItem, listItems, uniq } from "../pages/items-page";

test.describe("Items page", () => {
  test("lists each stored item by its name, in the order the API returns them", async ({ page, request }) => {
    page = newSkyrampPlaywrightPage(page);
    const u = uniq();
    const alpha = await createItem(request, `Alpha ${u}`);
    const beta = await createItem(request, `Beta ${u}`);

    const items = new ItemsPage(page);
    await items.open();

    await expect(items.entry(`Alpha ${u}`)).toHaveCount(1);
    await expect(items.entry(`Beta ${u}`)).toHaveCount(1);

    const texts = await items.entries.allTextContents();
    expect(texts.indexOf(`Alpha ${u}`)).toBeLessThan(texts.indexOf(`Beta ${u}`));
    expect(texts.filter((t) => t.trim() === "")).toEqual([]);

    // Every item the API holds up to the ones this test made is listed by its name, in id order.
    const fromApi = (await listItems(request)).filter((i) => i.id <= beta.id).map((i) => i.name);
    expect(texts.slice(0, fromApi.length)).toEqual(fromApi);
    expect(alpha.id).toBeLessThan(beta.id);
  });

  test("shows an item created through the API before the page opens by its name", async ({ page, request }) => {
    page = newSkyrampPlaywrightPage(page);
    const name = `Legacy ${uniq()}`;
    const legacy = await createItem(request, name);
    expect(Object.keys(legacy).sort()).toEqual(["created_at", "id", "name"]);

    const items = new ItemsPage(page);
    await items.open();

    await expect(items.entry(name)).toHaveCount(1);
    await expect(items.entry(name)).toHaveText(name);
  });

  test("adding an item through the form lists it by name without a reload", async ({ page, request }) => {
    page = newSkyrampPlaywrightPage(page);
    const name = `Gamma ${uniq()}`;
    const items = new ItemsPage(page);
    await items.open();
    await expect(items.entry(name)).toHaveCount(0);

    await items.newItemInput.fill(name);
    const posted = page.waitForResponse((r) => r.url().endsWith("/api/items") && r.request().method() === "POST");
    const reloaded = page.waitForResponse((r) => r.url().endsWith("/api/items") && r.request().method() === "GET");
    await items.addButton.click();
    const response = await posted;
    checkRequestPayload(response.request().postDataJSON(), { name });
    expect(response.status()).toBe(201);
    await reloaded;

    await expect(items.newItemInput).toHaveValue("");
    await expect(items.error).toBeHidden();
    await expect(items.entry(name)).toHaveCount(1);
    const created = (await listItems(request)).filter((i) => i.name === name);
    expect(created).toHaveLength(1);
  });

  test("a whitespace-only name shows the server's error and adds nothing", async ({ page, request }) => {
    page = newSkyrampPlaywrightPage(page);
    const items = new ItemsPage(page);
    await items.open();

    await items.newItemInput.fill("   ");
    const posted = page.waitForResponse((r) => r.url().endsWith("/api/items") && r.request().method() === "POST");
    await items.addButton.click();
    const response = await posted;
    checkRequestPayload(response.request().postDataJSON(), { name: "   " });
    expect(response.status()).toBe(400);

    await expect(items.error).toBeVisible();
    await expect(items.error).toHaveText("name is required");
    expect((await listItems(request)).filter((i) => i.name.trim() === "")).toEqual([]);
  });
});
