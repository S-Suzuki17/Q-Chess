const { chromium } = require('playwright');
(async () => {
  try {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto('https://chatgpt.com/s/cx_6aac2f6254a88191b092a8274d5b0d94', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5000);
    const content = await page.content();
    const fs = require('fs');
    fs.writeFileSync('chatgpt_output.html', content);
    console.log('Saved to chatgpt_output.html');
    await browser.close();
  } catch (e) {
    console.error(e);
  }
})();
