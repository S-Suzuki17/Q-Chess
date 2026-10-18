package com.qgambit.app;

import android.graphics.Color;
import android.os.Build;
import android.view.View;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

/** Draw the app background edge-to-edge; keep the entire WebView in the safe area. */
final class EdgeToEdgeInsets {
    private EdgeToEdgeInsets() {}

    static void install(View container) {
        container.setBackgroundColor(Color.rgb(17, 16, 14));
        ViewCompat.setOnApplyWindowInsetsListener(container, (view, insets) -> apply(view, insets));
        ViewCompat.requestApplyInsets(container);
    }

    static WindowInsetsCompat apply(View container, WindowInsetsCompat insets) {
        int handled = WindowInsetsCompat.Type.systemBars()
            | WindowInsetsCompat.Type.displayCutout() | WindowInsetsCompat.Type.ime();
        // getInsets(union) takes the maximum on each edge, not the sum. In
        // landscape a navigation bar/cutout can be on either side of the board.
        Insets safe = insets.getInsets(handled);
        container.setPadding(safe.left, safe.top, safe.right, safe.bottom);
        // The WebView is already inset. Dispatch zero, not CONSUMED, so WebView
        // continues updating its viewport. Keep the original non-consumed state;
        // an empty compat Builder on API 28 would become fully consumed.
        WindowInsetsCompat.Builder child = new WindowInsetsCompat.Builder(insets);
        if (Build.VERSION.SDK_INT >= 29) child.setDisplayCutout(null);
        WindowInsetsCompat result = child.setInsets(handled, Insets.NONE).build();
        return Build.VERSION.SDK_INT == 28 ? clearApi28Cutout(result) : result;
    }

    @SuppressWarnings("deprecation")
    private static WindowInsetsCompat clearApi28Cutout(WindowInsetsCompat insets) {
        // Only Android 9 needs this compatibility fallback: its platform has no
        // WindowInsets.Builder to clear the cutout. It does not consume all insets.
        // Android 10+ uses the Builder above; no deprecated Window color APIs.
        return insets.consumeDisplayCutout();
    }
}
