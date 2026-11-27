import type { Locator, Page, Response } from "@playwright/test";

export interface StoredItem {
  id: number;
  name: string;
  created_at: string;
}

/** The Items page (/items): the add-item form and the list of stored items. */
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

  /** The list entry whose whole text is exactly this name. */
  entryNamed(name: string): Locator {
    const exact = new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`);
    return this.entries.filter({ hasText: exact });
  }

  /** Resolves with the items the page's next GET /api/items returned, the list it renders. */
  async nextItemsLoad(): Promise<StoredItem[]> {
    const response: Response = await this.page.waitForResponse(
      (r) => new URL(r.url()).pathname === "/api/items" && r.request().method() === "GET",
    );
    return (await response.json()) as StoredItem[];
  }

  async open(baseUrl: string): Promise<StoredItem[]> {
    const loaded = this.nextItemsLoad();
    await this.page.goto(`${baseUrl}/items`);
    return loaded;
  }
}
