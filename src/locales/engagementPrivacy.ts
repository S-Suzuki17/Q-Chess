import type { Language } from './dict';

type OptionalMetricsNotice = {
    title: string;
    choice: string;
    details: string;
    withdrawal: string;
};

/** Optional, first-party gameplay metrics. Keep this in step with engagementMetrics. */
export const engagementPrivacy: Record<Language, OptionalMetricsNotice> = {
    en: {
        title: 'Optional gameplay metrics',
        choice: 'Gameplay metrics are off by default. Only after you turn them on in Settings, this browser sends seven milestone events: first visit after opt-in, tutorial start and completion, first match start and finish, second match start, and next-day return. Children should choose with a parent or guardian.',
        details: 'The browser stores your choice, the UTC day you opted in, and one-time sending flags. We store only the event type, that UTC cohort day, the receipt time, and a random per-event duplicate-prevention ID for up to 90 days. No account ID, email, match record, advertising ID, or page URL is sent in these events. Results are approximate, per browser, and are not linked across devices. Hosting providers may separately process essential connection and security logs.',
        withdrawal: 'Turn metrics off in Settings at any time. This stops future events and clears the browser’s metrics state. Earlier anonymous events cannot be individually identified or removed; they expire within 90 days. Advertising and ad-based play limits remain off.',
    },
    ja: {
        title: '任意のプレイ状況計測',
        choice: '計測は初期状態でOFFです。設定でONにした場合のみ、このブラウザーから同意後の初回訪問・チュートリアル開始と完了・初対局開始と終了・2局目開始・翌日再訪の7種類の節目を送信します。お子様は保護者と一緒に選んでください。',
        details: '端末には同意の選択、同意したUTC日付、送信済みの印だけを保存します。サーバーに保存するのはイベント種別・そのUTC日付・受信時刻・イベントごとの重複防止用ランダムIDのみで、90日以内に削除します。アカウントID、メール、棋譜、広告ID、閲覧URLは計測イベントに含めません。集計値はブラウザー単位の概算で、端末間では結び付けません。ホスティング事業者は運用に必要な接続・セキュリティログを別途処理する場合があります。',
        withdrawal: '設定からいつでもOFFにできます。その後の送信を止め、端末内の計測状態を消します。送信済みの匿名イベントは個人を特定して削除できませんが、90日以内に消えます。広告と広告に連動する対局回数制限は引き続きOFFです。',
    },
    zh: {
        title: '可选的游戏统计',
        choice: '统计默认关闭。仅在设置中开启后，此浏览器才会发送同意后的首次访问、教程开始与完成、首局开始与结束、第二局开始和次日返回这七类事件。儿童应与监护人一起选择。',
        details: '浏览器保存您的选择、同意时的 UTC 日期和已发送标记。服务器只保存事件类型、该 UTC 日期、接收时间及每个事件的随机防重复 ID，最多保留 90 天。事件不含账户 ID、邮箱、棋谱、广告 ID 或页面网址。结果是按浏览器计算的近似值，不跨设备关联。托管服务商可能另行处理必要的连接与安全日志。',
        withdrawal: '可随时在设置中关闭，以停止后续发送并清除本机统计状态。已发送的匿名事件无法按个人识别或删除，但会在 90 天内到期。广告及相关次数限制仍关闭。',
    },
    ru: {
        title: 'Необязательная статистика игры',
        choice: 'Статистика по умолчанию выключена. Только после включения в настройках браузер отправляет семь событий: первый визит после согласия, начало и завершение обучения, начало и завершение первой партии, начало второй партии и возвращение на следующий день. Детям следует выбирать вместе с родителем или опекуном.',
        details: 'Браузер хранит выбор, дату согласия в UTC и отметки об отправке. Сервер хранит только тип события, эту дату, время получения и случайный ID для устранения дублей — не более 90 дней. В события не входят ID аккаунта, почта, запись партии, рекламный ID и URL. Показатели приблизительны и относятся к одному браузеру; устройства не связываются. Провайдеры могут отдельно обрабатывать необходимые журналы соединений и безопасности.',
        withdrawal: 'Выключить можно в настройках в любое время: дальнейшая отправка прекратится, локальное состояние будет удалено. Ранее отправленные анонимные события нельзя выделить и удалить индивидуально; срок их хранения — до 90 дней. Реклама и связанные ограничения остаются выключены.',
    },
    fr: {
        title: 'Statistiques de jeu facultatives',
        choice: 'Désactivées par défaut. Après activation dans les paramètres uniquement, ce navigateur envoie sept étapes : première visite après accord, début et fin du tutoriel, début et fin de la première partie, début de la deuxième et retour le lendemain. Les enfants doivent choisir avec un parent ou responsable.',
        details: 'Le navigateur garde le choix, le jour UTC du consentement et les marqueurs d’envoi. Le serveur ne conserve que le type d’événement, ce jour UTC, l’heure de réception et un ID aléatoire anti-doublon par événement, pendant 90 jours maximum. Aucun ID de compte, courriel, coup, ID publicitaire ou URL n’est transmis. Les taux sont approximatifs, propres au navigateur et non reliés entre appareils. Les hébergeurs peuvent traiter séparément les journaux de connexion et de sécurité nécessaires.',
        withdrawal: 'Désactivez à tout moment dans les paramètres pour arrêter les envois et effacer l’état local. Les événements anonymes déjà envoyés ne peuvent être retrouvés ou supprimés individuellement ; ils expirent sous 90 jours. Publicités et limites liées restent désactivées.',
    },
    de: {
        title: 'Optionale Spielstatistik',
        choice: 'Standardmäßig ausgeschaltet. Erst nach Aktivierung in den Einstellungen sendet dieser Browser sieben Ereignisse: erster Besuch nach Einwilligung, Beginn und Abschluss des Tutorials, Beginn und Ende der ersten Partie, Beginn der zweiten Partie und Rückkehr am Folgetag. Kinder sollten gemeinsam mit Erziehungsberechtigten entscheiden.',
        details: 'Im Browser bleiben Auswahl, UTC-Tag der Einwilligung und Sendemarkierungen. Der Server speichert nur Ereignisart, diesen UTC-Tag, Empfangszeit und eine zufällige Anti-Duplikat-ID pro Ereignis für höchstens 90 Tage. Konto-ID, E-Mail, Partieprotokoll, Werbe-ID und URL werden nicht übermittelt. Die Werte sind ungefähre browserbezogene Angaben ohne Geräteverknüpfung. Hostinganbieter können notwendige Verbindungs- und Sicherheitsprotokolle gesondert verarbeiten.',
        withdrawal: 'In den Einstellungen jederzeit ausschalten: Künftige Übermittlungen stoppen und der lokale Statistikstatus wird gelöscht. Bereits gesendete anonyme Ereignisse lassen sich nicht einzeln zuordnen oder löschen; sie verfallen binnen 90 Tagen. Werbung und zugehörige Spiellimits bleiben aus.',
    },
    es: {
        title: 'Métricas de juego opcionales',
        choice: 'Están desactivadas por defecto. Solo al activarlas en Ajustes, este navegador envía siete eventos: primera visita tras el consentimiento, inicio y finalización del tutorial, inicio y fin de la primera partida, inicio de la segunda y regreso al día siguiente. Los niños deben decidir con un padre o tutor.',
        details: 'El navegador guarda la elección, el día UTC del consentimiento y marcas de envío. El servidor guarda solo el tipo de evento, ese día UTC, la hora de recepción y un ID aleatorio por evento para evitar duplicados, hasta 90 días. No se envían ID de cuenta, correo, jugadas, ID publicitario ni URL. Las tasas son aproximadas, por navegador y sin vincular dispositivos. Los proveedores pueden tratar aparte registros necesarios de conexión y seguridad.',
        withdrawal: 'Puedes desactivarlas en Ajustes cuando quieras. Se detienen nuevos envíos y se borra el estado local. Los eventos anónimos ya enviados no se pueden localizar ni borrar individualmente; caducan en 90 días. La publicidad y los límites ligados a ella siguen desactivados.',
    },
    tr: {
        title: 'İsteğe bağlı oyun ölçümleri',
        choice: 'Varsayılan olarak kapalıdır. Yalnızca Ayarlar’da açılırsa bu tarayıcı yedi olayı gönderir: onaydan sonraki ilk ziyaret, öğreticinin başlangıcı ve tamamlanması, ilk maçın başlangıcı ve bitişi, ikinci maçın başlangıcı ve ertesi gün dönüş. Çocuklar ebeveynleriyle birlikte karar vermelidir.',
        details: 'Tarayıcı seçim, UTC onay günü ve gönderim işaretlerini tutar. Sunucu yalnızca olay türünü, bu UTC gününü, alınma zamanını ve her olay için rastgele tekrar önleme kimliğini en fazla 90 gün saklar. Hesap kimliği, e-posta, maç kaydı, reklam kimliği veya URL gönderilmez. Oranlar tarayıcı bazında yaklaşık değerlerdir; cihazlar bağlanmaz. Barındırma sağlayıcıları gerekli bağlantı ve güvenlik kayıtlarını ayrıca işleyebilir.',
        withdrawal: 'Ayarlar’dan istediğiniz zaman kapatabilirsiniz. Yeni gönderimler durur ve yerel ölçüm durumu silinir. Önceden gönderilen anonim olaylar tek tek bulunup silinemez; 90 gün içinde sona erer. Reklamlar ve ilişkili oyun sınırları kapalı kalır.',
    },
    pl: {
        title: 'Opcjonalne statystyki gry',
        choice: 'Domyślnie są wyłączone. Dopiero po włączeniu w ustawieniach przeglądarka wysyła siedem zdarzeń: pierwszą wizytę po zgodzie, rozpoczęcie i ukończenie samouczka, rozpoczęcie i ukończenie pierwszej partii, rozpoczęcie drugiej oraz powrót następnego dnia. Dzieci powinny wybierać wraz z opiekunem.',
        details: 'Przeglądarka zapisuje wybór, dzień zgody w UTC i znaczniki wysłania. Serwer przechowuje tylko rodzaj zdarzenia, ten dzień UTC, czas odbioru i losowy identyfikator zapobiegający duplikatom na zdarzenie, najwyżej przez 90 dni. Nie wysyłamy ID konta, e-maila, zapisu partii, ID reklamowego ani URL. Wyniki są przybliżone, dotyczą przeglądarki i nie łączą urządzeń. Dostawcy hostingu mogą osobno przetwarzać niezbędne dzienniki połączeń i bezpieczeństwa.',
        withdrawal: 'W ustawieniach można wyłączyć je w każdej chwili. Dalsze wysyłanie ustaje, a stan lokalny jest usuwany. Wysłanych już anonimowych zdarzeń nie da się indywidualnie odnaleźć ani usunąć; wygasają w ciągu 90 dni. Reklamy i związane z nimi limity pozostają wyłączone.',
    },
    hi: {
        title: 'वैकल्पिक खेल आँकड़े',
        choice: 'ये शुरू में बंद रहते हैं। सेटिंग में चालू करने पर ही यह ब्राउज़र सात घटनाएँ भेजता है: सहमति के बाद पहली यात्रा, ट्यूटोरियल की शुरुआत और समाप्ति, पहले मैच की शुरुआत और समाप्ति, दूसरे मैच की शुरुआत और अगले दिन वापसी। बच्चों को अभिभावक के साथ निर्णय लेना चाहिए।',
        details: 'ब्राउज़र आपकी पसंद, सहमति का UTC दिन और भेजे जाने के निशान रखता है। सर्वर सिर्फ घटना का प्रकार, वह UTC दिन, प्राप्ति का समय और हर घटना का अलग यादृच्छिक डुप्लिकेट-रोक ID अधिकतम 90 दिन रखता है। खाता ID, ईमेल, चालों का रिकॉर्ड, विज्ञापन ID या URL नहीं भेजे जाते। आँकड़े ब्राउज़र-आधारित अनुमान हैं; अलग उपकरण नहीं जोड़े जाते। होस्टिंग प्रदाता आवश्यक कनेक्शन और सुरक्षा लॉग अलग से संसाधित कर सकते हैं।',
        withdrawal: 'सेटिंग में कभी भी बंद करें। आगे भेजना बंद होगा और स्थानीय आँकड़ा स्थिति मिटेगी। पहले भेजी गई अनाम घटनाओं को अलग पहचानकर हटाया नहीं जा सकता; वे 90 दिन में समाप्त होंगी। विज्ञापन और उनसे जुड़े खेलने की सीमाएँ बंद रहेंगी।',
    },
    pt: {
        title: 'Métricas opcionais de jogo',
        choice: 'Ficam desligadas por padrão. Só após ativação nas Configurações, este navegador envia sete eventos: primeira visita após o consentimento, início e conclusão do tutorial, início e fim da primeira partida, início da segunda e retorno no dia seguinte. Crianças devem decidir com pai, mãe ou responsável.',
        details: 'O navegador guarda a escolha, o dia UTC do consentimento e marcadores de envio. O servidor conserva apenas o tipo de evento, esse dia UTC, a hora de recebimento e um ID aleatório por evento para evitar duplicatas, por até 90 dias. Não são enviados ID de conta, e-mail, histórico da partida, ID de anúncio ou URL. As taxas são aproximadas, por navegador, sem ligar dispositivos. Provedores podem tratar separadamente logs essenciais de conexão e segurança.',
        withdrawal: 'Desative nas Configurações quando quiser. Isso interrompe novos envios e apaga o estado local. Eventos anônimos já enviados não podem ser localizados ou removidos individualmente; expiram em 90 dias. Anúncios e limites associados continuam desligados.',
    },
    ta: {
        title: 'விருப்ப விளையாட்டு அளவீடுகள்',
        choice: 'இயல்பாக முடக்கப்பட்டிருக்கும். அமைப்புகளில் இயக்கிய பிறகே இந்த உலாவி ஒப்புதலுக்குப் பிந்தைய முதல் வருகை, பயிற்சியின் தொடக்கம் மற்றும் நிறைவு, முதல் ஆட்டத் தொடக்கம் மற்றும் முடிவு, இரண்டாம் ஆட்டத் தொடக்கம், மறுநாள் வருகை ஆகிய ஏழு நிகழ்வுகளை அனுப்பும். குழந்தைகள் பெற்றோர் அல்லது பாதுகாவலருடன் சேர்ந்து முடிவு செய்ய வேண்டும்.',
        details: 'உலாவியில் தேர்வு, ஒப்புக்கொண்ட UTC நாள், அனுப்பிய குறிகள் சேமிக்கப்படும். சேவையகத்தில் நிகழ்வு வகை, அந்த UTC நாள், பெறப்பட்ட நேரம் மற்றும் ஒவ்வொரு நிகழ்வுக்கான சீரற்ற நகல்-தடுப்பு ID மட்டும் அதிகபட்சம் 90 நாட்கள் இருக்கும். கணக்கு ID, மின்னஞ்சல், ஆட்ட நகர்வுகள், விளம்பர ID அல்லது URL அனுப்பப்படாது. விகிதங்கள் உலாவி அளவிலான தோராயமானவை; சாதனங்கள் இணைக்கப்படாது. வழங்குநர்கள் அவசியமான இணைப்பு மற்றும் பாதுகாப்புப் பதிவுகளை தனியாகச் செயலாக்கலாம்.',
        withdrawal: 'அமைப்புகளில் எப்போது வேண்டுமானாலும் முடக்கலாம். புதிய அனுப்புதல் நிற்கும்; உள்ளூர் அளவீட்டு நிலை அழியும். முன்பு அனுப்பிய பெயரறியாத நிகழ்வுகளைத் தனியாகக் கண்டறிந்து நீக்க முடியாது; 90 நாட்களுக்குள் காலாவதியாகும். விளம்பரங்களும் அவற்றுடன் தொடர்பான ஆட்ட வரம்புகளும் முடக்கப்பட்டே இருக்கும்.',
    },
};
