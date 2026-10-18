package com.qgambit.app;

import static org.junit.Assert.*;
import android.app.Application;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 35, application = Application.class)
public class GameStatsEventsTest {
    private JSONObject match() throws Exception {
        return new JSONObject("{\"matchKey\":\"local:test\",\"mode\":\"practice\",\"timeControl\":\"10m\",\"result\":\"win\",\"playerMoves\":12,\"captures\":3,\"checkmate\":true}");
    }

    @Test public void buildsBothSchemaEvents() throws Exception {
        assertNotNull(GameStatsEvents.match(match()));
        assertNotNull(GameStatsEvents.progress(new JSONObject().put("currentProgress", 0)));
        assertNotNull(GameStatsEvents.progress(new JSONObject().put("currentProgress", 300)));
    }

    @Test public void rejectsMalformedOrOutOfRangeSignalsAtNativeBoundary() throws Exception {
        for (Object invalid : new Object[] {0, -1, 1.5, "12", 10001}) {
            JSONObject data = match().put("playerMoves", invalid);
            assertThrows(IllegalArgumentException.class, () -> GameStatsEvents.match(data));
        }
        for (String field : new String[] {"mode", "timeControl", "result", "checkmate"}) {
            JSONObject data = match().put(field, "invalid");
            assertThrows(IllegalArgumentException.class, () -> GameStatsEvents.match(data));
        }
        assertThrows(IllegalArgumentException.class, () -> GameStatsEvents.match(match().put("captures", 17)));
        assertThrows(IllegalArgumentException.class, () -> GameStatsEvents.match(match().put("matchKey", 123)));
        assertThrows(IllegalArgumentException.class, () -> GameStatsEvents.progress(new JSONObject().put("currentProgress", 301)));
    }
}
