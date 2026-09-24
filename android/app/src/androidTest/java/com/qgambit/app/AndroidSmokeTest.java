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
        // A saved QA login may legitimately land on the consent gate before
        // fixtures are installed. Both are hydrated application entry points.
        waitFor("document.querySelector('[data-screen], [data-terms-gate]') !== null", 30000);
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
    private void input(String selector, String value) throws Exception {
        waitFor("!!document.querySelector("+org.json.JSONObject.quote(selector)+")",10000);
        js("(()=>{const e=document.querySelector("+org.json.JSONObject.quote(selector)+");Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,"+org.json.JSONObject.quote(value)+");e.dispatchEvent(new Event('input',{bubbles:true}));return true;})()");
    }

    @Test public void authenticatedProfileAndFriendsUseApiWithoutProductionWrites() throws Exception {
        // Mocks exist only inside this isolated QA WebView. No real login, database
        // mutation, account creation or friendship is sent to production.
        js("""
            (()=>{
              const nativeFetch=window.fetch.bind(window);
              window.__qaProfile={id:'QAOwner',name:'QAOwner',rating:1000,rating_10s:1010,rating_3m:1020,rating_10m:1030};
              window.__qaAccountCalls=[];window.__qaRenameStatus=200;
              window.fetch=async(input,options={})=>{
                const url=new URL(typeof input==='string'?input:input.url||String(input),location.href);
                if(url.origin===location.origin)return nativeFetch(input,options);
                const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
                const body=typeof options.body==='string'?JSON.parse(options.body):{};
                if(url.pathname==='/account/terms')return reply({userId:'QAOwner',currentVersion:'2026-09-25.1',consent:{version:'2026-09-25.1',acceptedAt:'2026-09-24T18:00:00Z'}});
                if(url.pathname==='/auth/ranked-session')return reply({userId:'QAOwner',token:'qa-proof-not-valid-in-production',expiresAt:Date.now()+3600000});
                if(url.pathname==='/account/profile/name'){
                  window.__qaAccountCalls.push({path:url.pathname,body});
                  if(window.__qaRenameStatus!==200)return reply({code:'AUTH_REQUIRED'},window.__qaRenameStatus);
                  window.__qaProfile={...window.__qaProfile,name:body.name};return reply({userId:'QAOwner',profile:window.__qaProfile});
                }
                if(url.pathname==='/account/friends'){
                  window.__qaAccountCalls.push({path:url.pathname,body});
                  return reply(options.method==='POST'?{userId:'QAOwner',changed:true}:{userId:'QAOwner',friends:[{id:'qa-row',user_id:'QAOwner',friend_id:'QAFriend',status:'accepted',created_at:'2026-01-01T00:00:00Z'}]});
                }
                if(url.pathname==='/rest/v1/profiles'){
                  if(url.searchParams.get('id')?.startsWith('in.'))return reply([{id:'QAFriend',name:'QA Friend',rating:1200,rating_10s:1210,rating_3m:1220,rating_10m:1230}]);
                  return reply(window.__qaProfile);
                }
                if(url.pathname==='/game-stats')return reply({stats:{totalGames:0,wins:0,losses:0,draws:0,whiteGames:0,whiteWins:0,blackGames:0,blackWins:0}});
                if(url.pathname.endsWith('/capabilities'))return reply({available:false});
                if(url.pathname==='/game-records')return reply({records:[]});
                window.__qaAccountCalls.push({path:url.pathname,method:options.method||'GET'});
                return reply({code:'QA_NETWORK_BLOCKED'},503);
              };
              // Prevent even fake presence identities reaching the real Realtime service.
              window.WebSocket=class extends EventTarget {static CONNECTING=0;static OPEN=1;static CLOSING=2;static CLOSED=3;readyState=3;close(){}send(){} };
              return true;
            })()
            """);
        click(".title-auth-actions button");
        input("form input[type=text]","QAOwner");input("form input[type=password]","qa-local-fixture");
        click("form button[type=submit]");
        waitFor("!!document.querySelector('[data-screen=level_select]')",10000);
        button("⚙️ Settings");click("[data-settings-panel=account]");
        button("EDIT");input("input[maxlength='15']","QA Renamed");button("SAVE");
        waitFor("!document.querySelector('input[maxlength=\"15\"]')&&document.body.innerText.includes('QA Renamed')",10000);
        assertEquals("true",js("window.__qaAccountCalls.some(c=>c.path==='/account/profile/name'&&JSON.stringify(c.body)===JSON.stringify({name:'QA Renamed'}))"));
        // A failed save must leave the draft editable instead of closing/reloading.
        js("window.__qaRenameStatus=401;true");button("EDIT");input("input[maxlength='15']","Keep Draft");button("SAVE");
        waitFor("document.body.innerText.includes('Your session has expired')",10000);
        assertEquals("true",js("document.querySelector('input[maxlength=\"15\"]')?.value==='Keep Draft'"));
        screenshot("07-profile-save-and-expiry");
        js("document.querySelector('dialog[open]').dispatchEvent(new Event('cancel',{cancelable:true}));true");
        button("⚙️ Settings");click("[data-settings-panel=friends]");
        waitFor("!!document.querySelector('[data-friend-id=QAFriend]')",10000);
        assertEquals("true",js("[...document.querySelectorAll('.friend-ratings dd')].map(e=>e.textContent).join(',')==='1210,1220,1230'"));
        input("#friend-id","QAOther");click(".friend-add button[type=submit]");
        waitFor("window.__qaAccountCalls.some(c=>c.path==='/account/friends'&&c.body.friendId==='QAOther'&&c.body.action==='request')",10000);
        assertEquals("true",js("window.__qaAccountCalls.every(c=>!c.path.startsWith('/rest/v1/friends')&&!(c.path==='/rest/v1/profiles'&&c.method==='PATCH'))"));
        screenshot("08-friend-api-ratings");
        System.out.println("QG_QA_PASS authenticated API payloads; saved name; expiry draft preserved; friend ratings; no direct DB writes (all backend responses mocked locally)");
    }
    @Test public void accountControlsAndCloudSaveUseIsolatedFixtures() throws Exception {
        js("""
            (()=>{
              const nativeFetch=window.fetch.bind(window);
              window.__qaControlCalls=[];window.__qaCloud={revision:0,progress:null};window.__qaCloudOffline=false;window.__qaConsent=null;
              window.fetch=async(input,options={})=>{
                const url=new URL(typeof input==='string'?input:input.url||String(input),location.href);
                if(url.origin===location.origin)return nativeFetch(input,options);
                const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
                const body=typeof options.body==='string'?JSON.parse(options.body):{};
                // Record no password or token, even though these are fake fixtures.
                window.__qaControlCalls.push({path:url.pathname,method:options.method||'GET',keys:Object.keys(body)});
                if(url.pathname==='/account/terms'){
                  if(options.method==='POST')window.__qaConsent={version:'2026-09-25.1',acceptedAt:'2026-09-24T18:00:00Z'};
                  return reply({userId:'QACloud',currentVersion:'2026-09-25.1',consent:window.__qaConsent});
                }
                if(url.pathname==='/auth/register')return reply({registered:true});
                if(url.pathname==='/auth/ranked-session')return reply({userId:'QACloud',token:'qa-only-invalid-in-production',expiresAt:Date.now()+3600000});
                if(url.pathname==='/rest/v1/profiles')return reply({id:'QACloud',name:'QA Cloud',rating:1000});
                if(url.pathname==='/service/status')return reply({maintenance:false,minimumAndroidBuild:0,minimumProtocol:0});
                if(url.pathname==='/account/progress'){
                  if(window.__qaCloudOffline)return reply({code:'UNAVAILABLE'},503);
                  if(options.method==='POST')window.__qaCloud={revision:window.__qaCloud.revision+1,progress:body.progress};
                  return reply({userId:'QACloud',...window.__qaCloud,saved:options.method==='POST'});
                }
                if(url.pathname==='/account/sessions/revoke-all')return reply({userId:'QACloud',revoked:true});
                if(url.pathname==='/game-stats')return reply({stats:{totalGames:0,wins:0,losses:0,draws:0,whiteGames:0,whiteWins:0,blackGames:0,blackWins:0}});
                if(url.pathname.endsWith('/capabilities'))return reply({available:false});
                if(url.pathname==='/game-records')return reply({records:[]});
                return reply({code:'QA_NETWORK_BLOCKED'},503);
              };
              window.WebSocket=class extends EventTarget {static CONNECTING=0;static OPEN=1;static CLOSING=2;static CLOSED=3;readyState=3;close(){}send(){} };
              return true;
            })()
            """);
        click(".title-auth-actions button:nth-child(2)");
        input("form input[type=text]","QACloud");input("form input[type=password]","qa-fixture-only-918");
        click("form button[type=submit]");
        waitFor("!!document.querySelector('[data-terms-checkbox]')",15000);
        assertEquals("true",js("!document.querySelector('[data-terms-checkbox]').checked&&document.querySelector('[data-terms-accept]').disabled&&!document.querySelector('[data-screen=level_select]')"));
        js("document.querySelector('[data-terms-checkbox]').scrollIntoView({block:'center'});true");
        screenshot("11-terms-explicit-consent");
        assertEquals("true",js("!window.__qaControlCalls.some(c=>c.path==='/account/progress')"));
        assertEquals("true",js("document.body.innerText.includes('Delete account')&&!!document.querySelector('a[href=\"mailto:qgambit970@gmail.com\"]')"));
        click("[data-terms-checkbox]");click("[data-terms-accept]");
        waitFor("!!document.querySelector('[data-screen=level_select]')",15000);
        assertEquals("true",js("window.__qaControlCalls.some(c=>c.path==='/auth/register'&&c.keys.sort().join(',')==='password,username')&&!window.__qaControlCalls.some(c=>c.path.includes('/rpc/register_user'))"));
        button("⚙️ Settings");
        waitFor("document.body.innerText.includes('Saved to your account')",15000);
        js("window.__qaCloudOffline=true;const e=document.querySelector('select[data-cosmetic-kind=board]');e.value='walnut';e.dispatchEvent(new Event('change',{bubbles:true}));true");
        waitFor("document.body.innerText.includes('Could not sync. Local progress is preserved.')",15000);
        assertEquals("true",js("JSON.parse(localStorage.getItem('qg_campaign_v2:QACloud')).board==='walnut'"));
        js("[...document.querySelectorAll('[role=status]')].find(e=>e.textContent.includes('Could not sync'))?.scrollIntoView({block:'center'});true");
        screenshot("09-cloud-offline-preserved");
        js("window.__qaCloudOffline=false;true");button("Try again");
        waitFor("document.body.innerText.includes('Saved to your account')&&window.__qaCloud.progress.board==='walnut'",10000);
        click("[data-settings-panel=account]");
        assertEquals("1",js("[...document.querySelectorAll('button')].filter(e=>e.textContent.trim()==='Sign out everywhere').length"));
        button("Sign out everywhere");button("Sign out");
        waitFor("!!document.querySelector('.title-play')",10000);
        assertEquals("true",js("window.__qaControlCalls.filter(c=>c.path==='/account/sessions/revoke-all').length===1&&window.__qaControlCalls.find(c=>c.path==='/account/sessions/revoke-all').keys.length===0"));
        // Remove only this QA fixture's local campaign save, to prove a cloud restore.
        js("localStorage.removeItem('qg_campaign_v2:QACloud');localStorage.removeItem('qg_campaign_v2:QACloud:dirty');true");
        click(".title-auth-actions button");input("form input[type=text]","QACloud");input("form input[type=password]","qa-fixture-only-918");click("form button[type=submit]");
        waitFor("!!document.querySelector('[data-screen=level_select]')",10000);
        button("⚙️ Settings");
        waitFor("document.body.innerText.includes('Saved to your account')&&document.querySelector('select[data-cosmetic-kind=board]')?.value==='walnut'",15000);
        js("[...document.querySelectorAll('[role=status]')].find(e=>e.textContent.includes('Saved to your account'))?.scrollIntoView({block:'center'});true");
        screenshot("10-cloud-restored");
        assertEquals("1",js("window.__qaControlCalls.filter(c=>c.path==='/account/terms'&&c.method==='POST').length"));
        System.out.println("QG_QA_PASS secure registration route; offline progress preserved; retry saved; one global signout; account cloud restored (isolated fixtures, no production writes)");
    }

    private void screenshot(String name) throws Exception {
        // DOM readiness precedes Android's composited frame; do not capture the
        // previous screen when a dialog has just opened.
        InstrumentationRegistry.getInstrumentation().waitForIdleSync();
        SystemClock.sleep(350);
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
        waitFor("!!document.querySelector('[data-terms-checkbox]')",10000);
        click("[data-terms-checkbox]");click("[data-terms-accept]");
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
