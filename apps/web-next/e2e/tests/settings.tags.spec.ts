import { test, expect } from "@playwright/test";
import {
  createTestUser,
  deleteTestUser,
  loginUser,
  cleanupReferenceDataForUser,
} from "../utils/test-helpers";

test.describe("Tags", () => {
  let testUser: { email: string; password: string; userId: string };

  test.beforeAll(async () => {
    testUser = await createTestUser();
  });

  test.afterAll(async () => {
    await cleanupReferenceDataForUser(testUser.userId);
    await deleteTestUser(testUser.userId);
  });

  test.beforeEach(async ({ page }) => {
    await loginUser(page, testUser.email, testUser.password);
  });

  test("user can create a tag", async ({ page }) => {
    const ts = Date.now();
    const name = `e2e-tag-create-name-${ts}`;
    const desc = `e2e-tag-create-desc-${ts}`;

    await page.goto("/tags");

    // Click create button
    await page.getByRole("button", { name: /create/i }).click();

    // Fill form
    await page.getByRole("textbox", { name: "* Name" }).fill(name);
    await page.getByRole("textbox", { name: "Description" }).fill(desc);

    // Submit
    await page.getByRole("button", { name: /save/i }).click();

    // Should redirect to list
    await expect(page).toHaveURL(/\/tags/);
    await expect(page.getByRole("heading", { name: "Tags" })).toBeVisible();

    // Verify tag appears in list
    await expect(
      page.getByRole("cell", { name: name, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("cell", { name: desc, exact: true }),
    ).toBeVisible();
  });

  test("user can edit a tag", async ({ page }) => {
    const ts = Date.now();
    const name = `e2e-tag-edit-${ts}`;
    const desc = `e2e-tag-edit-desc-${ts}`;
    const updatedName = `${name}-updated`;
    const updatedDesc = `${desc}-updated`;

    // Create tag
    await page.goto("/tags/create");
    await page.getByRole("textbox", { name: "* Name" }).fill(name);
    await page.getByRole("textbox", { name: "Description" }).fill(desc);
    await page.getByRole("button", { name: /save/i }).click();

    await page.waitForURL(/\/tags/);
    await expect(page.getByRole("heading", { name: "Tags" })).toBeVisible();
    await expect(
      page.getByRole("cell", { name: name, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("cell", { name: desc, exact: true }),
    ).toBeVisible();

    // Click edit on the created tag
    await page
      .getByRole("row")
      .filter({ hasText: name })
      .getByRole("button", { name: "edit" })
      .click();

    await expect(page.getByRole("heading", { name: "Edit Tag" })).toBeVisible();

    // Update fields
    await page.getByRole("textbox", { name: "* Name" }).clear();
    await page.getByRole("textbox", { name: "* Name" }).fill(updatedName);
    await page.getByRole("textbox", { name: "Description" }).clear();
    await page.getByRole("textbox", { name: "Description" }).fill(updatedDesc);

    // Save
    await page.getByRole("button", { name: /save/i }).click();

    // Verify updated
    await expect(page).toHaveURL(/\/tags/);
    await expect(page.getByRole("heading", { name: "Tags" })).toBeVisible();

    await expect(
      page.getByRole("cell", { name: updatedName, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("cell", { name: updatedDesc, exact: true }),
    ).toBeVisible();

    // Old values gone
    await expect(
      page.getByRole("cell", { name: name, exact: true }),
    ).not.toBeVisible();
  });

  test("user can delete a tag", async ({ page }) => {
    const ts = Date.now();
    const name = `e2e-tag-delete-name${ts}`;

    // Create tag
    await page.goto("/tags/create");
    await page.getByRole("textbox", { name: "* Name" }).fill(name);
    await page.getByRole("button", { name: /save/i }).click();
    await page.waitForURL(/\/tags/);
    await expect(page.getByRole("heading", { name: "Tags" })).toBeVisible();

    // Verify it exists
    await expect(
      page.getByRole("cell", { name: name, exact: true }),
    ).toBeVisible();

    // Delete
    await page
      .getByRole("row")
      .filter({ hasText: name })
      .getByRole("button", { name: "delete" })
      .click();

    // Handle confirmation
    await expect(page.getByText("Are you sure?")).toBeVisible();
    await page.getByRole("button", { name: "Delete", exact: true }).click();

    // Verify deleted
    await expect(
      page.getByRole("cell", { name: name, exact: true }),
    ).not.toBeVisible();
  });

  test("user can view tag details", async ({ page }) => {
    const ts = Date.now();
    const name = `e2e-tag-show-name-${ts}`;
    const desc = `e2e-tag-show-desc-${ts}`;

    // Create tag
    await page.goto("/tags/create");
    await page.getByRole("textbox", { name: "* Name" }).fill(name);
    await page.getByRole("textbox", { name: "Description" }).fill(desc);
    await page.getByRole("button", { name: /save/i }).click();

    // Click show button
    await page
      .getByRole("row")
      .filter({ hasText: name })
      .getByRole("button", { name: "eye" })
      .click();
    await expect(page.getByRole("heading", { name: "Show Tag" })).toBeVisible();
    await expect(page.getByText(name)).toBeVisible();
    await expect(page.getByText(desc)).toBeVisible();
  });

  test("tags list shows usage count", async ({ page }) => {
    const ts = Date.now();
    const name = `e2e-tag-usage-${ts}`;

    // Create tag
    await page.goto("/tags/create");
    await page.getByRole("textbox", { name: "* Name" }).fill(name);
    await page.getByRole("button", { name: /save/i }).click();

    // Verify tag appears with usage count
    await expect(page.getByText(name)).toBeVisible();

    // TODO: Check usage count when transactions can be tagged in e2e tests
    // Usage count should be 0 for new tag
    await expect(
      page
        .getByRole("row")
        .filter({ hasText: name })
        .getByRole("cell", { name: "0" })
        .first(),
    ).toBeVisible();
  });
});
