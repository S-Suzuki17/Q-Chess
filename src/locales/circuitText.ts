import type { Language } from './dict';
const keys=['music','midnight','coronation','astral','preview','close','previewOnly','timeLeft','musicHelp','zenith','valkyrie'] as const;
const copy:Record<Language,readonly [string,string,string,string,string,string,string,string,string,string,string]>={
 en:['Battle music','Midnight Gambit','Coronation','Astral Crown','Preview','Close','Preview only · Your equipped rewards are unchanged.','Time remaining','Unlock a track, then equip it to hear it in your matches.','Zenith','Valkyrie'],
 ja:['対局BGM','ミッドナイト・ギャンビット','コロネーション','アストラル・クラウン','プレビュー','閉じる','プレビュー中 · 装備は変更されません。','残り時間','解放後に装備すると対局中に再生されます。','ゼニス','ヴァルキリー'],
 zh:['对局音乐','午夜弃兵','加冕','星辰之冠','预览','关闭','仅预览 · 不会更改已装备的奖励。','剩余时间','解锁并装备音乐后，将在对局中播放。','天顶','瓦尔基里'],
 ru:['Музыка партии','Полночный гамбит','Коронация','Звёздная корона','Просмотр','Закрыть','Только просмотр · Выбранные награды не изменятся.','Оставшееся время','Откройте и выберите мелодию, чтобы слушать её в партиях.','Зенит','Валькирия'],
 fr:['Musique de partie','Gambit de minuit','Couronnement','Couronne astrale','Aperçu','Fermer','Aperçu uniquement · Vos récompenses équipées restent inchangées.','Temps restant','Déverrouillez puis équipez une piste pour vos parties.','Zenith','Valkyrie'],
 de:['Partiemusik','Mitternachtsgambit','Krönung','Astralkrone','Vorschau','Schließen','Nur Vorschau · Deine Ausrüstung bleibt unverändert.','Verbleibende Zeit','Schalte einen Titel frei und wähle ihn für deine Partien.','Zenit','Walküre'],
 es:['Música de partida','Gambito de medianoche','Coronación','Corona astral','Vista previa','Cerrar','Solo vista previa · Tu equipamiento no cambia.','Tiempo restante','Desbloquea y equipa una pista para escucharla en tus partidas.','Cenit','Valquiria'],
 tr:['Maç müziği','Gece yarısı gambiti','Taç giyme','Yıldız tacı','Önizle','Kapat','Yalnızca önizleme · Kuşandığın ödüller değişmez.','Kalan süre','Parçayı açıp kuşandıktan sonra maçlarda dinleyebilirsin.','Zenit','Valkür'],
 pl:['Muzyka partii','Gambit o północy','Koronacja','Gwiezdna korona','Podgląd','Zamknij','Tylko podgląd · Wyposażenie nie zmienia się.','Pozostały czas','Odblokuj i wybierz utwór, aby słuchać go podczas partii.','Zenit','Walkiria'],
 hi:['बाज़ी का संगीत','मध्यरात्रि गैम्बिट','राज्याभिषेक','तारों का मुकुट','पूर्वावलोकन','बंद करें','केवल पूर्वावलोकन · चुने हुए पुरस्कार नहीं बदलेंगे।','बचा समय','संगीत खोलकर चुनें, फिर बाज़ी में सुनें।','जेनिथ','वाल्किरी'],
 pt:['Música da partida','Gambito da meia-noite','Coroação','Coroa astral','Prévia','Fechar','Apenas prévia · Seus itens equipados não mudam.','Tempo restante','Desbloqueie e equipe uma faixa para ouvi-la nas partidas.','Zênite','Valquíria'],
 ta:['ஆட்ட இசை','நள்ளிரவு கேம்பிட்','முடிசூட்டு','விண்மீன் மகுடம்','முன்னோட்டம்','மூடு','முன்னோட்டம் மட்டும் · தேர்ந்தெடுத்த பரிசுகள் மாறாது.','மீதமுள்ள நேரம்','இசையைத் திறந்து தேர்ந்தெடுத்த பிறகு ஆட்டத்தில் கேட்கலாம்.','ஜெனித்','வால்கெய்ரி'],
};
export const circuitText=(lang:Language,key:typeof keys[number])=>copy[lang][keys.indexOf(key)];
