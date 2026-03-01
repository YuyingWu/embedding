import { test, expect } from '@playwright/test';

test('Chat UI works', async ({ page }) => {
  await page.goto('http://localhost:3000');
  
  // Wait for the input to be visible
  const input = page.getByPlaceholder('Type your message...');
  await expect(input).toBeVisible();
  
  // Type a message
  await input.fill('Hello, what is this?');
  
  // Submit the form
  await page.getByRole('button').click();
  
  // Wait for the user message to appear
  await expect(page.getByText('Hello, what is this?')).toBeVisible();
  
  // Wait for the AI response to appear (it should not be the user message)
  // The AI response will be in a div with a different class, but we can just wait for any text that is not the user message
  // Or we can wait for the loading indicator to disappear
  // The loading indicator has animate-bounce
  
  // Wait for the response to stream in. We can check if there's a new message block.
  // Since we don't know the exact response, we can just wait for the second message block to appear.
  // The user message is the first one, the AI response is the second one.
  const messages = page.locator('main > div > div.flex.w-full');
  await expect(messages).toHaveCount(2, { timeout: 15000 });
  
  // Check that the second message has some text
  const aiMessage = messages.nth(1);
  await expect(aiMessage).toContainText(/[a-zA-Z]/, { timeout: 15000 });
});
