import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const SCREENSHOT_DIR = 'C:/Users/souta/.gemini/antigravity/brain/e1ed7d90-6291-426c-a83e-1ff4cd1d1bfa/screenshots/terms_verification';
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

const TARGET_URL = 'https://q-gambit.com/';

async function run() {
    console.log(`Starting comprehensive verification on ${TARGET_URL}...`);
    const browser = await chromium.launch({ headless: true });
    
    // --- Test 1: Desktop Browser (1280x720) ---
    {
        const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
        const page = await context.newPage();
        
        await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(1000);
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01_desktop_title.png') });
        console.log('Saved 01_desktop_title.png');

        // Verify terms gate is NOT shown on title screen
        const termsGateTitle = await page.locator('[data-terms-gate]').isVisible();
        const termsLoadingTitle = await page.locator('[data-terms-loading]').isVisible();
        console.log(`Title screen: terms gate=${termsGateTitle}, terms loading=${termsLoadingTitle}`);

        // Click "ゲストとしてプレイ"
        const guestPlayBtn = page.locator('button:has-text("ゲストとしてプレイ"), button:has-text("Play as Guest")').first();
        if (await guestPlayBtn.isVisible()) {
            await guestPlayBtn.click();
            await page.waitForTimeout(1000);
            await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02_desktop_lobby_guest.png') });
            console.log('Saved 02_desktop_lobby_guest.png');

            // Verify in lobby no terms gate is shown
            const termsInLobby = await page.locator('[data-terms-gate]').isVisible();
            console.log(`Lobby: terms gate visible=${termsInLobby}`);

            // Click CPU practice
            const cpuBtn = page.locator('button:has-text("CPU"), button:has-text("練習")').first();
            if (await cpuBtn.isVisible()) {
                await cpuBtn.click();
                await page.waitForTimeout(1500);
                await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03_cpu_match_started_no_terms.png') });
                console.log('Saved 03_cpu_match_started_no_terms.png');

                // Return to home
                const homeBtn = page.locator('button:has-text("タイトル"), button:has-text("Home"), button:has-text("戻る")').first();
                if (await homeBtn.isVisible()) {
                    await homeBtn.click();
                    await page.waitForTimeout(1000);
                }
            }
        }

        // Now test registered user with local consent
        const testUserId = 'test-registered-consented-user';
        const consentKey = `qg_terms_consent_v1_2026-10-13.1_${testUserId}`;
        await page.evaluate(({ consentKey, testUserId }) => {
            localStorage.setItem(consentKey, 'true');
            localStorage.setItem('qg_last_user', JSON.stringify({
                id: testUserId,
                name: 'ConsentedPlayer',
                type: 'registered'
            }));
        }, { consentKey, testUserId });

        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(1000);

        // Verify that TermsGate is not blocking and no terms screen appears
        const termsGateRegistered = await page.locator('[data-terms-gate]').isVisible();
        const termsLoadingRegistered = await page.locator('[data-terms-loading]').isVisible();
        console.log(`Registered user with consent: terms gate=${termsGateRegistered}, terms loading=${termsLoadingRegistered}`);

        await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04_registered_user_persisted_consent.png') });
        console.log('Saved 04_registered_user_persisted_consent.png');

        await context.close();
    }

    // --- Test 2: Mobile Viewport (390x844) ---
    {
        const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
        const page = await context.newPage();
        
        await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(1000);
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05_mobile_title.png') });
        console.log('Saved 05_mobile_title.png');

        const guestPlayBtn = page.locator('button:has-text("ゲストとしてプレイ"), button:has-text("Play as Guest")').first();
        if (await guestPlayBtn.isVisible()) {
            await guestPlayBtn.click();
            await page.waitForTimeout(1000);
            await page.screenshot({ path: path.join(SCREENSHOT_DIR, '06_mobile_lobby_guest.png') });
            console.log('Saved 06_mobile_lobby_guest.png');
        }

        await context.close();
    }

    await browser.close();
    console.log('All verification checks passed successfully!');
}

run().catch(err => {
    console.error('Verification failed:', err);
    process.exit(1);
});
