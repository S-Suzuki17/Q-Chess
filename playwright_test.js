const { chromium } = require('playwright');

(async () => {
  console.log('Starting Playwright test...');
  const browser = await chromium.launch({ headless: true });
  
  const context1 = await browser.newContext();
  const page1 = await context1.newPage();
  
  const context2 = await browser.newContext();
  const page2 = await context2.newPage();
  
  console.log('Navigating to local server...');
  // Assuming the dev server is running on 3000
  await page1.goto('http://localhost:3000');
  await page2.goto('http://localhost:3000');
  
  console.log('Logging in as Guests...');
  // Wait for login screen and click Guest
  await page1.click('text=Play as Guest');
  await page2.click('text=Play as Guest');
  
  // Wait for LevelSelect screen (Random Match should be visible)
  await page1.waitForSelector('text=Random Match');
  await page2.waitForSelector('text=Random Match');
  
  console.log('Clicking Random Match...');
  await page1.click('text=Random Match');
  await page2.click('text=Random Match');
  
  console.log('Selecting 10m time control...');
  // Wait for modal
  await page1.waitForSelector('text=10m');
  await page2.waitForSelector('text=10m');
  
  // Click 10m
  await page1.click('text=10m');
  await page2.click('text=10m');
  
  console.log('Waiting for match...');
  // Check if they transition to GameBoard
  try {
    await page1.waitForSelector('text=Resign', { timeout: 10000 });
    await page2.waitForSelector('text=Resign', { timeout: 10000 });
    console.log('Match successful! Both pages are on GameBoard.');
  } catch (e) {
    console.error('Match failed! Timed out waiting for GameBoard.');
  }
  
  await browser.close();
})();
