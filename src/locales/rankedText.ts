const en = {
    signIn: 'Verify login for ranked play',
    help: 'Re-enter this account’s password. Local progress stays on this device.',
    failed: 'Could not verify this account. Check your password and connection.',
    fallback: 'After 60 seconds without a human opponent, a CPU of similar strength plays a rated match.',
    preparing: 'Preparing CPU opponent…',
    cpu: 'CPU · estimated strength',
    pending: 'Rating update pending',
    settled: 'Rating updated',
    connection: 'Connecting to game server…',
    unavailable: 'Unable to join. Try again.',
};
const translations: Record<string, typeof en> = {
    ja: { signIn:'レート戦のログイン確認',help:'このアカウントのパスワードを再入力してください。端末の進行状況は保持されます。',failed:'ログインを確認できませんでした。パスワードと接続を確認してください。',fallback:'60秒間対戦相手が見つからない場合、近い強さのCPUとレート変動ありで対戦します。',preparing:'CPUの対戦相手を準備しています…',cpu:'CPU・強さの目安',pending:'レート更新を確認中',settled:'レート更新済み',connection:'対局サーバーに接続中…',unavailable:'参加できませんでした。再試行してください。' },
    zh: { signIn:'验证排位登录',help:'请重新输入此账号的密码。本机进度会保留。',failed:'无法验证账号。请检查密码和连接。',fallback:'等待60秒仍无真人对手时，将与实力相近的CPU进行计分对局。',preparing:'正在准备CPU对手…',cpu:'CPU · 估计实力',pending:'等待积分更新',settled:'积分已更新',connection:'正在连接对局服务器…',unavailable:'无法加入，请重试。' },
    ru: { signIn:'Подтвердите вход для рейтинговой игры',help:'Введите пароль этого аккаунта ещё раз. Локальный прогресс сохранится.',failed:'Не удалось подтвердить аккаунт. Проверьте пароль и соединение.',fallback:'Через 60 секунд без соперника-человека начнётся рейтинговая игра с CPU близкой силы.',preparing:'Подготовка CPU…',cpu:'CPU · примерная сила',pending:'Ожидание обновления рейтинга',settled:'Рейтинг обновлён',connection:'Подключение к игровому серверу…',unavailable:'Не удалось присоединиться. Повторите попытку.' },
    fr: { signIn:'Confirmer la connexion classée',help:'Saisissez à nouveau le mot de passe du compte. La progression locale est conservée.',failed:'Compte non vérifié. Vérifiez le mot de passe et la connexion.',fallback:'Après 60 secondes sans adversaire humain, vous jouerez une partie classée contre un CPU de force similaire.',preparing:'Préparation du CPU…',cpu:'CPU · force estimée',pending:'Mise à jour du classement en attente',settled:'Classement mis à jour',connection:'Connexion au serveur de jeu…',unavailable:'Impossible de rejoindre. Réessayez.' },
    de: { signIn:'Anmeldung für Ranglistenspiele bestätigen',help:'Gib das Kontopasswort erneut ein. Lokaler Fortschritt bleibt erhalten.',failed:'Konto konnte nicht bestätigt werden. Prüfe Passwort und Verbindung.',fallback:'Nach 60 Sekunden ohne menschlichen Gegner beginnt ein gewertetes Spiel gegen eine ähnlich starke CPU.',preparing:'CPU-Gegner wird vorbereitet…',cpu:'CPU · geschätzte Stärke',pending:'Wertungsaktualisierung ausstehend',settled:'Wertung aktualisiert',connection:'Verbindung zum Spielserver…',unavailable:'Beitritt fehlgeschlagen. Erneut versuchen.' },
    es: { signIn:'Verificar acceso a clasificatorias',help:'Introduce de nuevo la contraseña de esta cuenta. Se conserva el progreso local.',failed:'No se pudo verificar la cuenta. Revisa la contraseña y la conexión.',fallback:'Tras 60 segundos sin rival humano, jugarás una partida puntuada contra una CPU de fuerza similar.',preparing:'Preparando rival CPU…',cpu:'CPU · fuerza estimada',pending:'Actualización de puntuación pendiente',settled:'Puntuación actualizada',connection:'Conectando al servidor de juego…',unavailable:'No se pudo entrar. Inténtalo de nuevo.' },
    tr: { signIn:'Dereceli oyun için girişi doğrula',help:'Bu hesabın parolasını yeniden gir. Yerel ilerleme korunur.',failed:'Hesap doğrulanamadı. Parola ve bağlantıyı kontrol et.',fallback:'60 saniye boyunca insan rakip bulunamazsa benzer güçte CPU ile dereceli maç oynanır.',preparing:'CPU rakip hazırlanıyor…',cpu:'CPU · tahmini güç',pending:'Puan güncellemesi bekleniyor',settled:'Puan güncellendi',connection:'Oyun sunucusuna bağlanılıyor…',unavailable:'Katılınamadı. Yeniden dene.' },
    pl: { signIn:'Potwierdź logowanie do gry rankingowej',help:'Wpisz ponownie hasło tego konta. Lokalny postęp zostanie zachowany.',failed:'Nie można potwierdzić konta. Sprawdź hasło i połączenie.',fallback:'Po 60 sekundach bez ludzkiego rywala rozegrasz mecz rankingowy z CPU o podobnej sile.',preparing:'Przygotowywanie rywala CPU…',cpu:'CPU · szacowana siła',pending:'Oczekiwanie na aktualizację rankingu',settled:'Ranking zaktualizowany',connection:'Łączenie z serwerem gry…',unavailable:'Nie udało się dołączyć. Spróbuj ponownie.' },
    hi: { signIn:'रैंक वाले खेल के लिए लॉगिन सत्यापित करें',help:'इस खाते का पासवर्ड दोबारा दर्ज करें। स्थानीय प्रगति सुरक्षित रहेगी।',failed:'खाता सत्यापित नहीं हुआ। पासवर्ड और कनेक्शन जाँचें।',fallback:'60 सेकंड तक मानव प्रतिद्वंद्वी न मिलने पर समान ताकत वाले CPU से रेटिंग वाला मैच होगा।',preparing:'CPU प्रतिद्वंद्वी तैयार हो रहा है…',cpu:'CPU · अनुमानित ताकत',pending:'रेटिंग अपडेट की प्रतीक्षा',settled:'रेटिंग अपडेट हुई',connection:'गेम सर्वर से जुड़ रहा है…',unavailable:'शामिल नहीं हो सके। दोबारा कोशिश करें।' },
    pt: { signIn:'Confirmar login para partidas ranqueadas',help:'Digite novamente a senha desta conta. O progresso local será mantido.',failed:'Não foi possível verificar a conta. Confira a senha e a conexão.',fallback:'Após 60 segundos sem adversário humano, você jogará uma partida válida para o ranking contra uma CPU de força semelhante.',preparing:'Preparando adversário CPU…',cpu:'CPU · força estimada',pending:'Atualização de pontuação pendente',settled:'Pontuação atualizada',connection:'Conectando ao servidor de jogo…',unavailable:'Não foi possível entrar. Tente novamente.' },
    ta: { signIn:'தரவரிசை ஆட்டத்திற்கான உள்நுழைவை உறுதிப்படுத்து',help:'இந்தக் கணக்கின் கடவுச்சொல்லை மீண்டும் உள்ளிடவும். உள்ளூர் முன்னேற்றம் பாதுகாக்கப்படும்.',failed:'கணக்கை உறுதிப்படுத்த முடியவில்லை. கடவுச்சொல் மற்றும் இணைப்பைச் சரிபார்க்கவும்.',fallback:'60 நொடிகளில் மனித எதிராளி கிடைக்காவிட்டால், ஒத்த திறனுள்ள CPU உடன் மதிப்பீட்டு ஆட்டம் தொடங்கும்.',preparing:'CPU எதிராளி தயாராகிறது…',cpu:'CPU · மதிப்பிடப்பட்ட திறன்',pending:'மதிப்பீட்டுப் புதுப்பிப்பிற்குக் காத்திருக்கிறது',settled:'மதிப்பீடு புதுப்பிக்கப்பட்டது',connection:'ஆட்டச் சேவையகத்துடன் இணைகிறது…',unavailable:'சேர முடியவில்லை. மீண்டும் முயலவும்.' },
};
export function rankedText(lang: string, key: keyof typeof en): string { return (translations[lang] || en)[key]; }

const cancelled:Record<string,string>={
    en:'Match cancelled. Your rating is unchanged.',ja:'対局を中止しました。レートは変動しません。',
    zh:'对局已取消，积分不变。',ru:'Матч отменён. Рейтинг не изменился.',fr:'Partie annulée. Votre classement reste inchangé.',
    de:'Spiel abgebrochen. Deine Wertung bleibt unverändert.',es:'Partida cancelada. Tu puntuación no cambia.',
    tr:'Maç iptal edildi. Puanın değişmedi.',pl:'Mecz anulowany. Ranking bez zmian.',
    hi:'मैच रद्द हो गया। आपकी रेटिंग नहीं बदली।',pt:'Partida cancelada. Sua pontuação não mudou.',ta:'ஆட்டம் ரத்து செய்யப்பட்டது. உங்கள் மதிப்பீடு மாறவில்லை.',
};
export const cancelledRankedText=(lang:string)=>cancelled[lang]??cancelled.en;
