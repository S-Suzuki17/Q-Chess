const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
  const videosDir = path.join(__dirname, 'videos');
  if (!fs.existsSync(videosDir)) {
      fs.mkdirSync(videosDir);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    recordVideo: {
      dir: videosDir,
      size: { width: 1280, height: 720 }
    }
  });

  const page = await context.newPage();
  console.log('Navigating to game...');
  await page.goto('http://localhost:3000');
  
  // Wait for the app to load
  await page.waitForTimeout(3000);

  console.log('Starting Local Match...');
  await page.evaluate(() => {
    const buttons = document.querySelectorAll('button');
    if (buttons.length >= 2) {
        buttons[1].click(); // Assuming second button is Local Match or CPU Match
    }
  });

  await page.waitForTimeout(2000);

  console.log('Playing some moves...');
  await page.evaluate(async () => {
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      
      const clickSquare = async (row, col) => {
          const boards = document.querySelectorAll('.grid-cols-8');
          for (let b of boards) {
              if (b.children.length >= 64) {
                  const index = row * 8 + col;
                  const square = b.children[index];
                  if (square) {
                      square.click();
                      await sleep(1000);
                  }
                  break;
              }
          }
      };

      // e2 to e4
      await clickSquare(6, 4);
      await clickSquare(4, 4);

      // e7 to e5
      await clickSquare(1, 4);
      await clickSquare(3, 4);
      
      // g1 to f3
      await clickSquare(7, 6);
      await clickSquare(5, 5);

      // b8 to c6
      await clickSquare(0, 1);
      await clickSquare(2, 2);
  });

  console.log('Waiting for recording to finish...');
  await page.waitForTimeout(3000);

  await context.close();
  await browser.close();

  const files = fs.readdirSync(videosDir);
  const videoFile = files.find(f => f.endsWith('.webm'));
  
  console.log(`Video saved at: ${path.join(videosDir, videoFile)}`);

})();
