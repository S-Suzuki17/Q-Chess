package com.qgambit.app;

import static org.junit.Assert.*;
import android.graphics.Bitmap;
import android.os.SystemClock;
import androidx.lifecycle.Lifecycle;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.File;
import java.io.FileOutputStream;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Physical WebView regression suite. Never runs against the user's Play app. */
@RunWith(AndroidJUnit4.class)
public class AndroidSmokeTest {
    private ActivityScenario<MainActivity> scenario;

    @Before public void start() throws Exception {
        assertEquals("QA must be isolated from real saved data", "com.qgambit.app.qa",
            InstrumentationRegistry.getInstrumentation().getTargetContext().getPackageName());
        scenario = ActivityScenario.launch(MainActivity.class);
        waitFor("document.querySelector('[data-screen]') !== null", 30000);
        // Only this disposable QA app's storage is reset, never com.qgambit.app.
        js("localStorage.clear();localStorage.setItem('qg_language','en');true");
        scenario.recreate();
        waitFor("document.querySelector('.title-play') !== null && document.documentElement.lang === 'en'", 30000);
    }
    @After public void finish() { if (scenario != null) scenario.close(); }

    private String js(String expression) throws Exception {
        var value = new AtomicReference<String>();
        var done = new CountDownLatch(1);
        scenario.onActivity(activity -> activity.getBridge().getWebView().evaluateJavascript(
            "(()=>{" + "return eval(" + org.json.JSONObject.quote(expression) + ");})()",
            result -> { value.set(result); done.countDown(); }));
        assertTrue("WebView evaluation timed out", done.await(8, TimeUnit.SECONDS));
        return value.get();
    }
    private void waitFor(String expression, long timeout) throws Exception {
        long end = SystemClock.uptimeMillis() + timeout;
        while (SystemClock.uptimeMillis() < end) {
            if ("true".equals(js(expression))) return;
            SystemClock.sleep(150);
        }
        fail("Expected UI state was not reached: " + expression);
    }
    private void click(String selector) throws Exception {
        waitFor("document.querySelector(" + org.json.JSONObject.quote(selector) + ") !== null", 10000);
        assertEquals("true", js("(()=>{const e=document.querySelector(" + org.json.JSONObject.quote(selector) + ");if(e.disabled)return false;e.click();return true;})()"));
    }
    private void button(String text) throws Exception {
        String match = "[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===" + org.json.JSONObject.quote(text) + ")";
        waitFor("!!(" + match + ")", 10000);
        js("(" + match + ").click();true");
    }
    private void screenshot(String name) throws Exception {
        File folder = new File(InstrumentationRegistry.getInstrumentation().getTargetContext().getExternalFilesDir(null), "qa");
        assertTrue(folder.isDirectory() || folder.mkdirs());
        Bitmap image = InstrumentationRegistry.getInstrumentation().getUiAutomation().takeScreenshot();
        assertNotNull(image);
        try (var output = new FileOutputStream(new File(folder, name + ".png"))) { image.compress(Bitmap.CompressFormat.PNG, 100, output); }
        image.recycle();
        System.out.println("QG_QA_SCREEN " + name);
    }

    @Test public void recoveryEntryDoesNotSendEmailOrChangePassword() throws Exception {
        click(".title-auth-actions button");
        button("Forgot password?");
        waitFor("!!document.querySelector('dialog[open] input[type=email]')", 15000);
        assertEquals("true", js("(()=>{const d=document.querySelector('dialog[open]'),r=d.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&r.top>=0;})()"));
        assertEquals("true", js("performance.getEntriesByType('resource').every(e=>!e.name.includes('/auth/recovery/start')&&!e.name.includes('/auth/recovery/complete'))"));
        screenshot("00-recovery-entry");
        js("document.querySelector('dialog[open]').dispatchEvent(new Event('cancel',{cancelable:true}));true");
        waitFor("!document.querySelector('dialog[open]')", 5000);
    }

    @Test public void sharedGameplayAndNativeBoundaries() throws Exception {
        assertEquals("true", js("Capacitor.isNativePlatform() && Capacitor.getPlatform()==='android'"));
        assertEquals("false", js("!!document.querySelector('[data-site-introduction]') || document.body.innerText.includes('@QUBIT4x')"));
        assertEquals("true", js("!!document.querySelector('[data-app-support] a[href=\"https://q-gambit.com/privacy/\"]')"));
        assertEquals("0", js("document.querySelectorAll('ins.adsbygoogle,script[src*=\"pagead\"],script[src*=\"_vercel\"]').length"));
        screenshot("01-title");
        button("⚙️ Settings");
        waitFor("!!document.querySelector('dialog[open] select[data-cosmetic-kind=board]')", 10000);
        assertEquals("5", js("document.querySelectorAll('[data-cosmetic-kind]').length"));
        assertEquals("true", js("!!document.querySelector('.founders-collection')"));
        // No ad or receipt calls are allowed while these release switches are off.
        assertEquals("true", js("performance.getEntriesByType('resource').every(e=>!['rewards/founders','googlesyndication','doubleclick','googleads'].some(s=>e.name.includes(s)))"));
        screenshot("02-settings");
        js("document.querySelector('dialog[open]').dispatchEvent(new Event('cancel',{cancelable:true}));true");
        waitFor("!document.querySelector('dialog[open]')", 5000);
        click(".title-play");
        waitFor("!!document.querySelector('[data-screen=level_select]')", 10000);
        click(".lobby-shortcuts button");
        waitFor("!!document.querySelector('[data-time-control]')", 10000);
        screenshot("03-practice-options");
        click("[data-time-control='10m']");
        waitFor("!!document.querySelector('.match-intro[open]')", 10000);
        assertEquals("true", js("(()=>{const r=document.querySelector('.match-intro').getBoundingClientRect();return Math.abs(r.left+r.width/2-innerWidth/2)<2&&Math.abs(r.top+r.height/2-innerHeight/2)<2;})()"));
        assertEquals("0", js("document.querySelectorAll('.match-intro button').length"));
        screenshot("04-intro-centered");
        // Advance without clicking or dispatching anything to the introduction.
        waitFor("!document.querySelector('.match-intro')", 6000);
        waitFor("!!document.querySelector('[data-testid=match-board]')", 20000);
        button("2D");
        waitFor("!document.querySelector('.board-3d canvas')", 10000);
        assertEquals("true", js("(()=>{let r=document.querySelector('[data-testid=match-board]').getBoundingClientRect();return r.width>250&&r.left>=-1&&r.right<=innerWidth+1;})()"));
        screenshot("04-board-2d");
        click("[data-square=e2]");
        waitFor("document.querySelector('[data-square=e4]')?.getAttribute('data-move-target')==='true'", 8000);
        click("[data-square=e4]");
        waitFor("document.querySelectorAll('.match-history li').length>=2", 30000);
        button("3D");
        waitFor("!!document.querySelector('[data-graphics-state=ready] canvas') && document.querySelector('[data-graphics-state=ready] canvas').width>0", 30000);
        screenshot("05-board-3d");
        scenario.moveToState(Lifecycle.State.CREATED);
        SystemClock.sleep(800);
        scenario.moveToState(Lifecycle.State.RESUMED);
        waitFor("!!document.querySelector('[data-graphics-state=ready] canvas') && !document.hidden", 15000);
        button("2D");button("3D");
        waitFor("!!document.querySelector('[data-graphics-state=ready] canvas')", 20000);
        screenshot("06-resume-3d");
        System.out.println("QG_QA_PASS native platform; Web-only exclusion; policy link; settings; OFF gates; centered automatic intro; guest practice; move+CPU reply; visible 2D/3D; lifecycle resume");
    }

    @Test public void everyRewardBgmDecodesOnAndroid() throws Exception {
        var assets=InstrumentationRegistry.getInstrumentation().getTargetContext().getAssets();
        int count=0;
        for(String name:assets.list("public/audio/rewards")) {
            if(!name.endsWith(".mp3"))continue;
            try(var fd=assets.openFd("public/audio/rewards/"+name);var media=new android.media.MediaMetadataRetriever()) {
                media.setDataSource(fd.getFileDescriptor(),fd.getStartOffset(),fd.getLength());
                long duration=Long.parseLong(media.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_DURATION));
                assertTrue("Reward recording is empty: "+name,duration>10000);
            }
            count++;
        }
        assertEquals("Every reward BGM must be a real recording",15,count);
        System.out.println("QG_QA_PASS Android decoder: all 15 reward recordings");
    }
}
