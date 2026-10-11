import type { Language } from './dict';
import { termsText } from './termsText';

const rows: Record<Language, readonly [string, string, string, string, string]> = {
    ja: ['対局前に現行規約を確認', 'オンライン対局を始める前に、現行の利用規約への同意を確認します。内容を確認してから続けてください。', '現行規約の全文を読む', '同意を保存しています…', 'オンライン対局には登録アカウントでのログインが必要です。'],
    en: ['Current terms before your match', 'Before starting an online match, we check your agreement to the current terms. Review them before continuing.', 'Read the full current terms', 'Saving your agreement…', 'Sign in to a registered account for online matches.'],
    zh: ['对局前确认现行条款', '开始在线对局前，我们会确认您是否同意现行使用条款。请阅读后再继续。', '阅读现行条款全文', '正在保存同意…', '在线对局需要登录注册账号。'],
    ru: ['Действующие условия перед матчем', 'Перед онлайн-матчем мы проверяем согласие с действующими условиями. Ознакомьтесь с ними перед продолжением.', 'Прочитать действующие условия полностью', 'Сохранение согласия…', 'Для онлайн-матчей войдите в зарегистрированную учётную запись.'],
    fr: ['Conditions en vigueur avant la partie', 'Avant une partie en ligne, nous vérifions votre accord aux conditions en vigueur. Lisez-les avant de continuer.', 'Lire les conditions en vigueur en entier', 'Enregistrement de votre accord…', 'Connectez-vous à un compte enregistré pour les parties en ligne.'],
    de: ['Aktuelle Bedingungen vor der Partie', 'Vor einer Online-Partie prüfen wir deine Zustimmung zu den aktuellen Bedingungen. Lies sie vor dem Fortfahren.', 'Aktuelle Bedingungen vollständig lesen', 'Deine Zustimmung wird gespeichert…', 'Melde dich für Online-Partien mit einem registrierten Konto an.'],
    es: ['Condiciones actuales antes de la partida', 'Antes de una partida en línea, comprobamos tu aceptación de las condiciones actuales. Léelas antes de continuar.', 'Leer las condiciones actuales completas', 'Guardando tu aceptación…', 'Inicia sesión con una cuenta registrada para partidas en línea.'],
    tr: ['Maç öncesinde güncel koşullar', 'Çevrimiçi maçtan önce güncel koşulları kabul ettiğinizi kontrol ederiz. Devam etmeden önce inceleyin.', 'Güncel koşulların tamamını oku', 'Onayınız kaydediliyor…', 'Çevrimiçi maçlar için kayıtlı bir hesaba giriş yapın.'],
    pl: ['Aktualne warunki przed meczem', 'Przed meczem online sprawdzamy zgodę na aktualne warunki. Zapoznaj się z nimi przed kontynuowaniem.', 'Przeczytaj pełne aktualne warunki', 'Zapisywanie zgody…', 'Zaloguj się na zarejestrowane konto, aby grać online.'],
    hi: ['मैच से पहले वर्तमान शर्तें', 'ऑनलाइन मैच शुरू करने से पहले हम वर्तमान शर्तों पर आपकी सहमति जाँचते हैं। आगे बढ़ने से पहले इन्हें पढ़ें।', 'वर्तमान शर्तों का पूरा पाठ पढ़ें', 'आपकी सहमति सहेजी जा रही है…', 'ऑनलाइन मैच के लिए पंजीकृत खाते में लॉग इन करें।'],
    pt: ['Termos atuais antes da partida', 'Antes de uma partida online, verificamos sua aceitação dos termos atuais. Leia-os antes de continuar.', 'Ler os termos atuais completos', 'Salvando sua aceitação…', 'Entre em uma conta registrada para partidas online.'],
    ta: ['ஆட்டத்திற்கு முன் நடப்பு விதிமுறைகள்', 'இணைய ஆட்டத்திற்கு முன் நடப்பு விதிமுறைகளுக்கான உங்கள் ஒப்புதலைச் சரிபார்க்கிறோம். தொடரும் முன் அவற்றைப் படிக்கவும்.', 'நடப்பு விதிமுறைகளின் முழு உரையைப் படிக்கவும்', 'உங்கள் ஒப்புதல் சேமிக்கப்படுகிறது…', 'இணைய ஆட்டங்களுக்கு பதிவுசெய்த கணக்கில் உள்நுழையவும்.'],
};

export function onlineMatchTermsText(lang: Language) {
    const [title, description, document, saving, guest] = rows[lang];
    const common = termsText(lang);
    return {
        title, description, document, saving, guest,
        documentLanguages: common[7], checkbox: common[1], accept: common[2],
        checking: common[4], error: common[5], retry: common[6], cancel: common[3],
    };
}
