import type { Language } from './dict';

type Copy = Readonly<{
    title: string;
    planned: string;
    benefits: string;
    billingTerms: string;
    active: string;
    inactive: string;
    periodEnd: string;
    checking: string;
    unavailable: string;
    purchase: string;
    preparing: string;
    manage: string;
    managing: string;
    webOnly: string;
}>;

const copy: Record<Language, Copy> = {
    en: { title: 'Web membership', planned: 'Planned · $2.99/month', benefits: '3 ranked tickets and 3 CPU hint tickets each day', billingTerms: 'Final total USD $2.99 per month. Renews automatically each month. Ordinary cancellation stops the next renewal; access continues until the current paid period ends. No prorated refund for ordinary cancellation.', active: 'Active', inactive: 'Not active', periodEnd: 'Current period ends', checking: 'Checking membership…', unavailable: 'Membership is unavailable.', purchase: 'Continue to checkout', preparing: 'Preparing checkout…', manage: 'Manage payment or cancel', managing: 'Opening billing settings…', webOnly: 'Web-only purchase. Tickets have no cash value and cannot be transferred.' },
    ja: { title: 'Web会員', planned: '予定 · 月額$2.99', benefits: '毎日ランク戦チケット3枚とCPUヒントチケット3枚', billingTerms: '月額総額2.99米ドルで毎月自動更新。通常の解約は次回更新を停止し、支払済み期間の終了まで利用できます。通常の解約では日割り返金はありません。', active: '利用中', inactive: '未加入', periodEnd: '現在の利用期限', checking: '会員情報を確認中…', unavailable: '会員情報を確認できません。', purchase: '決済に進む', preparing: '決済画面を準備中…', manage: '支払い方法の変更・解約', managing: '請求設定を開いています…', webOnly: '購入はWeb版のみ。チケットは換金・譲渡できません。' },
    zh: { title: '网页会员', planned: '计划中 · 每月$2.99', benefits: '每天3张排位赛券和3张CPU提示券', billingTerms: '每月总价2.99美元，每月自动续订。正常取消后不再续订，但可使用至当前已付款周期结束。正常取消不按剩余天数退款。', active: '有效', inactive: '未开通', periodEnd: '本期结束时间', checking: '正在查询会员信息…', unavailable: '会员功能不可用。', purchase: '前往结算', preparing: '正在准备结算…', manage: '更改付款方式或取消', managing: '正在打开账单设置…', webOnly: '仅可在网页购买。券不可兑换现金或转让。' },
    ru: { title: 'Веб-подписка', planned: 'Планируется · $2,99 в месяц', benefits: 'Ежедневно 3 билета для рейтинговых игр и 3 подсказки CPU', billingTerms: 'Итого 2,99 USD в месяц. Подписка продлевается автоматически каждый месяц. Обычная отмена останавливает следующее продление; доступ сохраняется до конца оплаченного периода. Пропорционального возврата за обычную отмену нет.', active: 'Активна', inactive: 'Не активна', periodEnd: 'Конец текущего периода', checking: 'Проверяем подписку…', unavailable: 'Подписка недоступна.', purchase: 'Перейти к оплате', preparing: 'Подготавливаем оплату…', manage: 'Изменить оплату или отменить', managing: 'Открываем настройки оплаты…', webOnly: 'Покупка только в веб-версии. Билеты нельзя обменять на деньги или передать.' },
    fr: { title: 'Abonnement Web', planned: 'Prévu · 2,99 $/mois', benefits: '3 tickets classés et 3 tickets d’indice CPU par jour', billingTerms: 'Total : 2,99 USD par mois. Renouvellement automatique mensuel. Une résiliation ordinaire arrête le prochain renouvellement ; l’accès reste actif jusqu’à la fin de la période payée. Pas de remboursement au prorata en cas de résiliation ordinaire.', active: 'Actif', inactive: 'Inactif', periodEnd: 'Fin de la période en cours', checking: 'Vérification de l’abonnement…', unavailable: 'Abonnement indisponible.', purchase: 'Passer au paiement', preparing: 'Préparation du paiement…', manage: 'Modifier le paiement ou résilier', managing: 'Ouverture des paramètres de paiement…', webOnly: 'Achat sur le Web uniquement. Tickets non échangeables contre de l’argent et non transférables.' },
    de: { title: 'Web-Mitgliedschaft', planned: 'Geplant · 2,99 $/Monat', benefits: 'Täglich 3 Ranglisten-Tickets und 3 CPU-Hinweis-Tickets', billingTerms: 'Gesamtpreis: 2,99 USD pro Monat. Monatliche automatische Verlängerung. Eine reguläre Kündigung beendet die nächste Verlängerung; der Zugang bleibt bis zum Ende des bezahlten Zeitraums bestehen. Keine anteilige Rückerstattung bei regulärer Kündigung.', active: 'Aktiv', inactive: 'Nicht aktiv', periodEnd: 'Aktueller Zeitraum endet', checking: 'Mitgliedschaft wird geprüft…', unavailable: 'Mitgliedschaft nicht verfügbar.', purchase: 'Zur Kasse', preparing: 'Kasse wird vorbereitet…', manage: 'Zahlung ändern oder kündigen', managing: 'Zahlungseinstellungen werden geöffnet…', webOnly: 'Kauf nur im Web. Tickets sind nicht übertragbar und nicht gegen Geld einlösbar.' },
    es: { title: 'Membresía web', planned: 'Previsto · $2.99 al mes', benefits: '3 boletos de partidas clasificadas y 3 pistas CPU al día', billingTerms: 'Total: 2,99 USD al mes. Se renueva automáticamente cada mes. La cancelación normal detiene la próxima renovación; el acceso continúa hasta el fin del período pagado. No hay reembolso prorrateado por cancelación normal.', active: 'Activa', inactive: 'Inactiva', periodEnd: 'Fin del período actual', checking: 'Comprobando membresía…', unavailable: 'Membresía no disponible.', purchase: 'Continuar al pago', preparing: 'Preparando el pago…', manage: 'Cambiar pago o cancelar', managing: 'Abriendo ajustes de facturación…', webOnly: 'Compra solo en la web. Los boletos no tienen valor en efectivo ni se pueden transferir.' },
    tr: { title: 'Web üyeliği', planned: 'Planlanıyor · aylık $2,99', benefits: 'Her gün 3 dereceli maç bileti ve 3 CPU ipucu bileti', billingTerms: 'Toplam aylık 2,99 USD. Her ay otomatik yenilenir. Normal iptal bir sonraki yenilemeyi durdurur; erişim ödenmiş dönemin sonuna kadar sürer. Normal iptalde kullanılmayan günler için orantılı iade yapılmaz.', active: 'Etkin', inactive: 'Etkin değil', periodEnd: 'Mevcut dönem sonu', checking: 'Üyelik kontrol ediliyor…', unavailable: 'Üyelik kullanılamıyor.', purchase: 'Ödemeye devam et', preparing: 'Ödeme hazırlanıyor…', manage: 'Ödemeyi değiştir veya iptal et', managing: 'Fatura ayarları açılıyor…', webOnly: 'Satın alma yalnızca web sürümünde. Biletler nakde çevrilemez veya devredilemez.' },
    pl: { title: 'Członkostwo internetowe', planned: 'Planowane · 2,99 USD/miesiąc', benefits: 'Codziennie 3 bilety rankingowe i 3 bilety na podpowiedzi CPU', billingTerms: 'Łącznie 2,99 USD miesięcznie. Subskrypcja odnawia się automatycznie co miesiąc. Zwykłe anulowanie zatrzymuje kolejne odnowienie; dostęp trwa do końca opłaconego okresu. Brak proporcjonalnego zwrotu za zwykłe anulowanie.', active: 'Aktywne', inactive: 'Nieaktywne', periodEnd: 'Koniec bieżącego okresu', checking: 'Sprawdzanie członkostwa…', unavailable: 'Członkostwo jest niedostępne.', purchase: 'Przejdź do płatności', preparing: 'Przygotowywanie płatności…', manage: 'Zmień płatność lub anuluj', managing: 'Otwieranie ustawień płatności…', webOnly: 'Zakup tylko w wersji Web. Biletów nie można wymienić na gotówkę ani przekazać.' },
    hi: { title: 'वेब सदस्यता', planned: 'प्रस्तावित · $2.99 प्रति माह', benefits: 'हर दिन 3 रैंक्ड मैच टिकट और 3 CPU संकेत टिकट', billingTerms: 'कुल 2.99 अमेरिकी डॉलर प्रति माह। सदस्यता हर महीने अपने-आप नवीनीकृत होती है। सामान्य रद्दीकरण अगला नवीनीकरण रोकता है; वर्तमान भुगतान अवधि के अंत तक उपयोग जारी रहता है। सामान्य रद्दीकरण पर बचे दिनों का अनुपातिक धनवापसी नहीं मिलती।', active: 'सक्रिय', inactive: 'सक्रिय नहीं', periodEnd: 'मौजूदा अवधि समाप्त', checking: 'सदस्यता जाँची जा रही है…', unavailable: 'सदस्यता उपलब्ध नहीं है।', purchase: 'भुगतान पर जाएँ', preparing: 'भुगतान तैयार किया जा रहा है…', manage: 'भुगतान बदलें या सदस्यता रद्द करें', managing: 'बिलिंग सेटिंग खोली जा रही है…', webOnly: 'खरीद केवल वेब पर। टिकट नकद में नहीं बदले जा सकते और न ही हस्तांतरित किए जा सकते हैं।' },
    pt: { title: 'Assinatura web', planned: 'Planejado · US$ 2,99/mês', benefits: '3 bilhetes ranqueados e 3 bilhetes de dicas CPU por dia', billingTerms: 'Total de US$ 2,99 por mês. Renovação automática mensal. O cancelamento comum impede a próxima renovação; o acesso continua até o fim do período pago. Não há reembolso proporcional no cancelamento comum.', active: 'Ativa', inactive: 'Inativa', periodEnd: 'Fim do período atual', checking: 'Verificando assinatura…', unavailable: 'Assinatura indisponível.', purchase: 'Continuar para pagamento', preparing: 'Preparando pagamento…', manage: 'Alterar pagamento ou cancelar', managing: 'Abrindo configurações de cobrança…', webOnly: 'Compra apenas na Web. Os bilhetes não têm valor em dinheiro e não podem ser transferidos.' },
    ta: { title: 'இணைய உறுப்பினர் திட்டம்', planned: 'திட்டமிடப்பட்டது · மாதம் $2.99', benefits: 'தினமும் 3 தரவரிசைப் போட்டிச் சீட்டுகள் மற்றும் 3 CPU குறிப்புச் சீட்டுகள்', billingTerms: 'மொத்தம் மாதம் 2.99 அமெரிக்க டாலர். ஒவ்வொரு மாதமும் தானாகப் புதுப்பிக்கப்படும். வழக்கமான ரத்து அடுத்த புதுப்பிப்பை நிறுத்தும்; தற்போதைய கட்டணம் செலுத்திய காலம் முடியும் வரை அணுகல் தொடரும். வழக்கமான ரத்துக்கு மீதமுள்ள நாட்களுக்கான விகிதாசார பணத் திருப்பம் இல்லை.', active: 'செயலில் உள்ளது', inactive: 'செயலில் இல்லை', periodEnd: 'தற்போதைய காலம் முடியும் நாள்', checking: 'உறுப்பினர் நிலை சரிபார்க்கப்படுகிறது…', unavailable: 'உறுப்பினர் திட்டம் கிடைக்கவில்லை.', purchase: 'பணம் செலுத்தச் செல்லவும்', preparing: 'கட்டணம் தயாராகிறது…', manage: 'கட்டணத்தை மாற்ற அல்லது ரத்து செய்ய', managing: 'கட்டண அமைப்புகள் திறக்கப்படுகின்றன…', webOnly: 'வாங்குதல் இணையத்தில் மட்டும். சீட்டுகளை பணமாக மாற்றவோ பிறருக்கு மாற்றவோ முடியாது.' },
};

const scheduledEnd: Record<Language, string> = {
    en: 'Canceled · access until',
    ja: '解約済み · 利用期限',
    zh: '已取消续订 · 可使用至',
    ru: 'Продление отменено · доступ до',
    fr: 'Résilié · accès jusqu’au',
    de: 'Gekündigt · Zugang bis',
    es: 'Cancelada · acceso hasta',
    tr: 'Yenileme iptal edildi · erişim sonu',
    pl: 'Anulowano odnowienie · dostęp do',
    hi: 'नवीनीकरण रद्द · उपलब्धता तक',
    pt: 'Renovação cancelada · acesso até',
    ta: 'புதுப்பிப்பு ரத்து · அணுகல் முடியும் நாள்',
};

const purchaseReview: Record<Language, readonly [string, string, string]> = {
    en: ['Mandatory legal rights are unaffected.', 'Terms of Use', 'I have read the monthly total, automatic renewal, cancellation, ticket cap and expiration, and the terms.'],
    ja: ['適用法令上の権利は制限されません。', '利用規約', '月額総額・自動更新・解約・券の上限と失効・規約を確認しました。'],
    zh: ['不限制法律赋予的权利。', '使用条款', '我已阅读每月总价、自动续订、取消、券上限与失效及条款。'],
    ru: ['Обязательные права по закону не ограничиваются.', 'Условия использования', 'Я прочитал итоговую месячную цену, автопродление, отмену, лимит и срок действия билетов, а также условия.'],
    fr: ['Les droits légaux impératifs restent applicables.', 'Conditions d’utilisation', 'J’ai lu le total mensuel, le renouvellement automatique, la résiliation, le plafond et l’expiration des tickets, ainsi que les conditions.'],
    de: ['Zwingende gesetzliche Rechte bleiben unberührt.', 'Nutzungsbedingungen', 'Ich habe Gesamtpreis, automatische Verlängerung, Kündigung, Ticketlimit und Verfall sowie die Bedingungen gelesen.'],
    es: ['Los derechos legales obligatorios no se ven afectados.', 'Términos de uso', 'He leído el total mensual, la renovación automática, cancelación, límite y vencimiento de boletos y los términos.'],
    tr: ['Zorunlu yasal haklar etkilenmez.', 'Kullanım koşulları', 'Aylık toplamı, otomatik yenilemeyi, iptali, bilet sınırını ve sona ermesini ve koşulları okudum.'],
    pl: ['Obowiązkowe prawa ustawowe pozostają bez zmian.', 'Warunki użytkowania', 'Przeczytałem łączną cenę miesięczną, automatyczne odnowienie, anulowanie, limit i wygaśnięcie biletów oraz warunki.'],
    hi: ['कानून द्वारा दिए गए अधिकार अप्रभावित हैं।', 'उपयोग की शर्तें', 'मैंने कुल मासिक मूल्य, स्वतः नवीनीकरण, रद्दीकरण, टिकट सीमा और समाप्ति तथा शर्तें पढ़ी हैं।'],
    pt: ['Os direitos legais obrigatórios não são afetados.', 'Termos de uso', 'Li o total mensal, a renovação automática, cancelamento, limite e expiração de bilhetes e os termos.'],
    ta: ['கட்டாய சட்ட உரிமைகள் பாதிக்கப்படாது.', 'பயன்பாட்டு விதிமுறைகள்', 'மாத மொத்தம், தானியங்கி புதுப்பிப்பு, ரத்து, சீட்டு வரம்பு மற்றும் காலாவதி, விதிமுறைகளைப் படித்தேன்.'],
};

export const stripeMembershipText = (lang: Language): Copy & { scheduledEnd: string; legalRights: string; terms: string; confirmPurchase: string } =>
    ({ ...copy[lang], scheduledEnd: scheduledEnd[lang], legalRights: purchaseReview[lang][0], terms: purchaseReview[lang][1], confirmPurchase: purchaseReview[lang][2] });
