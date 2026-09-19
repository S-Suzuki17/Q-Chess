package com.qgambit.app;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;

public class MainActivity extends BridgeActivity {
    @Override public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PlayRewardsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
