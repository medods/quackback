import { test, expect } from '@playwright/test'

test.describe('Public Comments', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to a post detail page
    await page.goto('/')

    // Wait for posts to load
    const postCards = page.locator('a[href*="/posts/"]:has(h3)')
    await expect(postCards.first()).toBeVisible({ timeout: 15000 })

    // Click on the first post card to go to detail page
    await postCards.first().click()

    // Wait for detail page to load by checking for comment section header
    await expect(page.getByText(/\d+ comments?/i)).toBeVisible({ timeout: 10000 })
  })

  test('shows sign in prompt for unauthenticated users', async ({ page }) => {
    // Unauthenticated users should see "Sign in to comment" message
    const signInPrompt = page.getByText(/sign in to comment/i)
    await expect(signInPrompt).toBeVisible({ timeout: 10000 })

    // Should also have a Sign in button
    const signInButton = page.getByRole('button', { name: /sign in/i })
    await expect(signInButton).toBeVisible()
  })

  test('displays comments section on post detail', async ({ page }) => {
    // Should show comment section header (e.g., "1 COMMENT" or "X COMMENTS")
    // or sign in prompt for unauthenticated users
    const commentHeader = page.getByText(/\d+ comments?/i).or(page.getByText(/sign in to comment/i))

    await expect(commentHeader.first()).toBeVisible({ timeout: 10000 })
  })

  test('displays existing comments', async ({ page }) => {
    // Should show existing comments with author info
    // Look for comment count header or individual comments
    const commentCount = page.getByText(/\d+ comments?/i)
    const existingComment = page.locator('[data-testid="comment"]').first()

    await expect(commentCount.or(existingComment)).toBeVisible({ timeout: 10000 })
  })

  test('comments show author name and timestamp', async ({ page }) => {
    // Check if there are any comments displayed
    const comments = page.locator('[id^="comment-"]')
    const commentCount = await comments.count()

    if (commentCount > 0) {
      // Has comments - check for author name and timestamp
      const firstComment = comments.first()

      // Author name is in a span with font-medium class
      const authorName = firstComment.locator('span.font-medium.text-sm').first()
      await expect(authorName.first()).toBeVisible({ timeout: 5000 })

      // Timestamp text is localized, so assert the timestamp element is visible
      // and non-empty instead of matching English relative-time words.
      const timestamp = firstComment
        .locator('div.flex.items-center.gap-2')
        .first()
        .locator('span.text-xs.text-muted-foreground')
        .last()
      await expect(timestamp).toBeVisible({ timeout: 5000 })
      await expect(timestamp).not.toHaveText('')
    }
  })
})
