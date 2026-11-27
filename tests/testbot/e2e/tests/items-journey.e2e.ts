import { test, checkRequestPayload, expect, getBaseUrl, newSkyrampPlaywrightPage } from "@skyramp/skyramp";
import { ItemsPage, type StoredItem } from "../pages/items-page";
import { createItem, uniqueSuffix } from "../items-api";

// The app has no endpoint that deletes an item: .skyramp/cleanup/items-page.sh removes what this test creates.
const baseUrl = getBaseUrl("SKYRAMP_TEST_BASE_URL", "http://localhost:3000");

test.use({ viewport: { width: 1280, height: 900 } });

test("Signed-in user opens Items, sees every item by name, adds one and still sees it after a reload", async ({ page, request }) => {
  test.setTimeout(60000);
  page.setDefaultTimeout(15000);
  page = newSkyrampPlaywrightPage(page);
  const email = process.env.SKYRAMP_UI_USERNAME;
  const password = process.env.SKYRAMP_UI_PASSWORD;
  if (!email || !password) throw new Error("SKYRAMP_UI_USERNAME and SKYRAMP_UI_PASSWORD must be set to sign in");

  const suffix = uniqueSuffix();
  const preOne = await createItem(request, baseUrl, `J1 pre one ${suffix}`);
  const preTwo = await createItem(request, baseUrl, `J1 pre two ${suffix}`);
  const added = `J1 added ${suffix}`;
  const items = new ItemsPage(page);
  let shown: StoredItem[] = [];

  await test.step("1. sign in on /login and land on /items", async () => {
    await page.goto(`${baseUrl}/login`);
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    const loaded = items.nextItemsLoad();
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(`${baseUrl}/items`);
    await expect(items.userStatus).toHaveText(`Signed in as ${email}`);
    shown = await loaded;
  });

  await test.step("2. the list shows every stored item by name, in id order", async () => {
    await expect(items.entries).toHaveCount(shown.length);
    expect.soft(shown.map((i) => i.id)).toEqual(expect.arrayContaining([preOne.id, preTwo.id]));
    await expect.soft(items.entries).toHaveText(shown.map((i) => i.name));
    await expect.soft(items.entryNamed(preOne.name)).toHaveText(`J1 pre one ${suffix}`);
    await expect.soft(items.entryNamed(preTwo.name)).toHaveText(`J1 pre two ${suffix}`);
  });

  await test.step("3. add an item through the New item form", async () => {
    await items.newItemInput.fill(added);
    const posted = page.waitForResponse(
      (r) => new URL(r.url()).pathname === "/api/items" && r.request().method() === "POST",
    );
    const reloaded = items.nextItemsLoad();
    await items.addButton.click();
    const response = await posted;
    checkRequestPayload(response.request().postDataJSON(), { name: added });
    const before = shown;
    shown = await reloaded;
    // Other tests may add items at the same time: the earlier list stays first, the new item comes after it, once.
    expect.soft(shown.slice(0, before.length).map((i) => i.id)).toEqual(before.map((i) => i.id));
    const addedIndex = shown.findIndex((i) => i.name === added);
    expect.soft(addedIndex).toBeGreaterThanOrEqual(before.length);
    await expect.soft(items.entries).toHaveCount(shown.length);
    await expect.soft(items.entryNamed(added)).toHaveText(added);
    await expect.soft(items.entries.filter({ hasText: added })).toHaveCount(1);
    await expect.soft(items.newItemInput).toHaveValue("");
    await expect.soft(items.error).toBeHidden();
  });

  await test.step("4. after a reload the list and sign-in state are unchanged", async () => {
    const loaded = items.nextItemsLoad();
    await page.reload();
    const stored = await loaded;
    await expect(page).toHaveURL(`${baseUrl}/items`);
    await expect(items.userStatus).toHaveText(`Signed in as ${email}`);
    await expect(items.error).toBeHidden();
    await expect(items.newItemInput).toHaveValue("");
    await expect(items.entries).toHaveCount(stored.length);
    await expect(items.entries).toHaveText(stored.map((i) => i.name));
    await expect(items.entries.filter({ hasText: /\S/ })).toHaveCount(stored.length);
    const ours = stored.filter((i) => i.name.endsWith(suffix)).map((i) => i.name);
    expect(ours).toEqual([`J1 pre one ${suffix}`, `J1 pre two ${suffix}`, added]);
    await expect(items.entryNamed(`J1 pre one ${suffix}`)).toHaveText(`J1 pre one ${suffix}`);
    await expect(items.entryNamed(`J1 pre two ${suffix}`)).toHaveText(`J1 pre two ${suffix}`);
    await expect(items.entryNamed(added)).toHaveText(added);
  });
});
