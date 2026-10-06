import type { Language } from './dict';

type Copy = Readonly<{
    title: string;
    hints: string;
    purchased: string;
    subscription: string;
    legacy: string;
    testMode: string;
    testNotice: string;
    benefits: string;
}>;

const copy: Record<Language, Copy> = {
    en: { title: 'Membership and hints', hints: 'QUBE hints', purchased: 'Purchased hints', subscription: 'Earned subscription hints', legacy: 'Legacy membership', testMode: 'Test mode', testNotice: 'Test mode only. This membership and these hints do not provide live benefits.', benefits: 'Unlimited online and ranked matches · No ads' },
    ja: { title: '会員情報とヒント', hints: 'QUBEヒント', purchased: '購入したヒント', subscription: '購読で獲得したヒント', legacy: '旧会員プラン', testMode: 'テストモード', testNotice: 'テスト専用です。この会員情報とヒントは本番の特典として利用できません。', benefits: 'オンライン・ランク戦が無制限 · 広告なし' },
    zh: { title: '会员与提示', hints: 'QUBE提示', purchased: '已购买提示', subscription: '订阅获得的提示', legacy: '旧会员方案', testMode: '测试模式', testNotice: '仅限测试。此会员和提示不提供正式环境权益。', benefits: '在线与排位对局不限次数 · 无广告' },
    ru: { title: 'Подписка и подсказки', hints: 'Подсказки QUBE', purchased: 'Купленные подсказки', subscription: 'Подсказки за подписку', legacy: 'Прежняя подписка', testMode: 'Тестовый режим', testNotice: 'Только для тестирования. Эта подписка и подсказки не дают преимуществ в рабочей среде.', benefits: 'Неограниченные онлайн- и рейтинговые матчи · Без рекламы' },
    fr: { title: 'Abonnement et indices', hints: 'Indices QUBE', purchased: 'Indices achetés', subscription: 'Indices obtenus par abonnement', legacy: 'Ancien abonnement', testMode: 'Mode test', testNotice: 'Test uniquement. Cet abonnement et ces indices ne donnent aucun avantage en production.', benefits: 'Parties en ligne et classées illimitées · Sans publicité' },
    de: { title: 'Mitgliedschaft und Hinweise', hints: 'QUBE-Hinweise', purchased: 'Gekaufte Hinweise', subscription: 'Durch das Abo erhaltene Hinweise', legacy: 'Bisherige Mitgliedschaft', testMode: 'Testmodus', testNotice: 'Nur für Tests. Diese Mitgliedschaft und Hinweise gewähren keine Vorteile im Livebetrieb.', benefits: 'Unbegrenzte Online- und Ranglistenspiele · Keine Werbung' },
    es: { title: 'Membresía y pistas', hints: 'Pistas QUBE', purchased: 'Pistas compradas', subscription: 'Pistas obtenidas por suscripción', legacy: 'Membresía anterior', testMode: 'Modo de prueba', testNotice: 'Solo para pruebas. Esta membresía y estas pistas no ofrecen ventajas en el servicio real.', benefits: 'Partidas en línea y clasificadas ilimitadas · Sin anuncios' },
    tr: { title: 'Üyelik ve ipuçları', hints: 'QUBE ipuçları', purchased: 'Satın alınan ipuçları', subscription: 'Abonelikten kazanılan ipuçları', legacy: 'Eski üyelik', testMode: 'Test modu', testNotice: 'Yalnızca test içindir. Bu üyelik ve ipuçları canlı ortamda avantaj sağlamaz.', benefits: 'Sınırsız çevrimiçi ve dereceli maç · Reklamsız' },
    pl: { title: 'Członkostwo i podpowiedzi', hints: 'Podpowiedzi QUBE', purchased: 'Kupione podpowiedzi', subscription: 'Podpowiedzi uzyskane z subskrypcji', legacy: 'Poprzednie członkostwo', testMode: 'Tryb testowy', testNotice: 'Tylko do testów. To członkostwo i te podpowiedzi nie zapewniają korzyści w działającej usłudze.', benefits: 'Nieograniczone mecze online i rankingowe · Bez reklam' },
    hi: { title: 'सदस्यता और संकेत', hints: 'QUBE संकेत', purchased: 'खरीदे गए संकेत', subscription: 'सदस्यता से मिले संकेत', legacy: 'पुरानी सदस्यता', testMode: 'परीक्षण मोड', testNotice: 'केवल परीक्षण के लिए। यह सदस्यता और ये संकेत लाइव सेवा में लाभ नहीं देते।', benefits: 'असीमित ऑनलाइन और रैंक्ड मैच · कोई विज्ञापन नहीं' },
    pt: { title: 'Assinatura e dicas', hints: 'Dicas QUBE', purchased: 'Dicas compradas', subscription: 'Dicas obtidas pela assinatura', legacy: 'Assinatura anterior', testMode: 'Modo de teste', testNotice: 'Somente para testes. Esta assinatura e estas dicas não oferecem benefícios no serviço real.', benefits: 'Partidas online e ranqueadas ilimitadas · Sem anúncios' },
    ta: { title: 'உறுப்பினர் விவரமும் குறிப்புகளும்', hints: 'QUBE குறிப்புகள்', purchased: 'வாங்கிய குறிப்புகள்', subscription: 'சந்தா மூலம் பெற்ற குறிப்புகள்', legacy: 'பழைய உறுப்பினர் திட்டம்', testMode: 'சோதனை முறை', testNotice: 'சோதனைக்கு மட்டும். இந்த உறுப்பினர் திட்டமும் குறிப்புகளும் நேரடிச் சேவையில் பலன்களை வழங்காது.', benefits: 'வரம்பற்ற ஆன்லைன் மற்றும் தரவரிசைப் போட்டிகள் · விளம்பரங்கள் இல்லை' },
};

export const commerceStatusText = (lang: Language): Copy => copy[lang];
