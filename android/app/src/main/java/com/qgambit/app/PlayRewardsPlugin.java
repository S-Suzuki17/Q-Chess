package com.qgambit.app;

import android.os.Handler;
import android.os.Looper;
import com.android.billingclient.api.*;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Read-only restore. There is intentionally no purchase or checkout entry point. */
@CapacitorPlugin(name = "PlayRewards")
public class PlayRewardsPlugin extends Plugin {
    private static final String PRODUCT = "qg_founders_preregister";
    private final Handler handler = new Handler(Looper.getMainLooper());
    private BillingClient billing;
    private PluginCall active;
    private final Runnable timeout = () -> fail("UNAVAILABLE");

    @PluginMethod public void restore(PluginCall call) {
        handler.post(() -> {
            if (active != null) { call.reject("BUSY", "BUSY"); return; }
            active = call;
            handler.postDelayed(timeout, 15000);
            // A fresh connection per explicit restore prevents stale reconnect callbacks
            // from completing a later call; only one client is alive at a time.
            billing = BillingClient.newBuilder(getContext())
                .setListener((result, purchases) -> {})
                .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
                .build();
            final BillingClient current = billing;
            current.startConnection(new BillingClientStateListener() {
                @Override public void onBillingSetupFinished(BillingResult result) {
                    handler.post(() -> {
                        if (billing != current || active == null) return;
                        if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) { fail("UNAVAILABLE"); return; }
                        current.queryPurchasesAsync(QueryPurchasesParams.newBuilder()
                            .setProductType(BillingClient.ProductType.INAPP).build(), (response, purchases) -> handler.post(() -> {
                                if (billing != current || active == null) return;
                                if (response.getResponseCode() != BillingClient.BillingResponseCode.OK) { fail("UNAVAILABLE"); return; }
                                JSArray tokens = new JSArray();
                                boolean pending = false;
                                for (Purchase purchase : purchases) {
                                    if (!purchase.getProducts().contains(PRODUCT)) continue;
                                    if (purchase.getPurchaseState() == Purchase.PurchaseState.PURCHASED)
                                        tokens.put(purchase.getPurchaseToken());
                                    else if (purchase.getPurchaseState() == Purchase.PurchaseState.PENDING) pending = true;
                                }
                                JSObject value = new JSObject();
                                value.put("tokens", tokens); value.put("pending", pending);
                                PluginCall completed = active; close(); completed.resolve(value);
                            }));
                    });
                }
                @Override public void onBillingServiceDisconnected() {
                    handler.post(() -> { if (billing == current) fail("UNAVAILABLE"); });
                }
            });
        });
    }
    private void fail(String code) {
        PluginCall failed = active; close();
        if (failed != null) failed.reject(code, code);
    }
    private void close() {
        handler.removeCallbacks(timeout); active = null;
        BillingClient previous = billing; billing = null;
        if (previous != null) previous.endConnection();
    }
    @Override protected void handleOnDestroy() { handler.post(() -> fail("UNAVAILABLE")); }
}
