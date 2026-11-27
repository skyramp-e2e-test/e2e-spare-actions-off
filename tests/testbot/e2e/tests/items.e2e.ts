// Items page: every item from GET /api/items is listed on /items, one entry per item, showing its name.
// Recorded with the Skyramp walk helper, then extended to check the whole expected outcome of each case.
import { test, expect, checkRequestPayload, getBaseUrl, newSkyrampPlaywrightPage } from '@skyramp/skyramp';
import type { APIRequestContext, Locator, Page } from '@playwright/test';

const baseUrl = getBaseUrl('SKYRAMP_TEST_BASE_URL', 'http://localhost:3000');
const uiUrl = process.env.SKYRAMP_TEST_SERVICE_URL_UI || baseUrl;

type Item = { id: number; name: string; created_at: string };

const unique = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

test.use({ viewport: { width: 1280, height: 900 } });

async function apiItems(request: APIRequestContext): Promise<Item[]> {
  const res = await request.get(`${baseUrl}/api/items`);
  expect(res.status()).toBe(200);
  return res.json();
}

async function createItem(request: APIRequestContext, name: string): Promise<Item> {
  const res = await request.post(`${baseUrl}/api/items`, { data: { name } });
  expect(res.status()).toBe(201);
  const item: Item = await res.json();
  expect(item.name).toBe(name);
  return item;
}

function credentials() {
  const username = process.env.SKYRAMP_UI_USERNAME;
  const password = process.env.SKYRAMP_UI_PASSWORD;
  if (!username || !password) {
    throw new Error('SKYRAMP_UI_USERNAME and SKYRAMP_UI_PASSWORD must be set: these tests sign in through /login');
  }
  return { username, password };
}

async function signIn(page: Page) {
  const { username, password } = credentials();
  await page.goto(`${uiUrl}/login`);
  await page.getByLabel('Email').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/items$/);
  await expect(page.getByTestId('user-status')).toHaveText(`Signed in as ${username}`);
}

// Runs the action that loads /items and waits until the list holds one entry per item that page load fetched.
async function untilListLoaded(page: Page, entries: Locator, action: () => Promise<unknown>) {
  const loaded = page.waitForResponse(
    (r) => new URL(r.url()).pathname === '/api/items' && r.request().method() === 'GET',
  );
  await action();
  const items: Item[] = await (await loaded).json();
  await expect(entries).toHaveCount(items.length);
}

// Fills the New item field, submits it, and checks the request body the page sent.
async function addItemThroughForm(page: Page, name: string) {
  await page.getByLabel('New item').fill(name);
  const responsePromise = page.waitForResponse(
    (r) => r.url().endsWith('/api/items') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Add item' }).click();
  const response = await responsePromise;
  checkRequestPayload(response.request().postDataJSON(), { name });
  expect(response.status()).toBe(201);
}

test('Items page lists every item from the API by name, in id order', async ({ page, request }) => {
  page = newSkyrampPlaywrightPage(page);
  const u = unique();
  const first = await createItem(request, `List Alpha ${u}`);
  const second = await createItem(request, `List Beta ${u}`);

  await page.goto(`${uiUrl}/items`);
  await expect(page.getByTestId('items-list')).toBeVisible();
  const items = await apiItems(request);
  const names = items.map((i) => i.name);
  expect(names).toContain(first.name);
  expect(names).toContain(second.name);

  const entries = page.getByTestId('items-list').getByTestId('item');
  await expect(entries).toHaveCount(items.length);
  await expect(entries).toHaveText(names);
  await expect(entries.filter({ hasText: first.name })).toHaveText(first.name);
  await expect(entries.filter({ hasText: second.name })).toHaveText(second.name);
});

test('Items page shows item names, not blank entries', async ({ page, request }) => {
  page = newSkyrampPlaywrightPage(page);
  const name = `Walk Alpha ${unique()}`;
  await createItem(request, name);

  const entries = page.getByTestId('item');
  await untilListLoaded(page, entries, () => page.goto(`${uiUrl}/items`));
  await expect(entries.filter({ hasText: name })).toBeVisible();
  await expect(entries.filter({ hasText: name })).toHaveText(name);
  const texts = await entries.allTextContents();
  expect(texts.filter((t) => t.trim() === '')).toEqual([]);
});

test('Adding an item through the form lists it by name without a reload', async ({ page }) => {
  page = newSkyrampPlaywrightPage(page);
  const entries = page.getByTestId('items-list').getByTestId('item');
  await untilListLoaded(page, entries, () => page.goto(`${uiUrl}/items`));
  const before = await entries.allTextContents();

  const name = `Form Item ${unique()}`;
  // Submitted with surrounding spaces: the entry shows the name trimmed, as the API stores it.
  await addItemThroughForm(page, `  ${name}  `);

  await expect(entries).toHaveCount(before.length + 1);
  // The order is what this checks: earlier entries unchanged, the new name last.
  await expect(entries).toHaveText([...before, name]);
  await expect(page.getByLabel('New item')).toHaveValue('');
  await expect(page.getByTestId('item-error')).toBeHidden();
});

test('An item added on the page is still listed by name after a reload', async ({ page, request }) => {
  page = newSkyrampPlaywrightPage(page);
  const entries = page.getByTestId('items-list').getByTestId('item');
  await untilListLoaded(page, entries, () => page.goto(`${uiUrl}/items`));
  const beforeCount = await entries.count();

  const name = `Reload Item ${unique()}`;
  await addItemThroughForm(page, name);
  await expect(entries).toHaveCount(beforeCount + 1);

  await page.reload();
  const items = await apiItems(request);
  expect(items[items.length - 1].name).toBe(name);
  await expect(entries).toHaveCount(items.length);
  // The order is what this checks: every API name in id order, the added name last.
  await expect(entries).toHaveText(items.map((i) => i.name));
  await expect(entries.filter({ hasText: name })).toHaveText(name);
});

test('A signed-in user adds an item and sees its name as the last entry', async ({ page }) => {
  page = newSkyrampPlaywrightPage(page);
  const entries = page.getByTestId('item');
  await untilListLoaded(page, entries, () => signIn(page));
  const before = await entries.allTextContents();

  const name = `Walk Item ${unique()}`;
  await addItemThroughForm(page, name);

  await expect(entries).toHaveCount(before.length + 1);
  // The order is what this checks: the new name is the last entry.
  await expect(entries).toHaveText([...before, name]);
  await expect(page.getByTestId('item-error')).toBeHidden();
  await expect(page.getByLabel('New item')).toHaveValue('');
});

test('Journey: sign in, view the item list, add an item and see it listed', async ({ page, request }) => {
  page = newSkyrampPlaywrightPage(page);
  const u = unique();
  const setupNames = [`Journey Alpha ${u}`, `Journey Beta ${u}`];
  for (const n of setupNames) await createItem(request, n);
  const itemName = `Walk Item ${u}`;
  const entries = page.getByTestId('items-list').getByTestId('item');
  let before: string[] = [];

  await test.step('1. sign in at /login', async () => {
    await untilListLoaded(page, entries, () => signIn(page));
  });

  await test.step('2. view the item list', async () => {
    const names = (await apiItems(request)).map((i) => i.name);
    expect.soft(names).toEqual(expect.arrayContaining(setupNames));
    await expect.soft(entries).toHaveCount(names.length);
    await expect.soft(entries).toHaveText(names);
    before = await entries.allTextContents();
  });

  await test.step('3. add an item through the New item form', async () => {
    await addItemThroughForm(page, itemName);
    await expect.soft(entries).toHaveCount(before.length + 1);
    // The order is what this checks: earlier entries unchanged, the new name last.
    await expect.soft(entries).toHaveText([...before, itemName]);
    await expect.soft(page.getByLabel('New item')).toHaveValue('');
    await expect.soft(page.getByTestId('item-error')).toBeHidden();
  });

  await test.step('4. reload the page', async () => {
    await page.reload();
    const { username } = credentials();
    await expect.soft(page.getByTestId('user-status')).toHaveText(`Signed in as ${username}`);
    const items = await apiItems(request);
    const names = items.map((i) => i.name);
    expect.soft(names[names.length - 1]).toBe(itemName);
    await expect.soft(entries).toHaveCount(names.length);
    // The order is what this checks: every API name in id order, the added name last.
    await expect.soft(entries).toHaveText(names);
    await expect.soft(page.getByLabel('New item')).toHaveValue('');
    await expect.soft(page.getByTestId('item-error')).toBeHidden();
  });
});
