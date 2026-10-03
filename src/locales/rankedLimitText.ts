import type { Language } from './dict';

const en = {
    title: 'Ranked play limit reached',
    detail: 'A participant has no free ranked matches or match tickets left, so this match cannot start. Check your balance in Tickets & Rewards on the home screen. Free matches reset at 00:00 UTC. Your rating is unchanged.',
};
const translations: Record<Language, typeof en> = {
    en,
    ja: {title:'ランク戦の対局制限に達しました',detail:'参加者の無料対局枠・対局券が不足しているため、この対局を開始できません。ホームの「チケット・報酬」で自分の残高を確認できます。無料対局枠は毎日UTC 0時（日本時間9時）に回復します。レートは変動しません。'},
    zh: {title:'已达到排位对局限制',detail:'有参与者的免费排位次数和对局券已用完，无法开始本局。请在主页的“票券与奖励”查看余额。免费次数每日UTC 0点重置。积分不变。'},
    ru: {title:'Достигнут лимит рейтинговых игр',detail:'У одного из участников закончились бесплатные игры и билеты. Проверьте свой баланс в разделе билетов и наград на главном экране. Бесплатные игры обновляются в 00:00 UTC. Рейтинг не изменён.'},
    fr: {title:'Limite de parties classées atteinte',detail:'Un participant n’a plus de parties gratuites ni de tickets. Vérifiez votre solde dans Tickets et récompenses sur l’accueil. Les parties gratuites sont renouvelées à 00:00 UTC. Votre classement ne change pas.'},
    de: {title:'Limit für Ranglistenspiele erreicht',detail:'Ein Teilnehmer hat keine Freispielrunden oder Spieltickets mehr. Prüfe dein Guthaben unter Tickets und Belohnungen auf der Startseite. Freispielrunden werden um 00:00 UTC erneuert. Deine Wertung bleibt unverändert.'},
    es: {title:'Límite de partidas clasificatorias alcanzado',detail:'Un participante no tiene partidas gratuitas ni boletos disponibles. Consulta tu saldo en Boletos y recompensas en el inicio. Las partidas gratuitas se renuevan a las 00:00 UTC. Tu puntuación no cambia.'},
    tr: {title:'Dereceli maç sınırına ulaşıldı',detail:'Bir katılımcının ücretsiz maç hakkı ve maç bileti kalmadığı için maç başlayamıyor. Ana ekrandaki Biletler ve Ödüller bölümünden bakiyeni kontrol et. Ücretsiz haklar 00:00 UTC’de yenilenir. Puanın değişmez.'},
    pl: {title:'Osiągnięto limit gier rankingowych',detail:'Jednemu z graczy skończyły się darmowe gry i bilety. Sprawdź saldo w sekcji biletów i nagród na ekranie głównym. Darmowe gry odnawiają się o 00:00 UTC. Ranking pozostaje bez zmian.'},
    hi: {title:'रैंक वाले मैचों की सीमा पूरी हो गई',detail:'किसी खिलाड़ी के मुफ्त मैच और मैच टिकट समाप्त होने के कारण यह मैच शुरू नहीं हो सकता। होम स्क्रीन पर टिकट और पुरस्कार में अपना शेष देखें। मुफ्त मैच रोज़ 00:00 UTC पर रीसेट होते हैं। आपकी रेटिंग नहीं बदली है।'},
    pt: {title:'Limite de partidas ranqueadas atingido',detail:'Um participante ficou sem partidas gratuitas e bilhetes. Confira seu saldo em Bilhetes e recompensas na tela inicial. As partidas gratuitas são renovadas às 00:00 UTC. Sua pontuação não muda.'},
    ta: {title:'தரவரிசை ஆட்ட வரம்பை அடைந்துவிட்டீர்கள்',detail:'ஒரு பங்கேற்பாளரிடம் இலவச ஆட்டங்களும் ஆட்டச் சீட்டுகளும் இல்லாததால் ஆட்டத்தைத் தொடங்க முடியவில்லை. முகப்பில் சீட்டுகள் மற்றும் பரிசுகளில் உங்கள் இருப்பைப் பார்க்கவும். இலவச ஆட்டங்கள் தினமும் 00:00 UTC மணிக்கு மீளும். மதிப்பீடு மாறாது.'},
};
export const rankedLimitText = (lang: Language) => translations[lang] ?? en;
export const isRankedLimitReason = (reason: unknown) => reason === 'INSUFFICIENT_FUNDS';
