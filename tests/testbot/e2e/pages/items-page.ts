import type { APIRequestContext, Locator, Page } from "@playwright/test";
import { expect } from "@skyramp/skyramp";

export const baseUrl = (
  process.env.SKYRAMP_TEST_SERVICE_URL_UI ||
  process.env.SKYRAMP_TEST_BASE_URL ||
  "http://localhost:3000"
).replace(/\/$/, "");

export type ApiItem = { id: number; name: string; created_at: string };

/** A name no other run or test uses, so a test finds its own items by the name it sent. */
export function uniqueName(label: string): string {
  return `${label} ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** GET /api/items: every stored item, in id order. */
export async function listItems(request: APIRequestContext): Promise<ApiItem[]> {
  const res = await request.get(`${baseUrl}/api/items`);
  expect(res.status()).toBe(200);
  return (await res.json()) as ApiItem[];
}

/** POST /api/items {name}; the app answers 201 with the stored row. */
export async function createItem(request: APIRequestContext, name: string): Promise<ApiItem> {
  const res = await request.post(`${baseUrl}/api/items`, { data: { name } });
  expect(res.status()).toBe(201);
  const item = (await res.json()) as ApiItem;
  expect(item.name).toBe(name);
  return item;
}

/** The /items page: its sign-in status, item list and add-item form. */
export class ItemsPage {
  readonly userStatus: Locator;
  readonly list: Locator;
  readonly items: Locator;
  readonly newItemInput: Locator;
  readonly addButton: Locator;
  readonly error: Locator;

  constructor(readonly page: Page) {
    this.userStatus = page.getByTestId("user-status");
    this.list = page.getByTestId("items-list");
    this.items = this.list.getByTestId("item");
    this.newItemInput = page.getByLabel("New item");
    this.addButton = page.getByRole("button", { name: "Add item" });
    this.error = page.getByTestId("item-error");
  }

  /** Waits for the page's own next GET /api/items and returns the items it answered with. */
  async nextItemsResponse(): Promise<ApiItem[]> {
    const res = await this.page.waitForResponse(
      (r) => r.request().method() === "GET" && new URL(r.url()).pathname === "/api/items",
    );
    expect(res.status()).toBe(200);
    return (await res.json()) as ApiItem[];
  }

  /** Opens /items and returns the items the page loaded from GET /api/items. */
  async goto(): Promise<ApiItem[]> {
    const loaded = this.nextItemsResponse();
    await this.page.goto(`${baseUrl}/items`);
    return loaded;
  }

  /** Reloads /items and returns the items the page loaded from GET /api/items. */
  async reload(): Promise<ApiItem[]> {
    const loaded = this.nextItemsResponse();
    await this.page.reload();
    return loaded;
  }

  /** Entries whose text is exactly the given name. */
  itemNamed(name: string): Locator {
    return this.items.filter({ hasText: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) });
  }

  async addItem(name: string): Promise<void> {
    await this.newItemInput.fill(name);
    await this.addButton.click();
  }

  /**
   * The list shows exactly the items GET /api/items answered with: one entry per item, each reading that item's
   * name, in the order the API returned them (id order). Retries until the render settles.
   */
  async expectListShows(items: ApiItem[]): Promise<void> {
    await expect(this.items).toHaveCount(items.length);
    await expect(this.items).toHaveText(items.map((i) => i.name));
  }

  /**
   * The given item is listed by its exact name as the last entry of the items stored up to it (in id order): items
   * other tests add at the same time get later ids and follow it.
   */
  async expectListedLast(listed: ApiItem[], item: ApiItem, { soft = false } = {}): Promise<void> {
    const check = soft ? expect.soft : expect;
    const upTo = listed.filter((i) => i.id <= item.id);
    check(upTo[upTo.length - 1]).toEqual(item);
    // Found by its exact name, once; the entries read, in order, the listed names, which puts it right after the
    // items stored before it.
    await check(this.itemNamed(item.name)).toHaveCount(1);
    await check(this.items).toHaveText(listed.map((i) => i.name));
  }
}
