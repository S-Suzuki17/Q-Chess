import type { Language } from './dict';
const copy: Record<Language, readonly [string, string, string, string, string, string, string, string]> = {
    ja: ['広告の年齢設定','広告を利用する前に年齢層を選んでください。生年月日は不要です。選択はこの端末に保存されます。','13歳未満','13〜15歳','16〜17歳','18歳以上','続ける','広告を表示せず戻る'],
    en: ['Age range for ads','Choose your age range before using ads. No date of birth is needed. Your choice stays on this device.','Under 13','13–15','16–17','18 or over','Continue','Go back without an ad'],
    zh: ['广告年龄设置','使用广告前请选择年龄段。无需提供出生日期，选择仅保存在此设备上。','未满13岁','13–15岁','16–17岁','18岁及以上','继续','不看广告并返回'],
    ru: ['Возраст для рекламы','Выберите возрастную группу перед просмотром рекламы. Дата рождения не нужна. Выбор хранится только на этом устройстве.','До 13 лет','13–15 лет','16–17 лет','18 лет и старше','Продолжить','Назад без рекламы'],
    fr: ['Âge pour les annonces','Choisissez votre tranche d’âge avant de voir des annonces. Aucune date de naissance n’est demandée. Le choix reste sur cet appareil.','Moins de 13 ans','13–15 ans','16–17 ans','18 ans ou plus','Continuer','Revenir sans annonce'],
    de: ['Alter für Werbung','Wähle vor der Werbung deine Altersgruppe. Ein Geburtsdatum ist nicht nötig. Die Auswahl bleibt auf diesem Gerät.','Unter 13','13–15','16–17','Ab 18','Weiter','Ohne Werbung zurück'],
    es: ['Edad para los anuncios','Elige tu grupo de edad antes de ver anuncios. No necesitas indicar tu fecha de nacimiento. La elección se guarda solo en este dispositivo.','Menos de 13 años','13–15 años','16–17 años','18 años o más','Continuar','Volver sin anuncio'],
    tr: ['Reklamlar için yaş aralığı','Reklamları kullanmadan önce yaş aralığınızı seçin. Doğum tarihi gerekmez. Seçiminiz yalnızca bu cihazda saklanır.','13 yaşından küçük','13–15','16–17','18 ve üzeri','Devam et','Reklam olmadan geri dön'],
    pl: ['Wiek dla reklam','Wybierz grupę wiekową przed oglądaniem reklam. Data urodzenia nie jest potrzebna. Wybór zostaje na tym urządzeniu.','Poniżej 13 lat','13–15 lat','16–17 lat','18 lat lub więcej','Dalej','Wróć bez reklamy'],
    hi: ['विज्ञापनों के लिए आयु वर्ग','विज्ञापन देखने से पहले अपना आयु वर्ग चुनें। जन्मतिथि की ज़रूरत नहीं है। आपका चयन केवल इस डिवाइस पर रहेगा।','13 से कम','13–15','16–17','18 या अधिक','जारी रखें','विज्ञापन के बिना वापस जाएँ'],
    pt: ['Idade para anúncios','Escolha sua faixa etária antes de ver anúncios. Não é necessária a data de nascimento. A escolha fica apenas neste dispositivo.','Menos de 13 anos','13–15 anos','16–17 anos','18 anos ou mais','Continuar','Voltar sem anúncio'],
    ta: ['விளம்பரங்களுக்கான வயது வரம்பு','விளம்பரங்களைப் பார்க்கும் முன் உங்கள் வயது வரம்பைத் தேர்ந்தெடுக்கவும். பிறந்த தேதி தேவையில்லை. தேர்வு இந்தச் சாதனத்தில் மட்டும் சேமிக்கப்படும்.','13 வயதுக்குக் கீழ்','13–15','16–17','18 அல்லது அதற்கு மேல்','தொடரவும்','விளம்பரம் இல்லாமல் திரும்பவும்'],
};
export const adAudienceText = (lang: string) => copy[lang as Language] ?? copy.en;
export const adAudiencePrivacy: Record<Language, string> = {
 ja:'Androidでは広告の初回利用前に年齢層を確認します。生年月日は収集せず、年齢層は端末内だけに保存し、当社サーバーやGoogleへ送信しません。設定から変更できます。すべての年齢層に子ども向け広告設定を適用します。',
 en:'Android asks for an age range before the first ad. No date of birth is collected. The range is stored only on the device, never sent to our server or Google, and can be changed in Settings. Child-protective ad settings apply to every age range.',
 zh:'Android在首次使用广告前询问年龄段。不收集出生日期。年龄段仅存储于设备，不发送至我们的服务器或Google，可在设置中更改。所有年龄段均采用儿童保护广告设置。',
 ru:'Android запрашивает возрастную группу перед первой рекламой. Дата рождения не собирается. Группа хранится только на устройстве, не передаётся нашему серверу или Google и меняется в настройках. Защитные настройки для детей действуют для всех возрастов.',
 fr:'Android demande une tranche d’âge avant la première annonce. Aucune date de naissance n’est recueillie. Le choix reste sur l’appareil, sans envoi à notre serveur ni à Google, et se modifie dans les paramètres. Les protections publicitaires pour enfants s’appliquent à tous les âges.',
 de:'Android fragt vor der ersten Werbung nach der Altersgruppe. Ein Geburtsdatum wird nicht erhoben. Die Gruppe bleibt auf dem Gerät, wird weder an unseren Server noch an Google gesendet und kann in den Einstellungen geändert werden. Kinderschutz-Einstellungen gelten für alle Altersgruppen.',
 es:'Android pide un grupo de edad antes del primer anuncio. No se recoge la fecha de nacimiento. El grupo se guarda solo en el dispositivo, no se envía a nuestro servidor ni a Google y puede cambiarse en Ajustes. La protección publicitaria infantil se aplica a todas las edades.',
 tr:'Android ilk reklamdan önce yaş aralığını sorar. Doğum tarihi toplanmaz. Aralık yalnızca cihazda saklanır, sunucumuza veya Google’a gönderilmez ve Ayarlar’dan değiştirilebilir. Çocukları koruyan reklam ayarları tüm yaşlara uygulanır.',
 pl:'Android pyta o grupę wiekową przed pierwszą reklamą. Data urodzenia nie jest zbierana. Grupa pozostaje na urządzeniu, nie trafia na nasz serwer ani do Google i można ją zmienić w ustawieniach. Ochronne ustawienia reklam dla dzieci dotyczą wszystkich grup.',
 hi:'Android पहले विज्ञापन से पहले आयु वर्ग पूछता है। जन्मतिथि नहीं ली जाती। आयु वर्ग केवल डिवाइस पर रहता है, हमारे सर्वर या Google को नहीं भेजा जाता और सेटिंग में बदला जा सकता है। बच्चों की सुरक्षा वाले विज्ञापन विकल्प हर आयु वर्ग पर लागू होते हैं।',
 pt:'O Android pede a faixa etária antes do primeiro anúncio. Não coleta a data de nascimento. A faixa fica apenas no dispositivo, não é enviada ao nosso servidor nem ao Google e pode ser alterada nas Configurações. As proteções infantis nos anúncios valem para todas as idades.',
 ta:'Android முதல் விளம்பரத்திற்கு முன் வயது வரம்பைக் கேட்கும். பிறந்த தேதி சேகரிக்கப்படாது. வயது வரம்பு சாதனத்தில் மட்டும் சேமிக்கப்படும்; எங்கள் சேவையகத்திற்கோ Google-க்கோ அனுப்பப்படாது. அமைப்புகளில் மாற்றலாம். குழந்தைகளுக்கான பாதுகாப்பு விளம்பர அமைப்புகள் எல்லா வயதினருக்கும் பொருந்தும்.',
};
