import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const SCREENSHOT_DIR = 'C:/Users/souta/.gemini/antigravity/brain/e1ed7d90-6291-426c-a83e-1ff4cd1d1bfa/screenshots/online_ui_verification';
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

const TARGET_URL = 'https://q-gambit.com/';

async function run() {
    console.log(`Starting UI verification on ${TARGET_URL}...`);
    const browser = await chromium.launch({ headless: true });
    
    // --- 1. Desktop Test (1280x720) ---
    console.log('\n--- Test 1: Desktop (1280x720) ---');
    {
        const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
        const page = await context.newPage();
        const apiRequests = [];
        page.on('request', req => {
            if (req.url().includes('onrender.com') || req.url().includes('supabase.co') || req.url().includes('fixture.invalid')) {
                apiRequests.push({ method: req.method(), url: req.url() });
            }
        });
        page.on('console', msg => console.log('[PAGE CONSOLE]', msg.type(), msg.text()));
        page.on('pageerror', err => console.log('[PAGE ERROR]', err.message));
        
        await page.goto(TARGET_URL + '?v=' + Date.now(), { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(1500);

        // 1a. Verify Login modal & real backend connection
        const loginBtn = page.locator('button:has-text("ログイン")').first();
        if (await loginBtn.isVisible()) {
            await loginBtn.click();
            await page.waitForTimeout(800);
            const nameInput = page.locator('input[placeholder*="アカウント名"], input[type="text"]').first();
            const passInput = page.locator('input[type="password"]').first();
            if (await nameInput.isVisible() && await passInput.isVisible()) {
                await nameInput.fill('nonexistent_test_999');
                await passInput.fill('ValidPass12345!');
                const submitBtn = page.locator('button.title-auth-submit').first();
                await submitBtn.click();
                await page.waitForTimeout(2500);
                await page.screenshot({ path: path.join(SCREENSHOT_DIR, '00_desktop_login_verified.png') });
                const bodyText = await page.locator('body').innerText();
                console.log('Login response message:', bodyText.includes('アカウント名またはパスワードが違います') ? ' Real auth server responded (Incorrect credentials)' : bodyText);
            }
            // Close login modal or go back
            const backBtn = page.locator('button:has-text("戻る"), button:has-text("キャンセル"), button[aria-label*="閉"]').first();
            if (await backBtn.isVisible()) {
                await backBtn.click();
                await page.waitForTimeout(500);
            } else {
                await page.goto(TARGET_URL + '?v=' + Date.now(), { waitUntil: 'domcontentloaded' });
                await page.waitForTimeout(1000);
            }
        }
        console.log('Recorded backend requests so far:', apiRequests.map(r => `${r.method} ${new URL(r.url).origin}${new URL(r.url).pathname}`));
        
        // Enter as guest
        const guestBtn = page.locator('button:has-text("ゲストとしてプレイ"), button:has-text("Play as Guest")').first();
        if (await guestBtn.isVisible()) {
            await guestBtn.click();
            await page.waitForTimeout(3000); // Wait for socket connection
        }

        // Verify lobby header: no "オンライン" count badge
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01_desktop_lobby.png') });
        const lobbyText = await page.locator('.lobby-heading').textContent();
        const hasOnlineBadge = lobbyText?.includes('オンライン') || lobbyText?.includes('Online');
        console.log(`Desktop lobby header has online badge: ${hasOnlineBadge} (expected false)`);

        // Click "ランダム対局"
        const randomBtn = page.locator('button:has-text("ランダム対局")').first();
        if (await randomBtn.isVisible()) {
            await randomBtn.click();
            await page.waitForTimeout(1000);
            await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02_desktop_time_selection.png') });

            // Check time selection dialog: no "待機中のプレイヤー"
            const modal = page.locator('div[role="dialog"], .lobby-time-selector, dialog').first();
            const modalText = await modal.isVisible() ? await modal.textContent() : await page.content();
            const hasWaitingPlayers = modalText?.includes('待機中のプレイヤー') || modalText?.includes('Players waiting');
            console.log(`Desktop time control dialog has 'Players waiting': ${hasWaitingPlayers} (expected false)`);

            // Click 30s time control
            const tc30Btn = page.locator('button:has-text("30秒"), button:has-text("30s")').first();
            if (await tc30Btn.isVisible()) {
                await tc30Btn.click();
                await page.waitForTimeout(1500);

                // If retry button appears, click retry
                const retryBtn = page.locator('button:has-text("再試行")').first();
                if (await retryBtn.isVisible()) {
                    console.log('Retry button detected, clicking retry...');
                    await retryBtn.click();
                    await page.waitForTimeout(2000);
                }

                await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03_desktop_searching.png') });

                // Check searching dialog: no fallback warning, no "10s" countdown
                const queueDialog = page.locator('dialog[aria-labelledby="queue-title"], dialog').first();
                const queueContent = await queueDialog.isVisible() ? await queueDialog.textContent() : await page.content();
                const hasFallbackNotice = queueContent?.includes('10秒間対戦相手が見つからない場合') || queueContent?.includes('近い強さのCPUとレート変動あり');
                const hasFallbackCountdown = queueContent?.includes('対戦相手を準備しています') || /\b10s\b/.test(queueContent || '');
                const isSearching = queueContent?.includes('対戦相手を探しています') || /\d\d:\d\d/.test(queueContent || '');
                console.log(`Searching dialog active: ${isSearching}`);
                console.log(`Searching dialog has fallback notice: ${hasFallbackNotice} (expected false)`);
                console.log(`Searching dialog has fallback countdown: ${hasFallbackCountdown} (expected false)`);

                // Wait 12 seconds to see if CPU fallback triggers
                console.log('Waiting 12 seconds for CPU fallback to match...');
                await page.waitForTimeout(12000);
                await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04_desktop_after_12s.png') });
                const boardVisible = await page.locator('canvas, [data-board]').isVisible();
                console.log(`Game board / match visible after fallback: ${boardVisible}`);
            }
        }
        await context.close();
    }

    // --- 2. Mobile Test (390x844) ---
    console.log('\n--- Test 2: Mobile (390x844) ---');
    {
        const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
        const page = await context.newPage();
        
        await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(1000);
        
        const guestBtn = page.locator('button:has-text("ゲストとしてプレイ"), button:has-text("Play as Guest")').first();
        if (await guestBtn.isVisible()) {
            await guestBtn.click();
            await page.waitForTimeout(1000);
        }

        await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05_mobile_lobby.png') });
        const lobbyText = await page.locator('.lobby-heading').textContent();
        const hasOnlineBadge = lobbyText?.includes('オンライン') || lobbyText?.includes('Online');
        console.log(`Mobile lobby header has online badge: ${hasOnlineBadge} (expected false)`);

        const randomBtn = page.locator('button:has-text("ランダム対局")').first();
        if (await randomBtn.isVisible()) {
            await randomBtn.click();
            await page.waitForTimeout(1000);
            await page.screenshot({ path: path.join(SCREENSHOT_DIR, '06_mobile_time_selection.png') });

            const modal = page.locator('div[role="dialog"], .lobby-time-selector, dialog').first();
            const modalText = await modal.isVisible() ? await modal.textContent() : await page.content();
            const hasWaitingPlayers = modalText?.includes('待機中のプレイヤー') || modalText?.includes('Players waiting');
            console.log(`Mobile time control dialog has 'Players waiting': ${hasWaitingPlayers} (expected false)`);

            const tc30Btn = page.locator('button:has-text("30秒"), button:has-text("30s")').first();
            if (await tc30Btn.isVisible()) {
                await tc30Btn.click();
                await page.waitForTimeout(1000);
                await page.screenshot({ path: path.join(SCREENSHOT_DIR, '07_mobile_searching.png') });

                const queueDialog = page.locator('dialog[aria-labelledby="queue-title"], dialog').first();
                const queueContent = await queueDialog.isVisible() ? await queueDialog.textContent() : await page.content();
                const hasFallbackNotice = queueContent?.includes('10秒間対戦相手が見つからない場合') || queueContent?.includes('近い強さのCPUとレート変動あり');
                console.log(`Mobile searching dialog has fallback notice: ${hasFallbackNotice} (expected false)`);
            }
        }
        await context.close();
    }

    await browser.close();
    console.log('\nVerification completed successfully!');
}

run().catch(err => {
    console.error('Verification failed:', err);
    process.exit(1);
});
