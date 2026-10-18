package com.qgambit.app;

import android.content.Context;
import android.content.SharedPreferences;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.games.PlayGames;
import com.google.android.gms.games.GameStatsClient;
import com.google.android.gms.games.playergameevent.PlayerGameEvent;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HashSet;
import java.util.Set;
import org.json.JSONArray;

/** Narrow bridge: only schema-approved game signals, never arbitrary properties or credentials. */
@CapacitorPlugin(name = "PlayGameStats")
public final class PlayGameStatsPlugin extends Plugin {
    private final Set<String> pending = new HashSet<>();

    @PluginMethod public void recordMatch(PluginCall call) {
        if (!BuildConfig.PLAY_GAMES_ENABLED) { result(call, "disabled"); return; }
        final PlayerGameEvent event;
        final String matchKey = call.getString("matchKey", "");
        try {
            event = GameStatsEvents.match(call.getData());
        } catch (IllegalArgumentException exception) {
            call.reject("Invalid game statistics", "INVALID_EVENT"); return;
        }
        authenticated(call, () -> PlayGames.getPlayersClient(getActivity()).getCurrentPlayer()
            .addOnSuccessListener(player -> {
                if (player == null || player.getPlayerId() == null) { result(call, "unavailable"); return; }
                recordOnce(call, event, digest(player.getPlayerId() + ":" + matchKey));
            }).addOnFailureListener(error -> result(call, "unavailable")));
    }

    @PluginMethod public void recordProgress(PluginCall call) {
        if (!BuildConfig.PLAY_GAMES_ENABLED) { result(call, "disabled"); return; }
        final PlayerGameEvent event;
        try { event = GameStatsEvents.progress(call.getData()); }
        catch (IllegalArgumentException exception) { call.reject("Invalid progress", "INVALID_EVENT"); return; }
        authenticated(call, () -> {
            GameStatsClient client = PlayGames.getGameStatsClient(getActivity());
            client.recordEventImmediate(event).addOnSuccessListener(unused -> {
                requestUpload(client); result(call, "buffered");
            }).addOnFailureListener(error -> result(call, "unavailable"));
        });
    }

    private void authenticated(PluginCall call, Runnable record) {
        getActivity().runOnUiThread(() -> {
            try {
                PlayGames.getGamesSignInClient(getActivity()).isAuthenticated().addOnSuccessListener(auth -> {
                    if (!auth.isAuthenticated()) { result(call, "unauthenticated"); return; }
                    try { record.run(); }
                    catch (RuntimeException ignored) { result(call, "unavailable"); }
                }).addOnFailureListener(error -> result(call, "unavailable"));
            } catch (RuntimeException ignored) { result(call, "unavailable"); }
        });
    }

    private void recordOnce(PluginCall call, PlayerGameEvent event, String key) {
        SharedPreferences prefs = getContext().getSharedPreferences("play-game-stats", Context.MODE_PRIVATE);
        JSONArray recorded;
        try { recorded = new JSONArray(prefs.getString("recorded", "[]")); }
        catch (Exception ignored) { recorded = new JSONArray(); }
        for (int i = 0; i < recorded.length(); i++) {
            if (key.equals(recorded.optString(i))) { result(call, "duplicate"); return; }
        }
        if (!pending.add(key)) { result(call, "pending"); return; }
        try {
            GameStatsClient client = PlayGames.getGameStatsClient(getActivity());
            client.recordEventImmediate(event).addOnSuccessListener(unused -> {
                // Read again: another match may have completed while the SDK was writing.
                JSONArray previous;
                try { previous = new JSONArray(prefs.getString("recorded", "[]")); }
                catch (Exception ignored) { previous = new JSONArray(); }
                JSONArray next = new JSONArray();
                for (int i = Math.max(0, previous.length() - 255); i < previous.length(); i++) next.put(previous.optString(i));
                next.put(key);
                prefs.edit().putString("recorded", next.toString()).apply();
                pending.remove(key);
                requestUpload(client);
                // This acknowledges local SDK buffering, not server ingestion.
                result(call, "buffered");
            }).addOnFailureListener(error -> { pending.remove(key); result(call, "unavailable"); });
        } catch (RuntimeException ignored) { pending.remove(key); result(call, "unavailable"); }
    }

    private static void requestUpload(GameStatsClient client) {
        try { client.requestEventsUpload(); }
        catch (RuntimeException ignored) { /* Already buffered: leave retries to the SDK. */ }
    }

    private static String digest(String value) {
        try {
            byte[] bytes = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder();
            for (byte b : bytes) hex.append(String.format(java.util.Locale.ROOT, "%02x", b));
            return hex.toString();
        } catch (java.security.NoSuchAlgorithmException impossible) { throw new IllegalStateException(impossible); }
    }

    private static void result(PluginCall call, String status) {
        JSObject result = new JSObject(); result.put("status", status); call.resolve(result);
    }
}
