import type { Language } from './dict';
const copy: Record<Language, readonly [string, string, string]> = {
    ja: ['ログインの有効期限が切れています。一度ログアウトして、もう一度ログインしてください。', '変更を保存できませんでした。時間をおいて再度お試しください。', '名前は1〜15文字で、表示できる文字を使ってください。'],
    en: ['Your session has expired. Sign out and sign in again.', 'Could not save. Please try again shortly.', 'Use 1–15 visible characters for your name.'],
    zh: ['登录已过期。请退出后重新登录。', '无法保存，请稍后重试。', '名称请使用1至15个可见字符。'],
    ru: ['Сеанс истёк. Выйдите и войдите снова.', 'Не удалось сохранить. Повторите позже.', 'Используйте от 1 до 15 видимых символов.'],
    fr: ['Session expirée. Déconnectez-vous, puis reconnectez-vous.', 'Échec de l’enregistrement. Réessayez plus tard.', 'Utilisez de 1 à 15 caractères visibles.'],
    de: ['Sitzung abgelaufen. Bitte abmelden und erneut anmelden.', 'Speichern fehlgeschlagen. Bitte später erneut versuchen.', 'Verwende 1–15 sichtbare Zeichen für deinen Namen.'],
    es: ['La sesión ha caducado. Cierra sesión y vuelve a entrar.', 'No se pudo guardar. Inténtalo más tarde.', 'Usa entre 1 y 15 caracteres visibles para tu nombre.'],
    tr: ['Oturum sona erdi. Çıkış yapıp tekrar giriş yapın.', 'Kaydedilemedi. Biraz sonra tekrar deneyin.', 'Adınız için 1–15 görünür karakter kullanın.'],
    pl: ['Sesja wygasła. Wyloguj się i zaloguj ponownie.', 'Nie zapisano. Spróbuj ponownie później.', 'Użyj od 1 do 15 widocznych znaków.'],
    hi: ['सत्र समाप्त हो गया है। लॉग आउट करके फिर लॉग इन करें।', 'सहेजा नहीं जा सका। थोड़ी देर बाद फिर कोशिश करें।', 'नाम के लिए 1–15 दिखाई देने वाले अक्षर इस्तेमाल करें।'],
    pt: ['A sessão expirou. Saia e entre novamente.', 'Não foi possível salvar. Tente novamente mais tarde.', 'Use de 1 a 15 caracteres visíveis no nome.'],
    ta: ['அமர்வு காலாவதியானது. வெளியேறி மீண்டும் உள்நுழையவும்.', 'சேமிக்க முடியவில்லை. சிறிது நேரத்தில் மீண்டும் முயலவும்.', 'பெயருக்கு 1–15 காணக்கூடிய எழுத்துகளைப் பயன்படுத்தவும்.'],
};
export const accountProfileText = (lang: Language, key: 'auth' | 'failed' | 'name') => copy[lang][key === 'auth' ? 0 : key === 'failed' ? 1 : 2];
