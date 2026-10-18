package com.qgambit.app;

import com.google.android.gms.games.playergameevent.PlayerGameEvent;
import org.json.JSONObject;

final class GameStatsEvents {
    private GameStatsEvents() {}

    static PlayerGameEvent match(JSONObject data) {
        Object key = data.opt("matchKey");
        if (!(key instanceof String) || ((String) key).isEmpty() || ((String) key).length() > 200) throw new IllegalArgumentException();
        String mode = choice(data, "mode", "practice|campaign|private|random|ranked");
        String time = choice(data, "timeControl", "10s|3m|10m");
        String result = choice(data, "result", "win|loss|draw");
        long moves = integer(data, "playerMoves", 1, 10000);
        long captures = integer(data, "captures", 0, 16);
        if (!(data.opt("checkmate") instanceof Boolean)) throw new IllegalArgumentException();
        return new PlayerGameEvent.Builder("matchCompleted")
            .addProperty("gameMode", mode).addProperty("timeControl", time)
            .addProperty("isWinner", result.equals("win")).addProperty("isDraw", result.equals("draw"))
            .addProperty("playerMoves", moves).addProperty("piecesCaptured", captures)
            .addProperty("isCheckmateWin", result.equals("win") && data.optBoolean("checkmate"))
            .build();
    }

    static PlayerGameEvent progress(JSONObject data) {
        return new PlayerGameEvent.Builder("progressUpdate")
            .addProperty("currentProgress", integer(data, "currentProgress", 0, 300)).build();
    }

    private static String choice(JSONObject data, String key, String allowed) {
        Object value = data.opt(key);
        if (!(value instanceof String) || !((String) value).matches("^(?:" + allowed + ")$")) throw new IllegalArgumentException();
        return (String) value;
    }

    private static long integer(JSONObject data, String key, long min, long max) {
        Object value = data.opt(key);
        if (!(value instanceof Number)) throw new IllegalArgumentException();
        double number = ((Number) value).doubleValue();
        if (!Double.isFinite(number) || number < min || number > max || number != Math.floor(number)) throw new IllegalArgumentException();
        return (long) number;
    }
}
