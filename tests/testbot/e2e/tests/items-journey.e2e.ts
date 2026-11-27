// Journey: sign in, see my items, add a new item and see it listed, still there after a reload.
import { test, expect, checkRequestPayload, newSkyrampPlaywrightPage } from "@skyramp/skyramp";
import { ApiItem, ItemsPage, LoginPage, baseUrl, createItem, uiCredentials, uniqueName } from "../pages/items-app";

test.use({ viewport: { width: 1280, height: 900 } });

test("signed-in user sees their items by name, adds one and still sees it after a reload", async ({ page, request }) => {
  test.setTimeout(60000);
  page.setDefaultTimeout(15000);
  page = newSkyrampPlaywrightPage(page);

  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const alpha = `Alpha ${suffix}`;
  const beta = `Beta ${suffix}`;
  const gamma = `Gamma ${suffix}`;
  const { email, password } = uiCredentials();
  const login = new LoginPage(page);
  const items = new ItemsPage(page);
  let loaded: ApiItem[] = [];
  let gammaItem: ApiItem | undefined;

  await test.step("1. sign in at /login and land on /items", async () => {
    const a = await createItem(request, alpha);
    const b = await createItem(request, beta);
    expect([a.name, b.name]).toEqual([alpha, beta]);
    await login.goto();
    const load = items.waitForItemsLoad();
    await login.signInAs(email, password);
    await expect.soft(page).toHaveURL(`${baseUrl}/items`);
    await expect.soft(items.userStatus).toHaveText(`Signed in as ${email}`);
    loaded = (await (await load).json()) as ApiItem[];
  });

  await test.step("2. the list shows each item by its name", async () => {
    await items.expectListMatches(loaded);
    await expect.soft(items.entryNamed(alpha)).toHaveCount(1);
    await expect.soft(items.entryNamed(beta)).toHaveCount(1);
  });

  await test.step("3. add an item through the New item form", async () => {
    await expect(items.entries).toHaveCount(loaded.length);
    const post = page.waitForResponse(
      (r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/api/items",
    );
    const refresh = items.waitForItemsLoad();
    await items.newItemInput.fill(gamma);
    await items.addItem.click();
    const res = await post;
    checkRequestPayload(res.request().postDataJSON(), { name: gamma });
    expect(res.status()).toBe(201);
    gammaItem = (await res.json()) as ApiItem;
    const after = (await (await refresh).json()) as ApiItem[];
    await expect.soft(items.newItemInput).toHaveValue("");
    await expect.soft(items.error).toBeHidden();
    await expect.soft(items.entries).toHaveCount(after.length);
    expect.soft(after.length).toBeGreaterThanOrEqual(loaded.length + 1);
    expect.soft(after.filter((x) => x.id === gammaItem!.id).map((x) => x.name)).toEqual([gamma]);
    await expect.soft(items.entryNamed(gamma)).toHaveCount(1);
    await expect.soft(items.entries).toHaveText(after.map((x) => x.name));
  });

  await test.step("4. after a reload the same entries are listed", async () => {
    const reloaded = await items.reload();
    await expect.soft(items.userStatus).toHaveText(`Signed in as ${email}`);
    await items.expectListMatches(reloaded);
    // This test's three items, in list order, read Alpha, Beta, Gamma (others' items may sit between them).
    const ours = [alpha, beta, gamma];
    const positions = reloaded.map((x, idx) => (ours.includes(x.name) ? idx : -1)).filter((idx) => idx >= 0);
    expect.soft(positions.map((idx) => reloaded[idx].name)).toEqual(ours);
    for (const name of ours) {
      await expect.soft(items.entryNamed(name)).toHaveCount(1);
    }
    await expect.soft(items.newItemInput).toHaveValue("");
    await expect.soft(items.error).toBeHidden();
  });
});
