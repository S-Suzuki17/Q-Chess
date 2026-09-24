import type {Language} from './dict';
import {securityPrivacy} from './securityPrivacy';
const revised:Record<Language,readonly string[]>={
  "en": [
    "Google ads: Advertising and ad-based daily limits are disabled in this release. H5 Games Ads is not activated. If ads are enabled later, required consent and child-audience protections must be in place first.",
    "Language, audio, cosmetic choices, game progress and sign-in state may be stored on your device. Clearing browser storage may remove local progress and sign you out.",
    "The replay list is limited to your latest 10 games. Shared records may remain while included in an opponent’s latest 10. Account data, ratings and operational records are separate; request deletion through the contact address below.",
    "The game is intended for an audience that includes children. Children should use it with a parent or guardian. Do not put real names, contact details or sensitive photos in public profiles. Parents and guardians can contact us about data or deletion. Child-privacy requirements must be reviewed before advertising is enabled.",
    "Account information: Sign-in details, user ID, display name and any chosen profile picture are used for accounts and multiplayer features. Your public name, avatar and rating can be visible to other players."
  ],
  "ja": [
    "Google広告: この公開版では広告と広告に連動した1日の回数制限を無効にしています。H5 Games Adsも有効化していません。今後の広告配信前に、必要な同意管理と子どもを含む利用者への保護措置を確認します。",
    "端末には言語、音量、外観の選択、ゲーム進行、ログイン状態などが保存されることがあります。ブラウザーの保存データを消すと、端末内の進行が失われたりログアウトしたりする場合があります。",
    "棋譜一覧は各ユーザーの直近10試合までです。共有棋譜は相手の直近10試合に含まれる間は残る場合があります。アカウント・レート・運用上必要な記録は別管理です。削除の相談は下記の連絡先へお願いします。",
    "本ゲームは子どもを含む利用者を想定しています。お子様は保護者と一緒に利用してください。公開プロフィールに本名、連絡先、プライベートな写真を掲載しないでください。保護者からのデータ確認・削除の相談を受け付けます。広告配信前には子どものプライバシー要件の確認が必要です。",
    "アカウント情報: ログイン情報、ユーザーID、表示名、選択したプロフィール画像はアカウント・対戦機能に使用されます。公開の表示名、アイコン、レートは他のプレイヤーに表示される場合があります。"
  ],
  "zh": [
    "Google广告: 此版本关闭广告及与广告关联的每日次数限制。H5 Games Ads尚未启用。启用前需完成必要的同意管理与儿童保护措施。",
    "设备可能保存语言、音量、外观、进度及登录状态。清除浏览器数据可能丢失本地进度并退出登录。",
    "棋谱列表限每位用户最近10局。共享记录可能保留至不再属于对手最近10局。账户、评分及运营记录另行管理。删除请求请联系下方地址。",
    "游戏面向包含儿童的用户。儿童应与监护人共同使用。勿在公开资料中填写真实姓名、联系方式或私人照片。监护人可咨询数据或申请删除。广告启用前需审查儿童隐私要求。",
    "账户信息: 登录信息、用户ID、显示名及所选头像用于账户和多人游戏。公开名称、头像及评分可能向其他玩家显示。"
  ],
  "ru": [
    "Реклама Google: Реклама и связанные с ней дневные лимиты отключены. H5 Games Ads не активирован. Перед включением нужны меры согласия и защиты детей.",
    "На устройстве могут сохраняться язык, звук, оформление, прогресс и вход. Очистка данных браузера может удалить локальный прогресс и завершить сеанс.",
    "Список повторов ограничен последними 10 партиями пользователя. Общая запись может храниться, пока входит в последние 10 партий соперника. Данные аккаунта, рейтинг и служебные записи хранятся отдельно. По вопросам удаления пишите ниже.",
    "Игра рассчитана в том числе на детей. Детям следует играть с родителем или опекуном. Не публикуйте настоящее имя, контакты и личные фотографии. Родители могут обращаться по вопросам данных и удаления. Перед рекламой требуется проверка защиты детей.",
    "Аккаунт: Данные входа, ID, имя и выбранное фото используются для аккаунта и сетевой игры. Публичные имя, аватар и рейтинг могут видеть другие игроки."
  ],
  "fr": [
    "Publicité Google : Les publicités et limites quotidiennes associées sont désactivées. H5 Games Ads n’est pas activé. Consentement et protection des enfants doivent être vérifiés avant activation.",
    "Langue, son, apparence, progression et connexion peuvent être conservés sur l’appareil. Effacer les données du navigateur peut supprimer la progression locale et déconnecter le compte.",
    "La liste des replays contient vos 10 dernières parties. Un enregistrement partagé peut rester parmi les 10 dernières parties de l’adversaire. Compte, classement et journaux sont gérés séparément. Contactez-nous pour la suppression.",
    "Le public inclut les enfants, qui devraient jouer avec un parent ou responsable. Ne publiez pas de nom réel, coordonnées ou photos privées. Les responsables peuvent demander des informations ou une suppression. Les exigences de protection des enfants doivent être examinées avant la publicité.",
    "Compte : Identifiants de connexion, ID, nom et photo choisie servent aux fonctions de compte et multijoueur. Le nom public, l’avatar et le classement peuvent être visibles par les autres joueurs."
  ],
  "de": [
    "Google-Werbung: Werbung und damit verbundene Tageslimits sind deaktiviert. H5 Games Ads ist nicht aktiviert. Vor Aktivierung sind Einwilligung und Kinderschutz zu prüfen.",
    "Sprache, Ton, Gestaltung, Fortschritt und Anmeldung können lokal gespeichert werden. Das Löschen der Browserdaten kann lokalen Fortschritt entfernen und dich abmelden.",
    "Die Wiederholungsliste enthält deine letzten 10 Partien. Gemeinsame Einträge können bleiben, solange sie zu den letzten 10 Partien des Gegners zählen. Konto, Wertungen und Betriebsdaten werden getrennt verwaltet. Löschanfragen bitte an den Kontakt unten.",
    "Die Zielgruppe umfasst Kinder. Kinder sollten mit Erziehungsberechtigten spielen. Keine echten Namen, Kontaktdaten oder privaten Fotos veröffentlichen. Erziehungsberechtigte können Daten- und Löschanfragen stellen. Kinderschutzanforderungen sind vor Werbung zu prüfen.",
    "Konto: Anmeldedaten, Benutzer-ID, Anzeigename und gewähltes Bild dienen Konto und Mehrspielerfunktionen. Öffentlicher Name, Avatar und Wertung können anderen Spielern angezeigt werden."
  ],
  "es": [
    "Anuncios de Google: La publicidad y los límites diarios asociados están desactivados. H5 Games Ads no está activo. Antes de activarlos deben revisarse el consentimiento y la protección infantil.",
    "El dispositivo puede guardar idioma, audio, apariencia, progreso y sesión. Borrar datos del navegador puede eliminar el progreso local y cerrar la sesión.",
    "La lista de repeticiones se limita a tus últimas 10 partidas. Un registro compartido puede permanecer entre las últimas 10 del rival. Cuenta, puntuación y registros operativos se gestionan aparte. Solicita eliminaciones al contacto inferior.",
    "El público incluye niños, que deben jugar con un padre o tutor. No publiques nombres reales, contactos ni fotos privadas. Los tutores pueden consultar datos o solicitar su eliminación. Deben revisarse las normas de privacidad infantil antes de activar publicidad.",
    "Cuenta: Los datos de acceso, ID, nombre e imagen elegida se usan para cuenta y multijugador. Otros jugadores pueden ver tu nombre público, avatar y puntuación."
  ],
  "tr": [
    "Google reklamları: Reklamlar ve ilgili günlük sınırlar kapalıdır. H5 Games Ads etkin değildir. Açılmadan önce onay ve çocuk koruma gereksinimleri incelenmelidir.",
    "Dil, ses, görünüm, ilerleme ve oturum cihazda saklanabilir. Tarayıcı verilerini temizlemek yerel ilerlemeyi silebilir ve oturumu kapatabilir.",
    "Tekrar listesi son 10 maçınızla sınırlıdır. Ortak kayıt rakibin son 10 maçında kaldığı sürece tutulabilir. Hesap, puan ve işletim kayıtları ayrıdır. Silme için aşağıdaki adrese başvurun.",
    "Oyun çocukları da kapsar. Çocuklar ebeveyn veya vasiyle kullanmalıdır. Gerçek ad, iletişim bilgileri veya özel fotoğraflar paylaşmayın. Vasiler veri ve silme taleplerinde bulunabilir. Reklamdan önce çocuk gizliliği incelenmelidir.",
    "Hesap: Giriş bilgileri, kullanıcı kimliği, görünen ad ve seçilen resim hesap ve çok oyunculu özelliklerde kullanılır. Herkese açık ad, avatar ve puan diğer oyunculara gösterilebilir."
  ],
  "pl": [
    "Reklamy Google: Reklamy i powiązane limity dzienne są wyłączone. H5 Games Ads nie jest aktywne. Przed włączeniem wymagane są kontrola zgód i ochrona dzieci.",
    "Urządzenie może przechowywać język, dźwięk, wygląd, postęp i sesję. Usunięcie danych przeglądarki może skasować lokalny postęp i wylogować użytkownika.",
    "Lista powtórek obejmuje twoje ostatnie 10 partii. Wspólny zapis może pozostać w ostatnich 10 partiach rywala. Konto, ranking i dane operacyjne są zarządzane oddzielnie. Prośby o usunięcie kieruj na adres poniżej.",
    "Gra jest przeznaczona również dla dzieci. Powinny korzystać z niej z rodzicem lub opiekunem. Nie publikuj prawdziwych nazwisk, kontaktów ani prywatnych zdjęć. Opiekun może pytać o dane i ich usunięcie. Przed reklamami należy sprawdzić ochronę dzieci.",
    "Konto: Dane logowania, ID, nazwa i wybrany obraz służą kontu i grze sieciowej. Publiczna nazwa, awatar i ranking mogą być widoczne dla innych graczy."
  ],
  "hi": [
    "Google विज्ञापन: विज्ञापन और उनसे जुड़ी दैनिक सीमाएँ बंद हैं। H5 Games Ads सक्रिय नहीं है। सक्रिय करने से पहले सहमति और बाल-सुरक्षा की जाँच ज़रूरी है।",
    "भाषा, ध्वनि, रूप, प्रगति और साइन-इन स्थिति उपकरण पर रखी जा सकती है। ब्राउज़र डेटा मिटाने से स्थानीय प्रगति मिट सकती है और साइन आउट हो सकता है।",
    "रीप्ले सूची आपकी पिछली 10 बाज़ियों तक सीमित है। साझा रिकॉर्ड विरोधी की पिछली 10 बाज़ियों में रहने तक रह सकता है। खाता, रेटिंग और संचालन रिकॉर्ड अलग हैं। हटाने के लिए नीचे संपर्क करें।",
    "खेल के उपयोगकर्ताओं में बच्चे भी शामिल हैं। बच्चे अभिभावक के साथ खेलें। सार्वजनिक प्रोफ़ाइल में असली नाम, संपर्क या निजी तस्वीरें न डालें। अभिभावक डेटा या हटाने के बारे में संपर्क कर सकते हैं। विज्ञापन से पहले बाल-गोपनीयता की जाँच आवश्यक है।",
    "खाता: साइन-इन विवरण, उपयोगकर्ता ID, नाम और चुनी तस्वीर खाता और मल्टीप्लेयर में उपयोग होते हैं। सार्वजनिक नाम, अवतार और रेटिंग अन्य खिलाड़ियों को दिख सकते हैं।"
  ],
  "pt": [
    "Anúncios Google: Publicidade e limites diários associados estão desativados. H5 Games Ads não está ativo. Antes da ativação, é preciso revisar consentimento e proteção infantil.",
    "Idioma, som, aparência, progresso e sessão podem ser armazenados no dispositivo. Limpar os dados do navegador pode apagar o progresso local e encerrar a sessão.",
    "A lista de replays limita-se às suas últimas 10 partidas. Um registro compartilhado pode permanecer nas últimas 10 do oponente. Conta, pontuações e registros operacionais são geridos separadamente. Peça exclusão pelo contato abaixo.",
    "O público inclui crianças, que devem jogar com um responsável. Não publique nomes reais, contatos ou fotos privadas. Responsáveis podem consultar dados e solicitar exclusão. A privacidade infantil deve ser revisada antes de ativar anúncios.",
    "Conta: Dados de acesso, ID, nome e imagem escolhida são usados para conta e multijogador. Outros jogadores podem ver seu nome público, avatar e pontuação."
  ],
  "ta": [
    "Google விளம்பரங்கள்: விளம்பரங்களும் அவற்றுடன் தொடர்புடைய தினசரி வரம்புகளும் முடக்கப்பட்டுள்ளன. H5 Games Ads செயல்படவில்லை. இயக்குவதற்கு முன் ஒப்புதல் மற்றும் குழந்தைப் பாதுகாப்பு சரிபார்க்கப்பட வேண்டும்.",
    "மொழி, ஒலி, தோற்றம், முன்னேற்றம் மற்றும் உள்நுழைவு சாதனத்தில் சேமிக்கப்படலாம். உலாவித் தரவை நீக்கினால் உள்ளூர் முன்னேற்றம் அழியலாம்; வெளியேறலாம்.",
    "மீள்பதிவு பட்டியல் உங்கள் சமீபத்திய 10 ஆட்டங்கள் வரை மட்டுமே. எதிரியின் கடைசி 10 ஆட்டங்களில் இருக்கும் பகிர்ந்த பதிவு நீடிக்கலாம். கணக்கு, மதிப்பீடு மற்றும் இயக்கப் பதிவுகள் தனியாக நிர்வகிக்கப்படுகின்றன. நீக்கத்திற்கு கீழே தொடர்பு கொள்ளவும்.",
    "குழந்தைகளும் விளையாட்டின் பயனர்கள். குழந்தைகள் பெற்றோர் அல்லது பாதுகாவலருடன் பயன்படுத்த வேண்டும். உண்மைப் பெயர், தொடர்பு விவரம் அல்லது தனிப்பட்ட படங்களைப் பொதுவில் பகிர வேண்டாம். பாதுகாவலர் தரவு அல்லது நீக்கம் பற்றித் தொடர்புகொள்ளலாம். விளம்பரத்திற்கு முன் குழந்தைத் தனியுரிமை ஆய்வு தேவை.",
    "கணக்கு: உள்நுழைவு விவரங்கள், பயனர் ID, பெயர் மற்றும் தேர்ந்தெடுத்த படம் கணக்கு மற்றும் பலர் ஆட்டத்திற்குப் பயன்படும். பொதுப் பெயர், படம் மற்றும் மதிப்பீடு பிறருக்குக் காட்டப்படலாம்."
  ]
};
const collection:Record<Language,string>={
    en:'Optional web analytics and performance tracking are disabled. Hosting and authentication providers may process essential connection and security logs to operate and protect the service. Passwords and access tokens must not be included in diagnostic reports.',
    ja:'任意のアクセス解析・パフォーマンス追跡は停止しています。ホスティング・認証事業者はサービスの運用と保護のため、必要な接続・セキュリティログを処理する場合があります。診断の報告にパスワードやアクセストークンを含めないでください。',
    zh:'可选网站分析和性能跟踪已停用。托管与认证服务商可能为运行及保护服务处理必要的连接和安全日志。诊断报告中请勿包含密码或访问令牌。',
    ru:'Необязательная веб-аналитика и отслеживание производительности отключены. Хостинг и провайдеры входа могут обрабатывать необходимые журналы соединений и безопасности. Не включайте пароли и токены доступа в отчёты.',
    fr:'Les analyses web et le suivi de performance facultatifs sont désactivés. Hébergeurs et fournisseurs d’authentification peuvent traiter les journaux de connexion et de sécurité nécessaires. N’incluez aucun mot de passe ni jeton dans les rapports.',
    de:'Optionale Webanalyse und Leistungsüberwachung sind deaktiviert. Hosting- und Anmeldeanbieter können erforderliche Verbindungs- und Sicherheitsprotokolle verarbeiten. Keine Passwörter oder Zugriffstoken in Diagnoseberichte aufnehmen.',
    es:'El análisis web y el seguimiento de rendimiento opcionales están desactivados. Los proveedores de alojamiento y autenticación pueden procesar registros esenciales de conexión y seguridad. No incluyas contraseñas ni tokens en informes.',
    tr:'İsteğe bağlı web analizi ve performans takibi kapalıdır. Barındırma ve kimlik doğrulama sağlayıcıları gerekli bağlantı ve güvenlik kayıtlarını işleyebilir. Raporlara parola veya erişim belirteci eklemeyin.',
    pl:'Opcjonalna analityka internetowa i śledzenie wydajności są wyłączone. Dostawcy hostingu i logowania mogą przetwarzać niezbędne dzienniki połączeń i bezpieczeństwa. Nie umieszczaj haseł ani tokenów w raportach.',
    hi:'वैकल्पिक वेब विश्लेषण और प्रदर्शन ट्रैकिंग बंद हैं। होस्टिंग और लॉगिन प्रदाता आवश्यक कनेक्शन और सुरक्षा लॉग संसाधित कर सकते हैं। रिपोर्ट में पासवर्ड या एक्सेस टोकन शामिल न करें।',
    pt:'A análise web e o rastreamento de desempenho opcionais estão desativados. Provedores de hospedagem e autenticação podem processar registros essenciais de conexão e segurança. Não inclua senhas ou tokens em relatórios.',
    ta:'விருப்ப இணையப் பகுப்பாய்வும் செயல்திறன் கண்காணிப்பும் முடக்கப்பட்டுள்ளன. சேவையை இயக்கவும் பாதுகாக்கவும் வழங்குநர்கள் தேவையான இணைப்பு மற்றும் பாதுகாப்புப் பதிவுகளைச் செயலாக்கலாம். அறிக்கைகளில் கடவுச்சொல் அல்லது அணுகல் டோக்கனைச் சேர்க்க வேண்டாம்.',
};
export function privacyReview(lang:Language){const p=revised[lang];return {updated:'2026-09-25',sec3li1:p[0],sec4p:p[1],sec5p:p[2],sec6p:p[3],sec2li1:p[4],sec2li3:`${collection[lang]} ${securityPrivacy[lang]}`};}
