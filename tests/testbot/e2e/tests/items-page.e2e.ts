// The Items page lists every item by its name, including one just added through the "New item" form.
import { test, expect, checkRequestPayload, newSkyrampPlaywrightPage } from "@skyramp/skyramp";
import { ItemsPage, LoginPage, createItem, uiCredentials, uniqueName } from "../pages/items-app";

const pageTimeout = 15000;

test.use({ viewport: { width: 1280, height: 900 } });

test.describe("Items page", () => {
  test.beforeEach(async ({ page }) => {
    page.setDefaultTimeout(pageTimeout);
  });

  test("lists each stored item by its name, in API order", async ({ page, request }) => {
    page = newSkyrampPlaywrightPage(page);
    const nameA = uniqueName("Alpha");
    const nameB = uniqueName("Beta");
    const a = await createItem(request, nameA);
    const b = await createItem(request, nameB);

    const { email, password } = uiCredentials();
    const login = new LoginPage(page);
    const items = new ItemsPage(page);
    await login.goto();
    const load = items.waitForItemsLoad();
    await login.signInAs(email, password);
    await expect(page).toHaveURL(/\/items$/);
    await expect(items.userStatus).toHaveText(`Signed in as ${email}`);
    const loaded = (await (await load).json()) as { id: number; name: string }[];

    // The items the page loaded hold the two just made, A before B, by id.
    const ours = loaded.filter((i) => i.id === a.id || i.id === b.id).map((i) => i.name);
    expect(ours).toEqual([nameA, nameB]);

    await items.expectListMatches(loaded);
    await expect.soft(items.entryNamed(nameA)).toHaveCount(1);
    await expect.soft(items.entryNamed(nameB)).toHaveCount(1);
  });

  test("shows a newly added item by its trimmed name without a reload", async ({ page }) => {
    page = newSkyrampPlaywrightPage(page);
    const name = uniqueName("Journey item");
    const typed = `  ${name}  `;

    const { email, password } = uiCredentials();
    const login = new LoginPage(page);
    const items = new ItemsPage(page);
    await login.goto();
    const firstLoad = items.waitForItemsLoad();
    await login.signInAs(email, password);
    await expect(items.userStatus).toHaveText(`Signed in as ${email}`);
    const before = (await (await firstLoad).json()) as { id: number; name: string }[];
    await expect(items.entries).toHaveCount(before.length);
    const beforeTexts = await items.entries.allTextContents();

    await items.newItemInput.fill(typed);
    const postDone = page.waitForResponse(
      (r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/api/items",
    );
    const refresh = items.waitForItemsLoad();
    await items.addItem.click();
    const post = await postDone;
    checkRequestPayload(post.request().postDataJSON(), { name: typed });
    expect(post.status()).toBe(201);
    const created = (await post.json()) as { id: number; name: string };
    expect(created.name).toBe(name);
    const after = (await (await refresh).json()) as { id: number; name: string }[];

    await expect.soft(items.newItemInput).toHaveValue("");
    await expect.soft(items.error).toBeHidden();
    // One more entry for this test's item (others' items added meanwhile are counted from the refresh).
    const othersAdded = after.filter((i) => i.id > Math.max(0, ...before.map((x) => x.id)) && i.id !== created.id);
    await expect.soft(items.entries).toHaveCount(before.length + 1 + othersAdded.length);
    // Earlier entries unchanged, the new one after them, reading exactly the trimmed name.
    await expect.soft(items.entries).toHaveText([...beforeTexts, ...after.slice(before.length).map((i) => i.name)]);
    const newIndex = after.findIndex((i) => i.id === created.id);
    expect.soft(newIndex).toBeGreaterThanOrEqual(before.length);
    await expect.soft(items.entryNamed(name)).toHaveCount(1);

    const reloaded = await items.reload();
    await items.expectListMatches(reloaded);
    await expect.soft(items.entryNamed(name)).toHaveCount(1);
  });

  test("shows an item name containing HTML markup as literal text", async ({ page, request }) => {
    page = newSkyrampPlaywrightPage(page);
    const name = `<b>Bold ${uniqueName("markup")}</b>`;
    const created = await createItem(request, name);

    const items = new ItemsPage(page);
    const loaded = await items.open();
    const index = loaded.findIndex((i) => i.id === created.id);
    expect(index).toBeGreaterThanOrEqual(0);
    await expect(items.entries).toHaveCount(loaded.length);
    await expect.soft(items.entryNamed(name)).toHaveCount(1);
    // textContent is the literal name, and no entry holds a child element (no <b> rendered).
    const texts = await items.entries.evaluateAll((els) => els.map((el) => el.textContent));
    expect.soft(texts).toContain(name);
    const childElements = await items.entries.evaluateAll((els) => els.map((el) => el.childElementCount));
    expect.soft(childElements.every((n) => n === 0)).toBe(true);
  });
});
