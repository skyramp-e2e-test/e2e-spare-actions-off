// Page object for the Items page (/items) and the item API it reads, shared by the Items page tests.
import { expect, type APIRequestContext, type Locator, type Page, type Response } from "@playwright/test";
import { newSkyrampPlaywrightPage } from "@skyramp/skyramp";

export const appUrl = (process.env.SKYRAMP_TEST_BASE_URL || "http://localhost:3000").replace(/\/$/, "");

export type Item = { id: number; name: string; created_at: string };

/** A suffix that keeps the names one run makes apart from every other run's. */
export const runStamp = (): string => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

/** Saves an item the way older code did (only a name) through POST /api/items and returns what the API saved. */
export async function seedItem(request: APIRequestContext, name: string): Promise<Item> {
  const res = await request.post(`${appUrl}/api/items`, { data: { name } });
  expect(res.status(), `POST /api/items {"name": ${JSON.stringify(name)}}`).toBe(201);
  const item = (await res.json()) as Item;
  expect(item.name).toBe(name);
  return item;
}

export async function listItems(request: APIRequestContext): Promise<Item[]> {
  const res = await request.get(`${appUrl}/api/items`);
  expect(res.status(), "GET /api/items").toBe(200);
  return (await res.json()) as Item[];
}

export class ItemsPage {
  readonly page: Page;
  readonly userStatus: Locator;
  readonly list: Locator;
  readonly rows: Locator;
  readonly newItemInput: Locator;
  readonly addItemButton: Locator;
  readonly error: Locator;

  constructor(page: Page) {
    // Wrap the Playwright page with Skyramp's page.
    this.page = newSkyrampPlaywrightPage(page);
    this.userStatus = this.page.getByTestId("user-status");
    this.list = this.page.getByTestId("items-list");
    this.rows = this.list.getByTestId("item");
    this.newItemInput = this.page.getByLabel("New item");
    this.addItemButton = this.page.getByRole("button", { name: "Add item" });
    this.error = this.page.getByTestId("item-error");
  }

  async goto(): Promise<void> {
    await this.page.goto(`${appUrl}/items`);
  }

  /** Signs in on the open /login page, which redirects to /items. */
  async signIn(email: string, password: string): Promise<void> {
    await this.page.getByLabel("Email").fill(email);
    await this.page.getByLabel("Password").fill(password);
    await this.page.getByRole("button", { name: "Sign in" }).click();
  }

  /** The row whose text is exactly this name. */
  row(name: string): Locator {
    return this.rows.filter({ hasText: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) });
  }

  /** Fills New item, clicks Add item and returns the POST /api/items response. */
  async addItem(name: string): Promise<Response> {
    await this.newItemInput.fill(name);
    const posted = this.page.waitForResponse(
      (r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/api/items",
    );
    await this.addItemButton.click();
    return posted;
  }

  async rowTexts(): Promise<string[]> {
    return this.rows.allTextContents();
  }

  /** Waits until the row at the position GET /api/items gives this item reads `name`; the position is what it checks. */
  async expectRowAtApiPositionOf(request: APIRequestContext, id: number, name: string): Promise<void> {
    const position = (await listItems(request)).findIndex((i) => i.id === id);
    await expect.poll(async () => (await this.rowTexts())[position], { message: `row at position ${position} (item ${id})` }).toBe(name);
  }

  /**
   * Waits until the list shows one row per item of GET /api/items, each reading that item's name, in id order.
   * Other tests may add items after the page loaded, so the rows must be the API list up to at least `loadedCount`
   * items (how many there were before the page loaded), and none beyond the list.
   */
  async expectRowsMatchApi(request: APIRequestContext, loadedCount: number): Promise<void> {
    await expect
      .poll(async () => {
        const items = await listItems(request);
        const texts = await this.rowTexts();
        const mismatches: { position: number; id?: number; name?: string; row?: string }[] = [];
        const shown = Math.max(texts.length, loadedCount);
        for (let i = 0; i < shown; i++) {
          if (items[i]?.name !== texts[i]) mismatches.push({ position: i, id: items[i]?.id, name: items[i]?.name, row: texts[i] });
        }
        return mismatches;
      }, { message: "each row's text is the name of the item at the same position in GET /api/items" })
      .toEqual([]);
  }
}
