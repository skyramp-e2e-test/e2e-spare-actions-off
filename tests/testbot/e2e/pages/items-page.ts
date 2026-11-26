// Page object for /items (public/items.html) and the API calls its tests seed through.
import type { APIRequestContext, Locator, Page } from "@playwright/test";

export const apiBaseUrl = process.env.SKYRAMP_TEST_BASE_URL || "http://localhost:3000";
export const uiBaseUrl = process.env.SKYRAMP_TEST_SERVICE_URL_UI || apiBaseUrl;

export interface StoredItem {
  id: number;
  name: string;
  created_at: string;
}

/** A suffix unique to this run, so names a test sends are its own. */
export const uniq = (): string => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** POST /api/items {name}; returns the stored row. */
export async function createItem(request: APIRequestContext, name: string): Promise<StoredItem> {
  const res = await request.post(`${apiBaseUrl}/api/items`, { data: { name } });
  if (res.status() !== 201) throw new Error(`POST /api/items ${JSON.stringify(name)} answered ${res.status()}: ${await res.text()}`);
  return res.json();
}

/** GET /api/items. */
export async function listItems(request: APIRequestContext): Promise<StoredItem[]> {
  const res = await request.get(`${apiBaseUrl}/api/items`);
  if (res.status() !== 200) throw new Error(`GET /api/items answered ${res.status()}`);
  return res.json();
}

export class ItemsPage {
  readonly list: Locator;
  readonly entries: Locator;
  readonly newItemInput: Locator;
  readonly addButton: Locator;
  readonly error: Locator;
  readonly userStatus: Locator;

  constructor(readonly page: Page) {
    this.list = page.getByTestId("items-list");
    this.entries = this.list.getByTestId("item");
    this.newItemInput = page.getByLabel("New item");
    this.addButton = page.getByRole("button", { name: "Add item" });
    this.error = page.getByTestId("item-error");
    this.userStatus = page.getByTestId("user-status");
  }

  /** Opens /items and waits for its first load of GET /api/items. */
  async open(): Promise<void> {
    const loaded = this.page.waitForResponse((r) => r.url().endsWith("/api/items") && r.request().method() === "GET");
    await this.page.goto(`${uiBaseUrl}/items`);
    await loaded;
  }

  /** The list entry whose whole text is `name`. */
  entry(name: string): Locator {
    return this.entries.filter({ hasText: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) });
  }
}
