package com.qgambit.app;

import static org.junit.Assert.*;
import android.app.Application;
import android.graphics.Rect;
import android.os.Build;
import android.view.DisplayCutout;
import android.view.View;
import android.view.WindowInsets;
import androidx.core.graphics.Insets;
import androidx.core.view.DisplayCutoutCompat;
import androidx.core.view.WindowInsetsCompat;
import java.util.Collections;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;
import org.robolectric.util.ReflectionHelpers;
import org.robolectric.util.ReflectionHelpers.ClassParameter;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = {28, 29, 34, 35, 36}, application = Application.class)
public class EdgeToEdgeInsetsTest {
    private final View content = new View(RuntimeEnvironment.getApplication());

    @Test public void barsCutoutAndKeyboardUseMaximumInsetsNotTheirSum() {
        WindowInsetsCompat insets = insets(Insets.of(0, 24, 0, 48), Insets.of(30, 40, 0, 0), 300);
        WindowInsetsCompat child = EdgeToEdgeInsets.apply(content, insets);
        assertPadding(30, 40, 0, 300);
        assertFalse("WebView must keep receiving viewport updates", child.isConsumed());
        assertEquals(Insets.NONE, child.getInsets(WindowInsetsCompat.Type.systemBars()
            | WindowInsetsCompat.Type.displayCutout() | WindowInsetsCompat.Type.ime()));
    }

    @Test public void rotationAndKeyboardDismissalReplacePaddingWithoutAccumulating() {
        EdgeToEdgeInsets.apply(content, insets(Insets.of(0, 24, 0, 48), Insets.NONE, 300));
        WindowInsetsCompat landscape = insets(Insets.of(0, 24, 48, 0), Insets.of(40, 0, 0, 0), 0);
        EdgeToEdgeInsets.apply(content, landscape);
        EdgeToEdgeInsets.apply(content, landscape);
        assertPadding(40, 24, 48, 0);
        EdgeToEdgeInsets.apply(content, new WindowInsetsCompat.Builder().build());
        assertPadding(0, 0, 0, 0);
    }

    private WindowInsetsCompat insets(Insets bars, Insets cutout, int keyboard) {
        Rect safe = new Rect(cutout.left, cutout.top, cutout.right, cutout.bottom);
        WindowInsetsCompat.Builder builder;
        if (Build.VERSION.SDK_INT == 28) {
            // API 28 has no platform Builder. Use its actual constructor so the
            // compat test includes a real cutout, not an unsupported setInsets stub.
            WindowInsets nativeInsets = ReflectionHelpers.callConstructor(WindowInsets.class,
                ClassParameter.from(Rect.class, new Rect(bars.left, bars.top, bars.right, bars.bottom)),
                ClassParameter.from(Rect.class, null),
                ClassParameter.from(Rect.class, new Rect(bars.left, bars.top, bars.right, bars.bottom)),
                ClassParameter.from(boolean.class, false), ClassParameter.from(boolean.class, false),
                ClassParameter.from(DisplayCutout.class, new DisplayCutout(safe, Collections.emptyList())));
            builder = new WindowInsetsCompat.Builder(WindowInsetsCompat.toWindowInsetsCompat(nativeInsets));
        } else {
            builder = new WindowInsetsCompat.Builder().setDisplayCutout(new DisplayCutoutCompat(safe, Collections.emptyList()));
        }
        return builder.setInsets(WindowInsetsCompat.Type.systemBars(), bars)
            .setInsets(WindowInsetsCompat.Type.ime(), Insets.of(0, 0, 0, keyboard)).build();
    }

    private void assertPadding(int left, int top, int right, int bottom) {
        assertEquals(left, content.getPaddingLeft()); assertEquals(top, content.getPaddingTop());
        assertEquals(right, content.getPaddingRight()); assertEquals(bottom, content.getPaddingBottom());
    }
}
