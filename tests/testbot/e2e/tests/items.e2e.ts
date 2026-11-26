// Items page (/items): every item GET /api/items returns is listed by its name,
// including one just added through the page's "New item" form.
// Drafted from Skyramp walks of signing in and adding an item, then fitted to the Items page object.
import { test, expect, type Page } from "@playwright/test";
import { checkRequestPayload } from "@skyramp/skyramp";
import {
  ItemsPage,
  LoginPage,
  appBaseUrl,
  createItem,
  listItems,
  signInAccount,
  skyrampPage,
  uniqueName,
} from "../pages/items-page";

test.use({ viewport: { width: 1280, height: 900 } });

async function signIn(page: Page): Promise<ItemsPage> {
  const { email, password } = signInAccount();
  await page.goto(`${appBaseUrl}/login`);
  await new LoginPage(page).signInAs(email, password);
  await expect(page).toHaveURL(/\/items$/);
  return new ItemsPage(page);
}

/** Clicks Add item and checks the POST /api/items request carried the name typed. */
async function addItem(page: Page, items: ItemsPage, name: string): Promise<void> {
  await items.newItem.fill(name);
  const posted = page.waitForResponse(
    (res) => res.url().endsWith("/api/items") && res.request().method() === "POST",
  );
  await items.addItem.click();
  const response = await posted;
  checkRequestPayload(response.request().postDataJSON(), { name });
  expect(response.status()).toBe(201);
}

test("lists items created through the API by their stored names, in creation order", async ({ page, request }) => {
  page = skyrampPage(page);
  const lamp = uniqueName("Desk lamp");
  const mug = uniqueName("Coffee mug");
  await createItem(request, lamp);
  await createItem(request, mug);

  const items = await signIn(page);
  await expect(items.heading).toHaveText("Items");
  await expect(items.userStatus).toHaveText(`Signed in as ${signInAccount().email}`);

  // The two items this test stored are listed by their names, lamp before mug.
  await expect
    .poll(async () => (await items.texts()).filter((t) => t === lamp || t === mug))
    .toEqual([lamp, mug]);
  // No entry is blank.
  await expect.poll(async () => (await items.texts()).filter((t) => t.trim() === "")).toEqual([]);
});

test("every list entry's text equals the name GET /api/items returns at that position", async ({ page, request }) => {
  page = skyrampPage(page);
  await createItem(request, uniqueName("Listed item"));
  const items = new ItemsPage(page);

  // Retried with a reload, so an item another run adds between the two reads does not decide it.
  await expect(async () => {
    await items.goto();
    const api = await listItems(request);
    await expect(items.items).toHaveCount(api.length);
    expect(await items.texts()).toEqual(api.map((item) => item.name));
  }).toPass({ timeout: 20000 });
});

test("adding an item with the New item form lists it last by name, clears the input and keeps it after a reload", async ({ page }) => {
  page = skyrampPage(page);
  const items = await signIn(page);
  await expect(items.userStatus).toHaveText(`Signed in as ${signInAccount().email}`);
  await expect(items.list).toBeVisible();
  // Wait for the first load of the list to settle before reading it.
  const before = await (async () => {
    const api = await listItems(page.request);
    await expect(items.items).toHaveCount(api.length);
    return items.texts();
  })();

  const name = uniqueName("Walk item");
  await addItem(page, items, name);

  await expect(items.items).toHaveCount(before.length + 1);
  await expect.poll(async () => (await items.texts()).at(-1)).toBe(name);
  expect(await items.texts()).toEqual([...before, name]);
  await expect(items.newItem).toHaveValue("");
  await expect(items.error).toBeHidden();

  await page.reload();
  await expect(items.items).toHaveCount(before.length + 1);
  expect(await items.texts()).toEqual([...before, name]);
});

test("journey: sign in, open Items, add two items and see them listed by name after a reload", async ({ page }) => {
  page = skyrampPage(page);
  const { email, password } = signInAccount();
  const first = uniqueName("First item");
  const second = uniqueName("Second item");
  const items = new ItemsPage(page);
  let before: string[] = [];

  await test.step("1. / - open Login from the nav", async () => {
    await page.goto(`${appBaseUrl}/`);
    await page.getByTestId("nav-login").click();
    await expect(page).toHaveURL(/\/login$/);
    const login = new LoginPage(page);
    await expect.soft(login.email).toBeVisible();
    await expect.soft(login.password).toBeVisible();
  });

  await test.step("2. /login - sign in and land on /items", async () => {
    await new LoginPage(page).signInAs(email, password);
    await expect(page).toHaveURL(/\/items$/);
    await expect.soft(items.userStatus).toHaveText(`Signed in as ${email}`);
    const api = await listItems(page.request);
    await expect(items.items).toHaveCount(api.length);
    before = await items.texts();
  });

  await test.step("3. /items - add the first item", async () => {
    await addItem(page, items, first);
    await expect(items.items).toHaveCount(before.length + 1);
    await expect.configure({ soft: true }).poll(async () => (await items.texts()).at(-1)).toBe(first);
    await expect.soft(items.newItem).toHaveValue("");
    await expect.soft(items.error).toBeHidden();
  });

  await test.step("4. /items - add the second item", async () => {
    await addItem(page, items, second);
    await expect(items.items).toHaveCount(before.length + 2);
    expect.soft((await items.texts()).slice(-2)).toEqual([first, second]);
  });

  await test.step("5. /items - reload and see the same list", async () => {
    await page.reload();
    await expect(items.items).toHaveCount(before.length + 2);
    const after = await items.texts();
    expect.soft(after).toEqual([...before, first, second]);
    const api = await listItems(page.request);
    expect.soft(after).toEqual(api.map((item) => item.name));
    expect.soft(after.filter((t) => t.trim() === "")).toEqual([]);
    await expect.soft(items.userStatus).toHaveText(`Signed in as ${email}`);
    await expect.soft(items.newItem).toHaveValue("");
    await expect.soft(items.error).toBeHidden();
  });
});
