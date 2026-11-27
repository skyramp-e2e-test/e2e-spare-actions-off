import { expect, type APIRequestContext, type Page, type Response } from "@playwright/test";

export const baseUrl =
  process.env.SKYRAMP_TEST_SERVICE_URL_UI || process.env.SKYRAMP_TEST_BASE_URL || "http://localhost:3000";

export interface StoredItem {
  id: number;
  name: string;
  created_at: string;
}

/** The login the run supplies; read by name, never defaulted. */
export function uiCredentials(): { username: string; password: string } {
  const username = process.env.SKYRAMP_UI_USERNAME;
  const password = process.env.SKYRAMP_UI_PASSWORD;
  if (!username || !password) {
    throw new Error("SKYRAMP_UI_USERNAME and SKYRAMP_UI_PASSWORD must be set to sign in");
  }
  return { username, password };
}

/** Creates an item through the API, as older records were created, and returns what the app stored. */
export async function createItem(request: APIRequestContext, name: string): Promise<StoredItem> {
  const res = await request.post(`${baseUrl}/api/items`, {
    headers: { "Content-Type": "application/json" },
    data: { name },
  });
  expect(res.status()).toBe(201);
  return (await res.json()) as StoredItem;
}

const isItemsList = (r: Response) =>
  r.request().method() === "GET" && new URL(r.url()).pathname === "/api/items";

export class ItemsPage {
  constructor(readonly page: Page) {}

  get userStatus() { return this.page.getByTestId("user-status"); }
  get list() { return this.page.getByTestId("items-list"); }
  get items() { return this.list.getByTestId("item"); }
  get newItemInput() { return this.page.getByLabel("New item"); }
  get addButton() { return this.page.getByRole("button", { name: "Add item" }); }
  get error() { return this.page.getByTestId("item-error"); }

  /**
   * Signs in at /login and lands on /items; returns the items list the page itself loaded.
   * Pass open = false when the test has already opened /login itself.
   */
  async signIn(open = true): Promise<StoredItem[]> {
    const { username, password } = uiCredentials();
    if (open) await this.page.goto(`${baseUrl}/login`);
    await this.page.getByLabel("Email").fill(username);
    await this.page.getByLabel("Password").fill(password);
    const loaded = this.page.waitForResponse(isItemsList);
    await this.page.getByRole("button", { name: "Sign in" }).click();
    await expect(this.page).toHaveURL(`${baseUrl}/items`);
    await expect(this.userStatus).toHaveText(`Signed in as ${username}`);
    return (await (await loaded).json()) as StoredItem[];
  }

  /** Reloads /items; returns the items list the page loaded. */
  async reload(): Promise<StoredItem[]> {
    const loaded = this.page.waitForResponse(isItemsList);
    await this.page.reload();
    return (await (await loaded).json()) as StoredItem[];
  }

  /**
   * Adds an item through the form; returns the POST response and the list the page loaded after it.
   */
  async addItem(name: string): Promise<{ created: Response; items: StoredItem[] }> {
    await this.newItemInput.fill(name);
    const created = this.page.waitForResponse(
      (r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/api/items",
    );
    const reloaded = this.page.waitForResponse(isItemsList);
    await this.addButton.click();
    const createdRes = await created;
    return { created: createdRes, items: (await (await reloaded).json()) as StoredItem[] };
  }

  /** Every entry shows its item's name, in the order the API returned them, and none is blank. */
  async expectListShows(items: StoredItem[], soft = false): Promise<void> {
    await (soft ? expect.soft : expect)(this.items).toHaveText(items.map((i) => i.name));
  }
}
