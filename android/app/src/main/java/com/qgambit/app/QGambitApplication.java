package com.qgambit.app;

import android.app.Application;
import com.google.android.gms.games.PlayGamesSdk;

public final class QGambitApplication extends Application {
    @Override public void onCreate() {
        super.onCreate();
        // Console configuration and tester validation must precede activation.
        if (BuildConfig.PLAY_GAMES_ENABLED) PlayGamesSdk.initialize(this);
    }
}
