package com.qgambit.app;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;
import android.view.View;
import androidx.core.view.WindowCompat;

public class MainActivity extends BridgeActivity {
    @Override public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PlayRewardsPlugin.class);
        registerPlugin(PlayGameStatsPlugin.class);
        super.onCreate(savedInstanceState);
        WindowCompat.enableEdgeToEdge(getWindow());
        if (getBridge() != null) {
            // One native inset owner also protects fixed-position WebView dialogs.
            EdgeToEdgeInsets.install((View) getBridge().getWebView().getParent());
        }
    }
}
