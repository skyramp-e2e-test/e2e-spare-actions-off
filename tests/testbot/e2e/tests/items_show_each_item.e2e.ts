// Journey: sign in, add an item and see every item listed by name.
import { expect, test } from "@playwright/test";
import { checkRequestPayload } from "@skyramp/skyramp";
import { ItemsPage, appUrl, listItems, runStamp } from "../support/items-page";

test("signs in, adds an item and sees every item listed by name, also after a reload", async ({ page, request }) => {
  const email = process.env.SKYRAMP_UI_USERNAME;
  const password = process.env.SKYRAMP_UI_PASSWORD;
  if (!email || !password) {
    throw new Error("SKYRAMP_UI_USERNAME and SKYRAMP_UI_PASSWORD must be set: this journey signs in through /login");
  }
  const name = `Journey item ${runStamp()}`;
  const items = new ItemsPage(page);
  let savedId: number | undefined;

  let loadedCount = 0;

  await test.step("1. sign in on /login and land on /items", async () => {
    loadedCount = (await listItems(request)).length;
    await page.goto(`${appUrl}/login`);
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
    await items.signIn(email, password);
    await expect(page).toHaveURL(/\/items$/);
    await expect.soft(items.userStatus).toHaveText(`Signed in as ${email}`);
  });

  await test.step("2. the list shows each item from GET /api/items by name, in id order", async () => {
    await expect(items.list).toBeVisible();
    await items.expectRowsMatchApi(request, loadedCount).catch((e) => expect.soft(e, "rows match GET /api/items").toBeUndefined());
  });

  await test.step("3. add an item with the Add item form; it shows at once by name", async () => {
    const posted = await items.addItem(name);
    expect(posted.status()).toBe(201);
    checkRequestPayload(posted.request().postDataJSON(), { name });
    savedId = (await posted.json()).id;
    await expect.soft(items.newItemInput).toHaveValue("");
    await expect.soft(items.error).toBeHidden();
    await expect.soft(items.row(name)).toHaveCount(1);
    await items.expectRowAtApiPositionOf(request, savedId as number, name).catch((e) => expect.soft(e, "added item's row reads its name").toBeUndefined());
  });

  await test.step("4. after a reload, every row still reads its item's name", async () => {
    loadedCount = (await listItems(request)).length;
    await page.reload();
    await expect(items.list).toBeVisible();
    await expect.soft(items.row(name)).toHaveCount(1);
    await items.expectRowAtApiPositionOf(request, savedId as number, name).catch((e) => expect.soft(e, "added item's row reads its name").toBeUndefined());
    await items.expectRowsMatchApi(request, loadedCount).catch((e) => expect.soft(e, "rows match GET /api/items").toBeUndefined());
    await expect.soft(items.newItemInput).toHaveValue("");
    await expect.soft(items.error).toBeHidden();
    await expect.soft(items.userStatus).toHaveText(`Signed in as ${email}`);
  });
});
