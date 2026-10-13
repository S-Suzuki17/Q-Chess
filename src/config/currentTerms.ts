/** Owner-approved publication, coordinated with the database policy. */
export const CURRENT_TERMS_VERSION = '2026-10-13.1';
export const CURRENT_TERMS_EFFECTIVE_DATE: string | null = '2026-10-13';
export function currentTermsEffective(date: string | null = CURRENT_TERMS_EFFECTIVE_DATE, now = Date.now()): boolean {
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
    const utc = Date.parse(`${date}T00:00:00Z`);
    return Number.isFinite(utc) && new Date(utc).toISOString().slice(0, 10) === date && Date.parse(`${date}T00:00:00+09:00`) <= now;
}
// The current publication is complete and does not load a previous document.
export const CURRENT_TERMS_SECTIONS: (readonly [string, string])[] = [
    [
        "適用範囲",
        "本規約は、Q-Gambit運営（以下「運営」）が提供する量子チェスゲーム「Q-Gambit」のWeb版およびAndroid版に適用します。個人情報の取り扱いは、別途公開するプライバシーポリシーで説明します。"
    ],
    [
        "利用とアカウント",
        "利用者は規約とプライバシー説明を確認したうえで利用してください。未成年の利用者は保護者と一緒に内容を確認し、必要な同意を得てください。ゲストで利用できる機能と、ログインが必要な機能があります。パスワードは他人に知らせず、不正利用が疑われる場合はパスワード再設定や全端末ログアウトを行ってください。\nプロフィール名、アイコン、レートなどは他の利用者から見える場合があります。実名、連絡先、第三者の写真など、公開を望まない情報は登録しないでください。"
    ],
    [
        "料金・無料券・Web会員・ヒント購入",
        "各機能の提供開始後は、以下の条件を適用します。新規購入の受付状況は購入画面に表示します。\n無料枠は、オンライン戦とランク戦を合わせてアカウントごとにUTC日付で開始した1日3試合までです。無料枠を使い切った後は、対局ごとに明示的に選択した対局券1枚を使用します。有効なStandard・Plus会員は、この対局回数の制限と対局券の消費なしで利用できます。待機・マッチ不成立・開始前キャンセルでは消費しません。開始後の障害等で返還対象となった券は返還分として別に管理し、会員券の返還分には元の会員資格・有効期限が適用されます。\n連続ログイン1〜7日目の対局券は1・1・2・2・3・3・3枚、ヒント券は7日目に1枚です。7日間の周期を繰り返し、UTC日付で1日逃すと1日目に戻ります。無料の対局券・ヒント券に保有上限はありません。本人確認と本規約への同意後に受け取れます。ログインしなかった日や受け取らなかった日分を後からまとめて受け取ることはできません。練習・チュートリアルのQUBEヒントは無料で、ヒント券を使いません。それ以外のオンライン・ランク戦・プライベート対局・100マスチャレンジでは、ヒント1回につきヒント券1枚を明示的に使用します。CPUが代役でも元の対局モードに従います。\nWeb版のStandardの月額総額はUSD 3.00、Plusの月額総額はUSD 6.00です（いずれも税込）。有効な支払済み期間中はオンライン戦・ランク戦が無制限となり、広告は表示しません。Plusには支払済みの月次購読期間ごとにヒント券10枚が付きます。Standardには月次ヒント付与はありません。購入日から1か月ごとに、解約するまで自動更新し、初回購入時と毎月の更新時に請求します。特典は決済成功とサーバー確認後に提供します。\nWeb版のヒント券の1回購入は、1枚USD 1.00、13枚USD 10.00、27枚USD 20.00、44枚USD 30.00、77枚USD 50.00、166枚USD 100.00です（総額・税込）。購入時に1回だけ請求し、自動更新はありません。購入ヒントとPlusの付与済みヒントは、それぞれの購入・支払済み期間を記録して別に管理します。これらのヒントに保有上限や通常の利用期限はなく、Plusの解約や支払済み期間の終了だけでは付与済みヒントは失効しません。返金・決済取消・異議申立てに伴う利用停止や失効は、対象となった購入・支払期間の未使用分を他の出所のヒントと区別して扱います。\n既存の旧Web会員契約の月額総額はUSD 2.99です。旧契約をStandard・Plusへ自動的に変更しません。従来どおり毎月自動更新し、有効期間中に毎日ログインすると対局券3枚とヒント券3枚を受け取れます。旧会員券は無料券・新商品のヒントと別枠で各60枚までです。上限を超える分は付与されず、受け取らなかった日分を後からまとめて受け取ることはできません。旧会員終了・返金・決済取消で未使用の旧会員券は失効し、再加入へ持ち越しません。無料券と別の購入によるヒントには影響しません。\n通常の解約はWebの請求管理から次回更新を停止し、支払済み期間の末日まで会員特典を利用できます。通常解約の日割り返金はありません。適用法令上の権利は制限しません。券は譲渡・換金できません。支払方法はStripe Checkoutに表示します。通信費、カード会社の為替換算・手数料は利用者負担となる場合があります。Android版で購入受付中の場合はGoogle Playの課金画面を使用します。Google Playが表示する地域・通貨ごとの価格、支払間隔、税を含む請求内容を購入前に確認してください。Web版のUSD価格がそのままAndroid版の請求額になるとは限りません。Standard・Plusは月ごとの自動更新で、Google Playの定期購入管理から次回更新を停止できます。通常の解約では支払済み期間の終了まで特典を利用できます。ヒントパックは1回購入で自動更新しません。購入保留・確認待ちでは特典を付与せず、決済事業者の支払証明とサーバー保存の確認後に反映します。購入・復元は購入時と同じQ-Gambitアカウントで行ってください。消費済み購入の未使用残高はサーバー台帳から確認し、復元で再付与しません。別の会員契約との重複購入やアプリ内での会員プラン変更は扱いません。返金の申請は購入した決済事業者の手順に従ってください。適用法令上の権利は制限しません。"
    ],
    [
        "公正な利用",
        "不正プログラム、他人のアカウント利用、通信・レート・報酬の不正操作、サービスを妨害する大量アクセス、なりすまし、嫌がらせ、権利侵害や違法な画像の登録を禁止します。プログラムの不具合を発見した場合は、他の利用者に影響を与える実証をせず、問い合わせ先へ連絡してください。\n運営は、不正の状況・影響に応じてオンライン機能の制限等を行うことがあります。制限について確認・異議申立てをしたい場合は問い合わせ先へ連絡できます。制限中も、本人確認を伴うアカウント削除の経路は維持します。"
    ],
    [
        "進行・棋譜・保存",
        "ログインした利用者のサーキット進行と外観選択は、端末内保存とクラウド保存を使用します。通信できない場合などは同期が完了しないことがあるため、端末を変更する前に保存状態を確認してください。旧版の端末内進行は、利用者が選んだアカウントに移行します。\n棋譜一覧は利用者ごとに直近10試合です。共有の棋譜は相手の直近10試合に含まれる間は残る場合があります。レートや勝敗統計は棋譜の件数とは別に管理します。"
    ],
    [
        "アカウント削除",
        "設定内の削除機能から、本人確認と確認操作を経てアカウントの削除を要求できます。削除対象のアカウント情報・関連データ・棋譜は消去し、相手には匿名化した勝敗記録を残します。相手のレートは変更しません。削除後に元のアカウントや進行を復元できるとは限りません。長期間利用していないという理由だけでアカウントを自動削除することはありません。\nバックアップ等の残存データの扱いは、実際の保存期間を確認してプライバシーポリシーで説明します。未確認の期間を本規約では約束しません。\nWebまたはGoogle Playの会員契約があるアカウントは、購読解約を確認してからアカウント削除を完了します。削除後は会員特典と未使用券を利用できません。Stripe（Web）またはGoogle（Android）は決済に必要な情報を処理し、Q-Gambitのサーバーは注文・商品・購読状態・決済通知・アカウントとの対応・券の付与／消費記録を処理します。Google Playの購入トークンは継続確認のため暗号化して保存し、アカウント削除時に消去します。カード番号をQ-Gambitで保存しません。\n削除後の遅延通知によってアカウントや特典が再作成されないよう、必要最小限の決済処理識別子を分離して保持します。法令・決済事業者側で必要な保存を即時削除できるとは約束しません。"
    ],
    [
        "メンテナンスと変更",
        "安全性・安定性の維持のため、更新やメンテナンスを行うことがあります。可能な限り事前告知し、緊急の場合は事後に案内します。対局やデータに問題が生じた場合は、調査のうえ合理的な対応を行います。必要な更新版が利用可能になる前に、旧版を一律に利用不能にすることは避けます。"
    ],
    [
        "権利と責任",
        "ゲームや素材に関する権利は運営または権利者に帰属します。プレイ映像やスクリーンショットの共有では、他の利用者の個人情報・第三者の権利に配慮してください。本規約は、適用法令で認められる消費者の権利を制限せず、運営の責任を一律に免除するものではありません。"
    ],
    [
        "規約の変更",
        "重要な変更は内容と適用日を事前に案内し、必要に応じて再同意を求めます。同意版と同意日時を記録します。同意しない場合でも、問い合わせと本人によるアカウント削除の経路は利用できます。"
    ],
    [
        "問い合わせ",
        "Q-Gambit運営: qgambit970@gmail.com\n問い合わせには画面に表示されるユーザーIDを使用でき、パスワードや認証コードを送る必要はありません。"
    ]
];
export const CURRENT_TERMS_ENGLISH: (readonly [string, string])[] = [
    [
        "Scope",
        "These terms apply to the Web and Android versions of Q-Gambit provided by Q-Gambit Operations. Our separate Privacy Policy explains how personal information is handled."
    ],
    [
        "Using your account",
        "Please read these terms and the privacy information before using the service. Minors should review them with a parent or guardian and obtain any required consent. Some features allow guest play; others require sign-in. Keep passwords private. If misuse is suspected, reset your password or sign out everywhere.\nYour profile name, icon and rating may be visible to other players. Do not register real names, contact details, photographs of others, or other information you do not wish to make public."
    ],
    [
        "Costs, free tickets, Web membership and hint purchases",
        "The following conditions apply after each feature becomes available. The purchase screen states whether new purchases are available.\nEach account can start 3 games free per UTC day, shared across online and ranked matches. After this allowance, each match uses 1 match ticket only after an explicit choice for that match. Active Standard and Plus memberships remove this match limit and ticket cost. Waiting, failed matching and cancellation before the start cost no tickets. Tickets eligible for return after a failure following the start are tracked as separate refund credits. Returned legacy member tickets retain their original membership eligibility and expiry.\nLogin days 1–7 grant match tickets 1,1,2,2,3,3,3 and 1 hint ticket on day 7. The seven-day cycle repeats; missing a UTC day resets it to day 1. Free match and hint tickets have no holding cap. Claims require verified identity and acceptance of these terms. Days without login or collection cannot be claimed retroactively. QUBE hints are free in practice and tutorials, without hint tickets. In online, ranked, private and 100-Tile Challenge games, each hint explicitly uses 1 hint ticket. A CPU replacement follows the original match mode.\nOn the Web, Standard costs a final total of USD 3.00 per month and Plus costs USD 6.00 per month, tax included. During an active paid period, online and ranked matches are unlimited and advertising is disabled. Plus grants 10 hint tickets per paid monthly subscription period. Standard has no monthly hint grant. Membership renews monthly from the purchase date until canceled, with charges at purchase and each monthly renewal. Benefits start after successful payment and server verification.\nOn the Web, one-time hint packs cost USD 1.00 for 1 hint, USD 10.00 for 13, USD 20.00 for 27, USD 30.00 for 44, USD 50.00 for 77, or USD 100.00 for 166, as final totals including tax. They are charged once at purchase without automatic renewal. Purchased hints and granted Plus hints are tracked separately by their original purchase or paid period. These hints have no holding cap or ordinary use expiry; canceling Plus or reaching the end of its paid period alone does not expire hints already granted. Any suspension or revocation following a refund, payment reversal or dispute concerns unused hints from the affected purchase or paid period, distinguished from hints from other sources.\nExisting legacy Web membership costs a final total of USD 2.99 per month. It is not automatically converted to Standard or Plus. Its monthly renewal and existing benefits continue: daily login during the active period lets you receive 3 match tickets and 3 hint tickets. Legacy member tickets are separate from free tickets and new-product hints, with a cap of 60 of each kind. Grants above the cap are not credited, and uncollected days cannot be claimed retroactively. Unused legacy member tickets expire at legacy membership end, refund or payment reversal and do not carry over when rejoining. Free tickets and hints from separate purchases are unaffected.\nOrdinary cancellation in Web billing settings stops the next renewal; membership benefits continue until the paid period ends. Ordinary cancellation does not provide a prorated refund. Rights under applicable law are not restricted. Tickets cannot be transferred or exchanged for cash. Payment methods are shown at Stripe Checkout. Connectivity costs, currency conversion and card-provider fees may be your responsibility. When Android purchases are available, they use Google Play Billing. Before purchasing, review the price in your region and currency, payment interval and applicable taxes shown by Google Play. The Web USD prices are not necessarily the Android charge. Standard and Plus renew monthly; stop the next renewal in Google Play subscription settings. Ordinary cancellation preserves benefits through the paid period. Hint packs are charged once without renewal. Pending or unverified purchases do not grant benefits; benefits follow provider payment verification and durable server recording. Purchase and restore using the same Q-Gambit account. Unused balances from consumed purchases are recovered from the account ledger, without granting them again. Duplicate memberships and in-app membership plan changes are not supported. Request refunds through the payment provider used for the purchase. Rights under applicable law are not restricted."
    ],
    [
        "Fair use",
        "Cheating, using another person’s account, manipulating communications, ratings or rewards, disruptive traffic, impersonation, harassment, rights infringements and unlawful images are prohibited. Report vulnerabilities to support without testing them in a way that affects other players.\nWe may restrict online features according to the circumstances and impact of abuse. You can contact support to ask about or appeal restrictions. Verified account-deletion access remains available even during a restriction."
    ],
    [
        "Progress and records",
        "Signed-in players’ Circuit progress and appearance selections use both device and cloud storage. Synchronization may not finish when connectivity is unavailable. Check save status before changing devices. Earlier device progress can be assigned to the account you choose.\nEach player’s replay list contains their latest ten matches. Shared replays may remain while they are among the opponent’s latest ten. Ratings and win/loss statistics are maintained separately from the replay limit."
    ],
    [
        "Account deletion",
        "You can request deletion in Settings after identity verification and confirmation. The account, associated data and replays are erased; opponents retain anonymized win/loss records and their ratings do not change. Restoration of a deleted account or progress is not guaranteed. Accounts are not automatically deleted merely for being inactive.\nResidual backup handling will be explained in the Privacy Policy after the actual retention period is verified. These terms do not promise an unverified period.\nFor accounts with a Web or Google Play membership, subscription cancellation is confirmed before account deletion is completed. After deletion, membership benefits and unused tickets cannot be used. Stripe (Web) or Google (Android) processes payment information; Q-Gambit servers process orders, products, subscription status, payment notifications, account bindings and ticket grant/use records. Google Play purchase tokens are stored encrypted for ongoing verification and erased when the account is deleted. Q-Gambit does not store card numbers.\nThe minimum payment-processing identifiers needed to prevent delayed notifications from recreating a deleted account or its benefits are retained separately. We do not promise immediate deletion of records that the law or payment provider requires to be retained."
    ],
    [
        "Maintenance and changes",
        "Updates and maintenance may be necessary for security and stability. We will give advance notice where possible, or notice afterward in emergencies. We will investigate problems affecting games or data and take reasonable action. We aim not to disable all older versions before the required update becomes available."
    ],
    [
        "Rights and responsibility",
        "Game and asset rights belong to the operator or their respective owners. When sharing footage or screenshots, respect others’ personal information and third-party rights. These terms do not restrict consumer rights under applicable law or generally exclude the operator’s responsibility."
    ],
    [
        "Changes to these terms",
        "Important changes and their effective date will be announced in advance, with renewed consent requested when needed. The accepted version and acceptance time are recorded. Support and verified account deletion remain available if you do not agree."
    ],
    [
        "Contact",
        "Q-Gambit Operations: qgambit970@gmail.com\nYou may use your displayed user ID when contacting support. Never send passwords or verification codes."
    ]
];
