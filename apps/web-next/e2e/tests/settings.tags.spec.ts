import { test, expect } from "@playwright/test";
import {
  createTestUser,
  deleteTestUser,
  loginUser,
  cleanupReferenceDataForUser,
} from "../utils/test-helpers";

test.describe("Settings: Tags", () => {
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
    const name = `e2e-tag-${ts}`;
    const desc = `e2e-tag-desc-${ts}`;

    await page.goto("/tags");

    // Click create button
    await page.getByRole("button", { name: /create/i }).click();

    // Fill form
    await page.getByLabel("Name").fill(name);
    await page.getByLabel("Description").fill(desc);

    // Submit
    await page.getByRole("button", { name: /save/i }).click();

    // Should redirect to list
    await expect(page).toHaveURL(/\/tags/);

    // Verify tag appears in list
    await expect(page.getByText(name)).toBeVisible();
    await expect(page.getByText(desc)).toBeVisible();
  });

  test("user can edit a tag", async ({ page }) => {
    const ts = Date.now();
    const name = `e2e-tag-edit-${ts}`;
    const desc = `e2e-tag-desc-${ts}`;
    const updatedName = `${name}-updated`;
    const updatedDesc = `${desc}-updated`;

    // Create tag
    await page.goto("/tags/create");
    await page.getByLabel("Name").fill(name);
    await page.getByLabel("Description").fill(desc);
    await page.getByRole("button", { name: /save/i }).click();
    await page.waitForURL(/\/tags/);

    // Click edit on first row
    await page.getByRole("button", { name: /edit/i }).first().click();

    // Update fields
    await page.getByLabel("Name").clear();
    await page.getByLabel("Name").fill(updatedName);
    await page.getByLabel("Description").clear();
    await page.getByLabel("Description").fill(updatedDesc);

    // Save
    await page.getByRole("button", { name: /save/i }).click();

    // Verify updated
    await expect(page).toHaveURL(/\/tags/);
    await expect(page.getByText(updatedName)).toBeVisible();
    await expect(page.getByText(updatedDesc)).toBeVisible();

    // Old values gone
    await expect(page.getByText(name)).not.toBeVisible();
  });

  test("user can delete a tag", async ({ page }) => {
    const ts = Date.now();
    const name = `e2e-tag-delete-${ts}`;

    // Create tag
    await page.goto("/tags/create");
    await page.getByLabel("Name").fill(name);
    await page.getByRole("button", { name: /save/i }).click();
    await page.waitForURL(/\/tags/);

    // Verify it exists
    await expect(page.getByText(name)).toBeVisible();

    // Delete
    await page.getByRole("button", { name: /delete/i }).first().click();

    // Handle confirmation if needed
    try {
      await page.getByRole("button", { name: /ok|confirm|yes/i }).click();
    } catch {
      // No confirmation dialog
    }

    // Verify deleted
    await expect(page.getByText(name)).not.toBeVisible();
  });

  test("user can view tag details", async ({ page }) => {
    const ts = Date.now();
    const name = `e2e-tag-show-${ts}`;

    // Create tag
    await page.goto("/tags/create");
    await page.getByLabel("Name").fill(name);
    await page.getByLabel("Description").fill(`description-${ts}`);
    await page.getByRole("button", { name: /save/i }).click();

    // Click show button
    await page.getByRole("button", { name: /show/i }).first().click();

    // Should navigate to show page
    await expect(page).toHaveURL(/\/tags\/show\//);

    // Verify details shown
    await expect(page.getByText(name)).toBeVisible();
    await expect(page.getByText(`description-${ts}`)).toBeVisible();
  });

  test("tags list shows usage count", async ({ page }) => {
    const ts = Date.now();
    const name = `e2e-tag-usage-${ts}`;

    // Create tag
    await page.goto("/tags/create");
    await page.getByLabel("Name").fill(name);
    await page.getByRole("button", { name: /save/i }).click();
    await page.waitForURL(/\/tags/);

    // Verify tag appears with usage count
    await expect(page.getByText(name)).toBeVisible();
    // Usage count should be 0 for new tag
    await expect(page.getByText("0")).toBeVisible();
  });
});
