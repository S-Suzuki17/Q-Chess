import type { Language } from './dict';
type Copy = { failed: string; code: string };
const copy: Record<Language, Copy> = {
    en:{failed:'Unable to start this match',code:'Support code'},
    ja:{failed:'対局を開始できませんでした',code:'サポートコード'},
    zh:{failed:'无法开始此对局',code:'支持代码'},
    ru:{failed:'Не удалось начать матч',code:'Код для поддержки'},
    fr:{failed:'Impossible de démarrer cette partie',code:'Code pour l’assistance'},
    de:{failed:'Dieses Spiel konnte nicht gestartet werden',code:'Support-Code'},
    es:{failed:'No se pudo iniciar esta partida',code:'Código de soporte'},
    tr:{failed:'Bu maç başlatılamadı',code:'Destek kodu'},
    pl:{failed:'Nie można rozpocząć tego meczu',code:'Kod dla pomocy technicznej'},
    hi:{failed:'यह मैच शुरू नहीं हो सका',code:'सहायता कोड'},
    pt:{failed:'Não foi possível iniciar esta partida',code:'Código de suporte'},
    ta:{failed:'இந்தப் போட்டியைத் தொடங்க முடியவில்லை',code:'உதவிக் குறியீடு'},
};
export const rankedStartText = (lang: Language): Copy => copy[lang];
const codes = new Set([
    'CPU_PRACTICE_PENDING','HINT_PURCHASE_PENDING','INVALID_QUEUE','SERVICE_UNAVAILABLE',
    'SHARED_MATCH_UNAVAILABLE','ACCOUNT_BUSY','RANKED_UNAVAILABLE','RATING_UNAVAILABLE',
    'AUTH_UNAVAILABLE','QUEUE_BUSY','CONNECTION_FAILED','AUTH_REQUIRED','RANKED_AUTH_REQUIRED','SESSION_REPLACED',
    'INVALID_ROOM','ROOM_NOT_FOUND','ROOM_CLOSED','ROOM_EXISTS','ROOM_FULL',
    'MAINTENANCE','UPDATE_REQUIRED','INSUFFICIENT_FUNDS','RANKED_LIMIT_REACHED','QUEUE_FAILED',
]);
/** Report only known machine codes; never raw server text, account IDs or credentials. */
export function rankedStartDiagnostic(value: unknown): string {
    return typeof value === 'string' && codes.has(value) ? value : 'QUEUE_FAILED';
}

type RecoveryCopy = { busy: string; ratings: string; temporary: string; practice: string; hint: string; session: string; invalid: string; cancelledConnection: string; cancelledAccount: string; cancelledService: string; missing: string };
const recovery: Record<Language, RecoveryCopy> = {
    en:{busy:'Check for an existing match or another open tab before retrying.',ratings:'Your match information could not be loaded. Try again.',temporary:'Check your connection, then retry.',practice:'Wait for the practice operation to finish, then retry.',hint:'Wait for the hint request to finish, then retry.',session:'Your sign-in changed in another tab or device. Sign in again here before selecting a match.',invalid:'Return home and select the match settings again.',cancelledConnection:'The players could not connect in time. Select another match from home.',cancelledAccount:'The account checks needed to start did not finish. Return home and check your terms consent and sign-in.',cancelledService:'A service needed for this match was unavailable. Check your connection and retry from home.',missing:'This match cannot be resumed. Select a new match from home.'},
    ja:{busy:'進行中の対局や別のタブを確認してから、再試行してください。',ratings:'対局情報を取得できませんでした。もう一度お試しください。',temporary:'通信状態を確認して、再試行してください。',practice:'練習の処理が終わってから、再試行してください。',hint:'ヒントの処理が終わってから、再試行してください。',session:'別のタブや端末でログインが切り替わりました。この画面で再度ログインしてから対局を選んでください。',invalid:'ホームに戻り、対局設定を選び直してください。',cancelledConnection:'参加者の接続が時間内に完了しませんでした。ホームから対局を選び直してください。',cancelledAccount:'開始に必要なアカウント確認を完了できませんでした。ホームに戻り、規約への同意とログイン状態を確認してください。',cancelledService:'この対局に必要なサービスを利用できませんでした。通信状態を確認し、ホームから再試行してください。',missing:'この対局を再開できません。ホームから新しい対局を選んでください。'},
    zh:{busy:'重试前，请检查正在进行的对局或其他标签页。',ratings:'无法获取对局信息。请重试。',temporary:'请检查网络连接，然后重试。',practice:'请等待练习操作完成后再重试。',hint:'请等待提示处理完成后再重试。',session:'其他标签页或设备更改了登录状态。请在此重新登录后选择对局。',invalid:'请返回主页并重新选择对局设置。',cancelledConnection:'双方未能及时连接。请从主页重新选择对局。',cancelledAccount:'开始对局所需的账户检查未完成。请返回主页检查条款同意和登录状态。',cancelledService:'此对局所需的服务暂不可用。请检查连接并从主页重试。',missing:'无法恢复此对局。请从主页选择新的对局。'},
    ru:{busy:'Перед повтором проверьте текущую партию и другие вкладки.',ratings:'Не удалось получить данные партии. Повторите попытку.',temporary:'Проверьте соединение и повторите попытку.',practice:'Дождитесь завершения операции тренировки, затем повторите попытку.',hint:'Дождитесь завершения запроса подсказки и повторите попытку.',session:'Вход изменился в другой вкладке или на другом устройстве. Войдите здесь снова, прежде чем выбирать партию.',invalid:'Вернитесь на главную и выберите настройки партии заново.',cancelledConnection:'Игроки не успели подключиться. Выберите другую партию на главной.',cancelledAccount:'Проверки аккаунта перед стартом не завершены. На главной проверьте принятие условий и вход.',cancelledService:'Нужный для партии сервис недоступен. Проверьте соединение и повторите попытку с главной.',missing:'Эту партию нельзя восстановить. Выберите новую на главной.'},
    fr:{busy:'Vérifiez les parties en cours et les autres onglets avant de réessayer.',ratings:'Les informations de la partie n’ont pas pu être chargées. Réessayez.',temporary:'Vérifiez votre connexion, puis réessayez.',practice:'Attendez la fin de l’opération d’entraînement, puis réessayez.',hint:'Attendez la fin de la demande d’indice, puis réessayez.',session:'Votre connexion a changé dans un autre onglet ou appareil. Reconnectez-vous ici avant de choisir une partie.',invalid:'Retournez à l’accueil et choisissez à nouveau les réglages.',cancelledConnection:'Les joueurs n’ont pas pu se connecter à temps. Choisissez une autre partie depuis l’accueil.',cancelledAccount:'Les vérifications du compte avant le départ n’ont pas abouti. Vérifiez les conditions acceptées et votre connexion depuis l’accueil.',cancelledService:'Un service nécessaire était indisponible. Vérifiez votre connexion et réessayez depuis l’accueil.',missing:'Cette partie ne peut pas être reprise. Choisissez-en une nouvelle depuis l’accueil.'},
    de:{busy:'Prüfe vor dem erneuten Versuch laufende Partien und andere Tabs.',ratings:'Die Spielinformationen konnten nicht geladen werden. Versuche es erneut.',temporary:'Prüfe die Verbindung und versuche es erneut.',practice:'Warte, bis der Trainingsvorgang beendet ist, und versuche es erneut.',hint:'Warte, bis die Hinweisanfrage fertig ist, und versuche es erneut.',session:'Deine Anmeldung wurde in einem anderen Tab oder Gerät geändert. Melde dich hier erneut an, bevor du eine Partie auswählst.',invalid:'Kehre zur Startseite zurück und wähle die Spieleinstellungen erneut.',cancelledConnection:'Die Spieler konnten sich nicht rechtzeitig verbinden. Wähle auf der Startseite eine andere Partie.',cancelledAccount:'Die Kontoprüfung vor dem Start ist nicht abgeschlossen. Prüfe auf der Startseite die Zustimmung zu den Bedingungen und deine Anmeldung.',cancelledService:'Ein benötigter Dienst war nicht verfügbar. Prüfe die Verbindung und versuche es von der Startseite erneut.',missing:'Diese Partie kann nicht fortgesetzt werden. Wähle auf der Startseite eine neue.'},
    es:{busy:'Antes de reintentar, comprueba las partidas activas y las otras pestañas.',ratings:'No se pudo cargar la información de la partida. Reintenta.',temporary:'Comprueba tu conexión y reintenta.',practice:'Espera a que termine la operación de práctica y reintenta.',hint:'Espera a que termine la solicitud de pista y reintenta.',session:'Tu sesión cambió en otra pestaña o dispositivo. Inicia sesión aquí de nuevo antes de elegir una partida.',invalid:'Vuelve al inicio y elige de nuevo la configuración.',cancelledConnection:'Los jugadores no se conectaron a tiempo. Elige otra partida desde el inicio.',cancelledAccount:'No se completaron las comprobaciones de la cuenta. Vuelve al inicio y comprueba la aceptación de condiciones y tu sesión.',cancelledService:'Un servicio necesario no estaba disponible. Comprueba la conexión y reintenta desde el inicio.',missing:'No se puede reanudar esta partida. Elige una nueva desde el inicio.'},
    tr:{busy:'Yeniden denemeden önce devam eden maçları ve diğer sekmeleri kontrol edin.',ratings:'Maç bilgileri yüklenemedi. Yeniden deneyin.',temporary:'Bağlantınızı kontrol edip yeniden deneyin.',practice:'Antrenman işleminin tamamlanmasını bekleyip yeniden deneyin.',hint:'İpucu isteğinin tamamlanmasını bekleyip yeniden deneyin.',session:'Başka bir sekme veya cihazda oturumunuz değişti. Maç seçmeden önce burada yeniden giriş yapın.',invalid:'Ana sayfaya dönüp maç ayarlarını yeniden seçin.',cancelledConnection:'Oyuncular zamanında bağlanamadı. Ana sayfadan başka bir maç seçin.',cancelledAccount:'Başlangıç için gereken hesap kontrolleri tamamlanamadı. Ana sayfada koşul onayınızı ve oturumunuzu kontrol edin.',cancelledService:'Bu maç için gereken bir hizmet kullanılamadı. Bağlantınızı kontrol edip ana sayfadan yeniden deneyin.',missing:'Bu maç sürdürülemiyor. Ana sayfadan yeni bir maç seçin.'},
    pl:{busy:'Przed ponowną próbą sprawdź trwające partie i inne karty.',ratings:'Nie udało się pobrać informacji o partii. Spróbuj ponownie.',temporary:'Sprawdź połączenie i spróbuj ponownie.',practice:'Poczekaj na zakończenie operacji treningowej i spróbuj ponownie.',hint:'Poczekaj na zakończenie żądania podpowiedzi i spróbuj ponownie.',session:'Logowanie zmieniło się w innej karcie lub na innym urządzeniu. Zaloguj się tutaj ponownie przed wybraniem partii.',invalid:'Wróć na stronę główną i ponownie wybierz ustawienia.',cancelledConnection:'Gracze nie połączyli się na czas. Wybierz inną partię na stronie głównej.',cancelledAccount:'Nie zakończono kontroli konta przed startem. Na stronie głównej sprawdź zgodę na warunki i logowanie.',cancelledService:'Usługa potrzebna do partii była niedostępna. Sprawdź połączenie i spróbuj ze strony głównej.',missing:'Nie można wznowić tej partii. Wybierz nową na stronie głównej.'},
    hi:{busy:'दोबारा कोशिश करने से पहले चल रहे मैच और दूसरे टैब देखें।',ratings:'मैच की जानकारी नहीं मिली। फिर कोशिश करें।',temporary:'कनेक्शन जाँचें और फिर कोशिश करें।',practice:'अभ्यास की प्रक्रिया पूरी होने दें, फिर कोशिश करें।',hint:'हिंट अनुरोध पूरा होने दें, फिर कोशिश करें।',session:'दूसरे टैब या डिवाइस पर आपका लॉगिन बदल गया है। मैच चुनने से पहले यहाँ फिर लॉगिन करें।',invalid:'होम पर लौटकर मैच की सेटिंग फिर चुनें।',cancelledConnection:'खिलाड़ी समय पर जुड़ नहीं सके। होम से दूसरा मैच चुनें।',cancelledAccount:'मैच शुरू करने के लिए खाते की जाँच पूरी नहीं हुई। होम पर नियमों की सहमति और लॉगिन जाँचें।',cancelledService:'इस मैच के लिए ज़रूरी सेवा उपलब्ध नहीं थी। कनेक्शन जाँचकर होम से फिर कोशिश करें।',missing:'यह मैच फिर शुरू नहीं किया जा सकता। होम से नया मैच चुनें।'},
    pt:{busy:'Antes de tentar novamente, confira partidas em andamento e outras abas.',ratings:'Não foi possível carregar as informações da partida. Tente novamente.',temporary:'Confira sua conexão e tente novamente.',practice:'Aguarde a conclusão da operação de treino e tente novamente.',hint:'Aguarde a conclusão do pedido de dica e tente novamente.',session:'Seu login mudou em outra aba ou dispositivo. Entre novamente aqui antes de escolher uma partida.',invalid:'Volte ao início e selecione as configurações novamente.',cancelledConnection:'Os jogadores não se conectaram a tempo. Escolha outra partida no início.',cancelledAccount:'As verificações da conta antes do início não terminaram. Confira no início o aceite dos termos e o login.',cancelledService:'Um serviço necessário não estava disponível. Confira a conexão e tente novamente pelo início.',missing:'Esta partida não pode ser retomada. Escolha uma nova no início.'},
    ta:{busy:'மீண்டும் முயலும் முன் நடக்கும் ஆட்டங்களையும் பிற தாவல்களையும் சரிபார்க்கவும்.',ratings:'ஆட்டத் தகவலைப் பெற முடியவில்லை. மீண்டும் முயலவும்.',temporary:'இணைப்பைச் சரிபார்த்து மீண்டும் முயலவும்.',practice:'பயிற்சிச் செயல் முடியும் வரை காத்திருந்து மீண்டும் முயலவும்.',hint:'குறிப்பு கோரிக்கை முடியும் வரை காத்திருந்து மீண்டும் முயலவும்.',session:'பிற தாவல் அல்லது சாதனத்தில் உள்நுழைவு மாறியுள்ளது. ஆட்டத்தைத் தேர்ந்தெடுக்கும் முன் இங்கே மீண்டும் உள்நுழையவும்.',invalid:'முகப்புக்குத் திரும்பி ஆட்ட அமைப்புகளை மீண்டும் தேர்ந்தெடுக்கவும்.',cancelledConnection:'வீரர்கள் உரிய நேரத்தில் இணையவில்லை. முகப்பிலிருந்து வேறு ஆட்டத்தைத் தேர்ந்தெடுக்கவும்.',cancelledAccount:'தொடங்குவதற்கான கணக்குச் சரிபார்ப்பு முடியவில்லை. முகப்பில் விதிமுறை ஒப்புதலையும் உள்நுழைவையும் சரிபார்க்கவும்.',cancelledService:'ஆட்டத்திற்குத் தேவையான சேவை கிடைக்கவில்லை. இணைப்பைச் சரிபார்த்து முகப்பிலிருந்து மீண்டும் முயலவும்.',missing:'இந்த ஆட்டத்தைத் தொடர முடியாது. முகப்பிலிருந்து புதிய ஆட்டத்தைத் தேர்ந்தெடுக்கவும்.'},
};
export function rankedStartRecoveryText(lang: Language, code: unknown): string | null {
    const t=recovery[lang];
    if(code==='ACCOUNT_BUSY'||code==='QUEUE_BUSY')return t.busy;
    if(code==='RATING_UNAVAILABLE')return t.ratings;
    if(code==='CPU_PRACTICE_PENDING')return t.practice;
    if(code==='HINT_PURCHASE_PENDING')return t.hint;
    if(code==='SESSION_REPLACED')return t.session;
    if(code==='INVALID_QUEUE'||code==='INVALID_ROOM'||code==='ROOM_EXISTS')return t.invalid;
    if(code==='ROOM_NOT_FOUND'||code==='ROOM_CLOSED')return t.missing;
    if(code==='ROOM_FULL')return t.busy;
    if(['MAINTENANCE','UPDATE_REQUIRED','AUTH_REQUIRED','RANKED_AUTH_REQUIRED','INSUFFICIENT_FUNDS','RANKED_LIMIT_REACHED'].includes(String(code)))return null;
    return t.temporary;
}
const cancellationCodes=new Set(['connection_timeout','admission_unavailable','prestart_unavailable','authentication_required',
    'authentication_unavailable','server_unavailable','server_recovery','match_not_found','cpu_unavailable',
    'admission_cancelled','owner_unavailable','INSUFFICIENT_FUNDS']);
export function rankedCancellationDiagnostic(value: unknown): string {
    return typeof value==='string'&&cancellationCodes.has(value)?value:'MATCH_CANCELLED';
}
export function rankedCancellationRecoveryText(lang: Language, code: unknown): string | null {
    const t=recovery[lang];
    if(code==='connection_timeout')return t.cancelledConnection;
    if(code==='admission_unavailable'||code==='authentication_required')return t.cancelledAccount;
    if(code==='match_not_found')return t.missing;
    if(['prestart_unavailable','authentication_unavailable','server_unavailable','server_recovery','cpu_unavailable','owner_unavailable'].includes(String(code)))return t.cancelledService;
    return null;
}
