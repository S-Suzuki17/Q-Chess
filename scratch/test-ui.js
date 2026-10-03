const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('response', async res => {
        if (res.url().includes('/auth/register') || res.url().includes('/auth/ranked-session')) {
            console.log('NETWORK:', res.url(), res.status());
            if (res.status() >= 400) {
                console.log('BODY:', await res.text());
            }
        }
    });

    try {
        await page.goto('https://q-gambit.com/', {waitUntil: 'networkidle0'});
        
        // Wait for CREATE ACCOUNT button
        await page.waitForSelector('button::-p-text(CREATE ACCOUNT)', {timeout: 5000});
        
        // Click CREATE ACCOUNT
        const btns = await page.('button');
        for (const b of btns) {
            const text = await page.evaluate(el => el.textContent, b);
            if (text === 'CREATE ACCOUNT') {
                await b.click();
                break;
            }
        }

        await page.waitForSelector('input[type="text"]');
        const inputs = await page.('input');
        
        const username = 'tuser' + Math.floor(Math.random()*10000);
        await inputs[0].type(username);
        await inputs[1].type('VeryStrong123456!');
        
        // Submit
        const submits = await page.('button[type="submit"]');
        await submits[0].click();
        
        await page.waitForTimeout(3000); // Wait for response
        console.log('DONE');
    } catch (e) {
        console.error(e);
    }
    await browser.close();
})();
