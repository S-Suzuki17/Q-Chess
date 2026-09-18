import type { Language } from './dict';

const copy = {
    en: ['This replay is incomplete or uses an unsupported format. It cannot be shown accurately.', 'The moves for this game were not saved. The original position cannot be reconstructed.', 'First position', 'Last position'],
    ja: ['棋譜データが不完全か、対応していない形式のため、正確に再生できません。', 'この対局には着手データが保存されていないため、棋譜を復元できません。', '最初の局面', '最後の局面'],
    zh: ['棋谱不完整或格式不受支持，无法准确回放。', '此对局未保存着法，无法恢复棋谱。', '初始局面', '最后局面'],
    ru: ['Запись неполна или имеет неподдерживаемый формат. Точное воспроизведение невозможно.', 'Ходы этой партии не сохранены. Восстановить запись невозможно.', 'Начальная позиция', 'Последняя позиция'],
    fr: ['Cette partie est incomplète ou dans un format non pris en charge. La relecture exacte est impossible.', 'Les coups de cette partie n’ont pas été sauvegardés. La partie ne peut pas être reconstituée.', 'Position initiale', 'Dernière position'],
    de: ['Die Aufzeichnung ist unvollständig oder hat ein nicht unterstütztes Format. Eine genaue Wiedergabe ist nicht möglich.', 'Die Züge dieser Partie wurden nicht gespeichert. Sie lassen sich nicht rekonstruieren.', 'Anfangsstellung', 'Letzte Stellung'],
    es: ['La partida está incompleta o usa un formato no compatible. No puede reproducirse con precisión.', 'No se guardaron los movimientos de esta partida. No es posible reconstruirla.', 'Posición inicial', 'Posición final'],
    tr: ['Kayıt eksik veya desteklenmeyen bir biçimde. Doğru şekilde tekrar oynatılamıyor.', 'Bu oyunun hamleleri kaydedilmedi. Oyun yeniden oluşturulamıyor.', 'İlk konum', 'Son konum'],
    pl: ['Zapis jest niekompletny lub ma nieobsługiwany format. Dokładne odtworzenie jest niemożliwe.', 'Ruchy tej partii nie zostały zapisane. Nie można ich odtworzyć.', 'Pozycja początkowa', 'Pozycja końcowa'],
    hi: ['रिकॉर्ड अधूरा है या इसका प्रारूप समर्थित नहीं है। इसे सही ढंग से दोबारा नहीं दिखाया जा सकता।', 'इस बाज़ी की चालें सहेजी नहीं गई थीं। रिकॉर्ड दोबारा नहीं बनाया जा सकता।', 'प्रारंभिक स्थिति', 'अंतिम स्थिति'],
    pt: ['O registro está incompleto ou usa um formato não compatível. Não é possível reproduzi-lo com precisão.', 'Os lances desta partida não foram salvos. Não é possível reconstruí-la.', 'Posição inicial', 'Posição final'],
    ta: ['பதிவு முழுமையற்றது அல்லது ஆதரிக்கப்படாத வடிவத்தில் உள்ளது. துல்லியமாக மீள்பார்க்க முடியாது.', 'இந்த ஆட்டத்தின் நகர்வுகள் சேமிக்கப்படவில்லை. பதிவை மீட்டமைக்க முடியாது.', 'தொடக்க நிலை', 'இறுதி நிலை']
} satisfies Record<Language, string[]>;

export function replayText(language: Language) {
    const [invalid, missing, first, last] = copy[language] ?? copy.en;
    const [saveFailed, retry] = saveCopy[language] ?? saveCopy.en;
    const [historyOnly, historyUnavailable, historyVerify, historyRetry] = historyCopy[language] ?? historyCopy.en;
    return { invalid, missing, first, last, saveFailed, retry, historyOnly, historyUnavailable, historyVerify, historyRetry };
}

const saveCopy = {
    en: ['Replay not saved. Check your connection and sign-in, then retry.', 'Retry saving'],
    ja: ['棋譜は保存されていません。通信とログイン状態を確認して再試行してください。', '保存を再試行'],
    zh: ['棋谱未保存。请检查网络和登录状态后重试。', '重新保存'],
    ru: ['Запись не сохранена. Проверьте подключение и вход в аккаунт, затем повторите.', 'Повторить сохранение'],
    fr: ['Partie non sauvegardée. Vérifiez la connexion et votre compte, puis réessayez.', 'Réessayer la sauvegarde'],
    de: ['Partie nicht gespeichert. Prüfe Verbindung und Anmeldung und versuche es erneut.', 'Speichern wiederholen'],
    es: ['Partida no guardada. Revisa la conexión y el inicio de sesión e inténtalo de nuevo.', 'Volver a guardar'],
    tr: ['Kayıt kaydedilmedi. Bağlantınızı ve oturumunuzu kontrol edip tekrar deneyin.', 'Kaydetmeyi yeniden dene'],
    pl: ['Partia nie została zapisana. Sprawdź połączenie i logowanie, a potem spróbuj ponownie.', 'Ponów zapis'],
    hi: ['रिकॉर्ड सहेजा नहीं गया। कनेक्शन और लॉगिन जाँचकर फिर कोशिश करें।', 'फिर सहेजें'],
    pt: ['Partida não salva. Verifique a conexão e o login e tente novamente.', 'Tentar salvar novamente'],
    ta: ['பதிவு சேமிக்கப்படவில்லை. இணைப்பையும் உள்நுழைவையும் சரிபார்த்து மீண்டும் முயலவும்.', 'மீண்டும் சேமி']
} satisfies Record<Language, string[]>;

const historyCopy = {
    en: ['Only your 10 most recent games are shown.', 'Could not load your replays. Please retry.', 'Verify your login to view your own replays.', 'Retry'],
    ja: ['自分の直近10試合のみ表示します。', '棋譜を取得できませんでした。再試行してください。', '自分の棋譜を見るにはログインを確認してください。', '再試行'],
    zh: ['仅显示你最近的10场对局。', '无法加载棋谱，请重试。', '查看自己的棋谱前请验证登录。', '重试'],
    ru: ['Показаны только ваши 10 последних партий.', 'Не удалось загрузить записи. Повторите попытку.', 'Подтвердите вход, чтобы просмотреть свои партии.', 'Повторить'],
    fr: ['Seules vos 10 dernières parties sont affichées.', 'Impossible de charger vos parties. Veuillez réessayer.', 'Confirmez votre connexion pour voir vos parties.', 'Réessayer'],
    de: ['Es werden nur deine letzten 10 Partien angezeigt.', 'Deine Partien konnten nicht geladen werden. Versuche es erneut.', 'Bestätige die Anmeldung, um deine Partien anzusehen.', 'Erneut versuchen'],
    es: ['Solo se muestran tus 10 partidas más recientes.', 'No se pudieron cargar tus partidas. Inténtalo de nuevo.', 'Verifica tu inicio de sesión para ver tus partidas.', 'Reintentar'],
    tr: ['Yalnızca en son 10 oyununuz gösterilir.', 'Oyun kayıtları yüklenemedi. Lütfen tekrar deneyin.', 'Kendi kayıtlarınızı görmek için oturumunuzu doğrulayın.', 'Tekrar dene'],
    pl: ['Wyświetlane jest tylko 10 twoich ostatnich partii.', 'Nie udało się pobrać zapisów. Spróbuj ponownie.', 'Potwierdź logowanie, aby zobaczyć swoje partie.', 'Spróbuj ponownie'],
    hi: ['केवल आपकी सबसे हाल की 10 बाज़ियाँ दिखाई जाती हैं।', 'आपके रिकॉर्ड लोड नहीं हो सके। फिर कोशिश करें।', 'अपने रिकॉर्ड देखने के लिए लॉगिन की पुष्टि करें।', 'फिर कोशिश करें'],
    pt: ['Apenas suas 10 partidas mais recentes são exibidas.', 'Não foi possível carregar suas partidas. Tente novamente.', 'Confirme o login para ver suas partidas.', 'Tentar novamente'],
    ta: ['உங்கள் சமீபத்திய 10 ஆட்டங்கள் மட்டுமே காட்டப்படும்.', 'பதிவுகளை ஏற்ற முடியவில்லை. மீண்டும் முயலவும்.', 'உங்கள் பதிவுகளைப் பார்க்க உள்நுழைவை உறுதிப்படுத்தவும்.', 'மீண்டும் முயல்']
} satisfies Record<Language, string[]>;
