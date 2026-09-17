import type { Language } from './dict';
const keys=['loadError','retry','pending','actionError','profileError','signIn','confirmRemove'] as const;
const copy:Record<Language,readonly string[]>={
 en:['Could not refresh friends. Your list has not been deleted.','Try again','Sent requests','The change could not be saved. Please try again.','Some ratings are unavailable.','Sign in to add and manage friends.','Remove this friend?'],
 ja:['フレンドを取得できませんでした。リストは削除されていません。','再読み込み','送信済みの申請','変更を保存できませんでした。もう一度お試しください。','一部のレートを取得できませんでした。','フレンドの登録・管理にはログインが必要です。','このフレンドを削除しますか？'],
 zh:['无法刷新好友，列表未被删除。','重试','已发送请求','无法保存更改，请重试。','部分评分不可用。','登录后可添加和管理好友。','删除此好友？'],
 ru:['Не удалось обновить друзей. Список не удалён.','Повторить','Отправленные запросы','Не удалось сохранить. Попробуйте ещё раз.','Некоторые рейтинги недоступны.','Войдите для управления друзьями.','Удалить этого друга?'],
 fr:['Actualisation impossible. Votre liste n’a pas été supprimée.','Réessayer','Demandes envoyées','Échec de l’enregistrement. Réessayez.','Certains classements sont indisponibles.','Connectez-vous pour gérer vos amis.','Retirer cet ami ?'],
 de:['Freunde konnten nicht geladen werden. Die Liste wurde nicht gelöscht.','Erneut versuchen','Gesendete Anfragen','Änderung konnte nicht gespeichert werden.','Einige Wertungen sind nicht verfügbar.','Melde dich an, um Freunde zu verwalten.','Diesen Freund entfernen?'],
 es:['No se pudo actualizar. Tu lista no se ha borrado.','Reintentar','Solicitudes enviadas','No se pudo guardar. Inténtalo de nuevo.','Algunas puntuaciones no están disponibles.','Inicia sesión para gestionar amigos.','¿Eliminar a este amigo?'],
 tr:['Arkadaşlar yenilenemedi. Liste silinmedi.','Tekrar dene','Gönderilen istekler','Değişiklik kaydedilemedi. Tekrar deneyin.','Bazı puanlar kullanılamıyor.','Arkadaşları yönetmek için giriş yapın.','Bu arkadaş kaldırılsın mı?'],
 pl:['Nie udało się odświeżyć znajomych. Lista nie została usunięta.','Spróbuj ponownie','Wysłane zaproszenia','Nie zapisano zmiany. Spróbuj ponownie.','Niektóre rankingi są niedostępne.','Zaloguj się, aby zarządzać znajomymi.','Usunąć tego znajomego?'],
 hi:['मित्र सूची ताज़ा नहीं हो सकी। सूची हटाई नहीं गई है।','फिर कोशिश करें','भेजे गए अनुरोध','बदलाव सहेजा नहीं जा सका। फिर कोशिश करें।','कुछ रेटिंग उपलब्ध नहीं हैं।','मित्र जोड़ने और प्रबंधित करने के लिए लॉग इन करें।','इस मित्र को हटाएँ?'],
 pt:['Não foi possível atualizar. A lista não foi apagada.','Tentar novamente','Solicitações enviadas','Não foi possível salvar. Tente novamente.','Algumas classificações estão indisponíveis.','Entre para gerenciar amigos.','Remover este amigo?'],
 ta:['நண்பர்களைப் புதுப்பிக்க முடியவில்லை. பட்டியல் நீக்கப்படவில்லை.','மீண்டும் முயலவும்','அனுப்பிய கோரிக்கைகள்','மாற்றத்தைச் சேமிக்க முடியவில்லை. மீண்டும் முயலவும்.','சில மதிப்பீடுகள் கிடைக்கவில்லை.','நண்பர்களை நிர்வகிக்க உள்நுழையவும்.','இந்த நண்பரை நீக்கவா?'],
};
export const friendsText=(lang:Language,key:typeof keys[number])=>copy[lang][keys.indexOf(key)];
