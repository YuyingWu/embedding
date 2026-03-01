import { test, expect } from '@playwright/test';

test('has chat message and receives fallback', async ({ page }) => {
  page.on('console', msg => console.log(msg.text()));
  await page.goto('/');
  await page.fill('input[placeholder="Type your message..."]', 'Hello there');
  await page.click('button[type="submit"]');

  // wait for response
  await expect(page.locator('text="抱歉，这个问题暂时没办法回答。"')).toBeVisible({ timeout: 10000 });
});
