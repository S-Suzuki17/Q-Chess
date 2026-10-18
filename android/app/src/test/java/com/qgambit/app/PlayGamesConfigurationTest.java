package com.qgambit.app;

import static org.junit.Assert.assertEquals;
import android.app.Application;
import android.content.ComponentName;
import android.content.pm.PackageManager;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 35, application = Application.class)
public class PlayGamesConfigurationTest {
    @Test public void releaseSwitchAlsoControlsSdkAutomaticEntryPoints() throws Exception {
        Application app = RuntimeEnvironment.getApplication();
        PackageManager pm = app.getPackageManager();
        assertEquals(BuildConfig.PLAY_GAMES_ENABLED, pm.getProviderInfo(new ComponentName(app,
            "com.google.android.gms.games.provider.PlayGamesInitProvider"), PackageManager.MATCH_DISABLED_COMPONENTS).enabled);
        for (String activity : new String[] {"com.google.android.gms.games.internal.v2.resolution.GamesResolutionActivity",
                "com.google.android.gms.games.internal.v2.appshortcuts.PlayGamesAppShortcutsActivity"}) {
            assertEquals(BuildConfig.PLAY_GAMES_ENABLED, pm.getActivityInfo(new ComponentName(app, activity),
                PackageManager.MATCH_DISABLED_COMPONENTS).enabled);
        }
    }
}
