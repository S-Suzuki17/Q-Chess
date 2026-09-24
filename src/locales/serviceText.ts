import type {Language} from './dict';
const messages:Record<Language,readonly [string,string,string,string]>={
    en:['Maintenance: new online games and sign-ins are temporarily paused. Ongoing games and offline practice remain available.','An update is required for online play.','Update','The service is temporarily unavailable. Please try again later.'],
    ja:['メンテナンス中は新規ログイン・オンライン対局を停止します。進行中の対局とオフライン練習は続けられます。','オンライン対局にはアプリの更新が必要です。','更新する','サービスに一時的に接続できません。時間をおいて再試行してください。'],
    zh:['维护期间暂停新登录和新的在线对局。进行中的对局和离线练习仍可继续。','在线对局需要更新。','更新','服务暂时不可用，请稍后重试。'],
    ru:['Во время обслуживания новые входы и сетевые партии приостановлены. Текущие партии и офлайн-тренировки доступны.','Для сетевой игры требуется обновление.','Обновить','Сервис временно недоступен. Повторите попытку позже.'],
    fr:['Maintenance : nouvelles connexions et parties en ligne suspendues. Les parties en cours et l’entraînement hors ligne restent disponibles.','Une mise à jour est requise pour jouer en ligne.','Mettre à jour','Service temporairement indisponible. Réessayez plus tard.'],
    de:['Wartung: Neue Anmeldungen und Online-Partien pausieren. Laufende Partien und Offline-Training bleiben verfügbar.','Für Online-Partien ist ein Update erforderlich.','Aktualisieren','Der Dienst ist vorübergehend nicht verfügbar. Versuche es später erneut.'],
    es:['Mantenimiento: se pausan nuevos accesos y partidas en línea. Las partidas en curso y la práctica sin conexión siguen disponibles.','Se necesita una actualización para jugar en línea.','Actualizar','Servicio no disponible temporalmente. Inténtalo más tarde.'],
    tr:['Bakım: Yeni girişler ve çevrimiçi maçlar duraklatıldı. Devam eden maçlar ve çevrimdışı alıştırma kullanılabilir.','Çevrimiçi oyun için güncelleme gerekli.','Güncelle','Hizmet geçici olarak kullanılamıyor. Daha sonra yeniden deneyin.'],
    pl:['Konserwacja: nowe logowania i mecze online są wstrzymane. Trwające mecze i trening offline są dostępne.','Gra online wymaga aktualizacji.','Aktualizuj','Usługa jest chwilowo niedostępna. Spróbuj później.'],
    hi:['रखरखाव: नए लॉगिन और ऑनलाइन मैच रुके हैं। चल रहे मैच और ऑफ़लाइन अभ्यास उपलब्ध हैं।','ऑनलाइन खेलने के लिए अपडेट ज़रूरी है।','अपडेट करें','सेवा अभी उपलब्ध नहीं है। बाद में फिर कोशिश करें।'],
    pt:['Manutenção: novos acessos e partidas online estão pausados. Partidas em andamento e treino offline continuam disponíveis.','É necessária uma atualização para jogar online.','Atualizar','Serviço temporariamente indisponível. Tente novamente mais tarde.'],
    ta:['பராமரிப்பு: புதிய உள்நுழைவுகளும் இணைய ஆட்டங்களும் நிறுத்தப்பட்டுள்ளன. நடப்பு ஆட்டங்களும் இணையமில்லாப் பயிற்சியும் தொடரும்.','இணைய ஆட்டத்திற்கு புதுப்பிப்பு தேவை.','புதுப்பிக்கவும்','சேவை தற்காலிகமாகக் கிடைக்கவில்லை. பின்னர் மீண்டும் முயலவும்.'],
};
export const serviceText=(lang:Language,key:'maintenance'|'update'|'action'|'unavailable')=>messages[lang][{maintenance:0,update:1,action:2,unavailable:3}[key]];
