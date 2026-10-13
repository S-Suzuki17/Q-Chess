package com.qgambit.app;

import android.os.Handler;
import android.os.Looper;
import com.android.billingclient.api.*;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.function.Consumer;

/** One serialized BillingClient for founder restore and Play commerce. Server owns fulfillment. */
@CapacitorPlugin(name = "PlayRewards")
public class PlayRewardsPlugin extends Plugin {
    private static final String PRODUCT = "qg_founders_preregister";
    private final Handler handler = new Handler(Looper.getMainLooper());
    private BillingClient billing;
    private PluginCall active;
    private String purchaseSku;
    private static final List<String> SKUS = Arrays.asList("standard_monthly", "plus_monthly", "hints_1", "hints_13", "hints_27", "hints_44", "hints_77", "hints_166");
    private final Runnable timeout = () -> fail("UNAVAILABLE");

    private String productType(String sku) {
        return sku.endsWith("_monthly") ? BillingClient.ProductType.SUBS : BillingClient.ProductType.INAPP;
    }
    private void complete(JSObject value) {
        PluginCall completed = active; close();
        if (completed != null) completed.resolve(value);
    }
    private void commerce(PluginCall call, boolean purchasing, Consumer<BillingClient> ready) {
        handler.post(() -> {
            if (active != null) { call.reject("BUSY", "BUSY"); return; }
            active = call;
            handler.postDelayed(timeout, purchasing ? 180000 : 25000);
            billing = BillingClient.newBuilder(getContext())
                .setListener((result, purchases) -> handler.post(() -> {
                    if (active != call || purchaseSku == null) return;
                    if (result.getResponseCode() == BillingClient.BillingResponseCode.USER_CANCELED) {
                        JSObject value = new JSObject(); value.put("status", "cancelled"); value.put("purchases", new JSArray()); complete(value); return;
                    }
                    if (result.getResponseCode() != BillingClient.BillingResponseCode.OK || purchases == null) { fail("UNAVAILABLE"); return; }
                    JSArray values = purchaseValues(purchases, purchaseSku);
                    if (values.length() == 0) { fail("UNAVAILABLE"); return; }
                    JSObject value = new JSObject(); value.put("status", "received"); value.put("purchases", values); complete(value);
                }))
                .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
                .enableAutoServiceReconnection().build();
            final BillingClient current = billing;
            current.startConnection(new BillingClientStateListener() {
                @Override public void onBillingSetupFinished(BillingResult result) {
                    handler.post(() -> {
                        if (billing != current || active != call) return;
                        if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) { fail("UNAVAILABLE"); return; }
                        ready.accept(current);
                    });
                }
                @Override public void onBillingServiceDisconnected() { /* Reconnected by BillingClient. */ }
            });
        });
    }
    private JSArray purchaseValues(List<Purchase> purchases, String onlySku) {
        JSArray values = new JSArray();
        for (Purchase purchase : purchases) {
            if (purchase.getProducts().size() != 1 || purchase.getQuantity() != 1) continue;
            String id = purchase.getProducts().get(0);
            if (!id.startsWith("qg_")) continue;
            String sku = id.substring(3);
            if (!SKUS.contains(sku) || (onlySku != null && !onlySku.equals(sku))) continue;
            int state = purchase.getPurchaseState();
            if (state != Purchase.PurchaseState.PURCHASED && state != Purchase.PurchaseState.PENDING) continue;
            JSObject value = new JSObject(); value.put("sku", sku);
            value.put("state", state == Purchase.PurchaseState.PURCHASED ? "purchased" : "pending");
            // Pending purchases cannot be submitted to the server as completed payments.
            if (state == Purchase.PurchaseState.PURCHASED) value.put("purchaseToken", purchase.getPurchaseToken());
            values.put(value);
        }
        return values;
    }
    private static final class Offer {
        final String token, price, currency, period;
        final long micros;
        Offer(String token, String price, String currency, String period, long micros) {
            this.token = token; this.price = price; this.currency = currency; this.period = period; this.micros = micros;
        }
    }
    private Offer offer(ProductDetails detail, String sku) {
        Offer selected = null;
        if (!detail.getProductId().equals("qg_" + sku) || !detail.getProductType().equals(productType(sku))) return null;
        if (BillingClient.ProductType.SUBS.equals(productType(sku))) {
            if (detail.getSubscriptionOfferDetails() == null) return null;
            for (ProductDetails.SubscriptionOfferDetails candidate : detail.getSubscriptionOfferDetails()) {
                if (!"monthly".equals(candidate.getBasePlanId()) || candidate.getOfferId() != null || candidate.getInstallmentPlanDetails() != null) continue;
                List<ProductDetails.PricingPhase> phases = candidate.getPricingPhases().getPricingPhaseList();
                if (phases.size() != 1) continue;
                ProductDetails.PricingPhase phase = phases.get(0);
                if (!"P1M".equals(phase.getBillingPeriod()) || phase.getRecurrenceMode() != ProductDetails.RecurrenceMode.INFINITE_RECURRING || phase.getPriceAmountMicros() <= 0) continue;
                if (selected != null) return null;
                selected = new Offer(candidate.getOfferToken(), phase.getFormattedPrice(), phase.getPriceCurrencyCode(), "P1M", phase.getPriceAmountMicros());
            }
        } else {
            if (detail.getOneTimePurchaseOfferDetailsList() == null) return null;
            for (ProductDetails.OneTimePurchaseOfferDetails candidate : detail.getOneTimePurchaseOfferDetailsList()) {
                if (!"buy".equals(candidate.getPurchaseOptionId()) || candidate.getOfferId() != null || candidate.getPriceAmountMicros() <= 0) continue;
                if (selected != null) return null;
                selected = new Offer(candidate.getOfferToken(), candidate.getFormattedPrice(), candidate.getPriceCurrencyCode(), "", candidate.getPriceAmountMicros());
            }
        }
        return selected;
    }
    private void query(BillingClient current, List<String> skus, Consumer<List<ProductDetails>> done) {
        List<QueryProductDetailsParams.Product> products = new ArrayList<>();
        for (String sku : skus) products.add(QueryProductDetailsParams.Product.newBuilder().setProductId("qg_" + sku).setProductType(productType(sku)).build());
        current.queryProductDetailsAsync(QueryProductDetailsParams.newBuilder().setProductList(products).build(), (result, details) -> handler.post(() -> {
            if (billing != current || active == null) return;
            if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) { fail("UNAVAILABLE"); return; }
            done.accept(details.getProductDetailsList());
        }));
    }
    @PluginMethod public void commerceProducts(PluginCall call) {
        commerce(call, false, current -> query(current, SKUS.subList(0, 2), subscriptions -> query(current, SKUS.subList(2, SKUS.size()), packs -> {
            JSArray products = new JSArray(); List<ProductDetails> all = new ArrayList<>(subscriptions); all.addAll(packs);
            for (ProductDetails detail : all) {
                String id = detail.getProductId(); if (!id.startsWith("qg_") || !SKUS.contains(id.substring(3))) continue;
                String sku = id.substring(3); Offer selected = offer(detail, sku); if (selected == null) continue;
                JSObject value = new JSObject(); value.put("sku", sku); value.put("price", selected.price); value.put("currency", selected.currency);
                value.put("priceMicros", String.valueOf(selected.micros)); value.put("period", selected.period); products.put(value);
            }
            JSObject value = new JSObject(); value.put("products", products); complete(value);
        })));
    }
    @PluginMethod public void commercePurchase(PluginCall call) {
        String sku = call.getString("sku"), account = call.getString("accountId"), intent = call.getString("intentId");
        if (!SKUS.contains(sku) || account == null || !account.matches("[a-f0-9]{64}") || intent == null || !intent.matches("[a-f0-9]{64}")) { call.reject("INVALID_REQUEST", "INVALID_REQUEST"); return; }
        commerce(call, true, current -> query(current, Collections.singletonList(sku), details -> {
            if (details.size() != 1) { fail("PRODUCT_UNAVAILABLE"); return; }
            ProductDetails detail = details.get(0); Offer selected = offer(detail, sku);
            if (selected == null) { fail("PRODUCT_UNAVAILABLE"); return; }
            if (!selected.currency.equals(call.getString("currency")) || !String.valueOf(selected.micros).equals(call.getString("priceMicros")) || !selected.price.equals(call.getString("price"))) { fail("PRICE_CHANGED"); return; }
            purchaseSku = sku;
            BillingFlowParams.ProductDetailsParams product = BillingFlowParams.ProductDetailsParams.newBuilder().setProductDetails(detail).setOfferToken(selected.token).build();
            BillingResult result = current.launchBillingFlow(getActivity(), BillingFlowParams.newBuilder()
                .setProductDetailsParamsList(Collections.singletonList(product)).setObfuscatedAccountId(account).setObfuscatedProfileId(intent).build());
            if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) fail(result.getResponseCode() == BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED ? "RESTORE_REQUIRED" : "UNAVAILABLE");
        }));
    }
    @PluginMethod public void commerceRestore(PluginCall call) {
        commerce(call, false, current -> current.queryPurchasesAsync(QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.INAPP).build(), (firstResult, inapp) -> handler.post(() -> {
            if (billing != current || active != call) return;
            if (firstResult.getResponseCode() != BillingClient.BillingResponseCode.OK) { fail("UNAVAILABLE"); return; }
            current.queryPurchasesAsync(QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.SUBS).build(), (secondResult, subscriptions) -> handler.post(() -> {
                if (billing != current || active != call) return;
                if (secondResult.getResponseCode() != BillingClient.BillingResponseCode.OK) { fail("UNAVAILABLE"); return; }
                List<Purchase> all = new ArrayList<>(inapp); all.addAll(subscriptions);
                JSObject value = new JSObject(); value.put("purchases", purchaseValues(all, null)); complete(value);
            }));
        })));
    }

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
        handler.removeCallbacks(timeout); active = null; purchaseSku = null;
        BillingClient previous = billing; billing = null;
        if (previous != null) previous.endConnection();
    }
    @Override protected void handleOnDestroy() { handler.post(() -> fail("UNAVAILABLE")); }
}
