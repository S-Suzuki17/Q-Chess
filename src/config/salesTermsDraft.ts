import { TERMS_ENGLISH, TERMS_SECTIONS } from './terms';
import { SALES_TERMS_DRAFT_VERSION } from './webCommerce';

/** Review draft. Current consent/version remains unchanged until coordinated Web/server/SQL rollout. */
export const SALES_TERMS_DRAFT = {
    version: SALES_TERMS_DRAFT_VERSION,
    effectiveDate: null,
    ja: TERMS_SECTIONS.map(([title, body], index): readonly [string, string] => {
        if (index === 2) return ['料金・無料券・Web会員',
            '無料ランク戦はアカウントごとにUTC日付で開始した1日3試合までです。4試合目以降は対局券1枚を使用します。待機・マッチ不成立・開始前キャンセルでは消費しません。無料ログイン券は各20枚までです。連続1〜7日目の対局券は1・1・1・2・2・2・3枚、CPU練習ヒント券は2・2・3・3・4・4・5枚です。7日目以降は最大段階を継続し、1日逃すと1日目に戻ります。本人確認と現行規約への同意後に受け取れます。\nWeb会員Q-Gambit Plusの月額総額はUSD 2.99で、購入日から1か月ごとに解約するまで自動更新されます。有効期間中は毎日、対局券3枚とCPU練習ヒント券3枚を無料券とは別枠で受け取れます。会員券の保有上限は正式確定後に購入前画面へ明示します（本案は未発効）。券は譲渡・換金できません。決済成功とサーバー確認後に提供します。\n通常の解約はWebの請求管理から次回更新を停止し、支払済み期間末日まで特典を利用できます。通常解約の日割り返金はありません。会員終了・返金・決済取消で未使用の会員券は失効し、再加入へ持ち越せません。無料券は影響を受けません。適用法令上の権利を制限しません。Androidでは既購入特典の利用のみを提供します。通信費とカード会社の為替換算・手数料は利用者の負担となる場合があります。広告は停止したままです。'];
        if (index === 5) return [title, body + '\nWeb会員のあるアカウントは、退会処理で購読の解約を確認してからデータを削除します。アカウント削除後は会員特典と未使用券を利用できません。通常解約の日割り返金はありませんが、適用法令上の権利を制限しません。'];
        return [title, body];
    }),
    en: TERMS_ENGLISH.map(([title, body], index): readonly [string, string] => {
        if (index === 2) return ['Costs, free tickets and Web membership',
            'Each account can start 3 ranked games free per UTC day. Each later game costs 1 ranked ticket. Waiting, failed matching and cancellation before the start cost no tickets. Free login tickets are capped at 20 of each kind. Days 1–7 grant ranked tickets 1,1,1,2,2,2,3 and CPU practice hint tickets 2,2,3,3,4,4,5. Day 7 repeats; a missed UTC day resets to day 1. Claims require verified identity and consent to the current terms.\nQ-Gambit Plus Web membership costs a final total of USD 2.99 each month, automatically renewing monthly from purchase until canceled. During the active period, you can receive 3 ranked tickets and 3 CPU practice hint tickets daily, separately from free tickets. The member-ticket holding cap will be stated before purchase after confirmation (this draft is not effective). Tickets cannot be transferred or exchanged for cash. Benefits begin after successful payment and server verification.\nOrdinary cancellation in Web billing settings stops the next renewal; benefits continue until the paid period ends. No prorated refund is provided for ordinary cancellation. Unused member tickets expire at membership end, refund or payment reversal and do not carry over when you rejoin. Free tickets are unaffected. Mandatory legal rights are not restricted. Android provides use of existing benefits only. Connectivity costs, currency conversion and card-provider fees may be your responsibility. Advertising remains disabled.'];
        if (index === 5) return [title, body + '\nFor an account with Web membership, subscription cancellation must be confirmed before account data is erased. After account deletion, membership benefits and unused tickets cannot be used. Ordinary cancellation has no prorated refund; mandatory legal rights are unaffected.'];
        return [title, body];
    }),
} as const;
