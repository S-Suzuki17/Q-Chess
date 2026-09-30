'use client';

import { useEffect, useState } from 'react';
import type { Language } from '../locales/dict';
import {
    METRICS_CONSENT_EVENT, metricsConsentGranted, metricsWithdrawalIncomplete,
    optionalMetricsAvailable, setMetricsConsent,
} from '../lib/engagementMetrics';

const copy: Record<Language, { title: string; detail: string; guardian: string; toggle: string; privacy: string; storageError: string }> = {
    ja: { title: '任意の利用状況計測', detail: 'チュートリアル・初対局・再対局・翌日の再訪を匿名の件数で測ります。初期設定はオフで、いつでも停止できます。', guardian: '子どもは保護者と一緒に選んでください。', toggle: '匿名の利用状況計測を許可する', privacy: 'プライバシーポリシーで詳細を確認', storageError: 'ブラウザーの保存状態を更新できませんでした。このタブでは送信を停止しています。確実に停止するには、このサイトのブラウザーデータを削除してください。' },
    en: { title: 'Optional usage measurement', detail: 'Count tutorials, first games, second matches and next-day returns anonymously. Off by default; you can stop it anytime.', guardian: 'Children should decide with a parent or guardian.', toggle: 'Allow anonymous usage measurement', privacy: 'Read the Privacy Policy', storageError: 'Could not update browser storage. Sending is stopped in this tab. To ensure it stays off, clear this site’s browser data.' },
    zh: { title: '可选使用情况统计', detail: '匿名统计教程、首局、再次对局和次日回访。默认关闭，可随时停止。', guardian: '儿童应与家长或监护人一起决定。', toggle: '允许匿名使用情况统计', privacy: '阅读隐私政策', storageError: '无法更新浏览器存储。本标签页已停止发送。为确保持续关闭，请清除此网站的浏览器数据。' },
    ru: { title: 'Необязательная статистика', detail: 'Анонимный подсчёт обучения, первой и повторной игры и возврата на следующий день. По умолчанию выключено; можно отключить в любой момент.', guardian: 'Детям следует решать вместе с родителем или опекуном.', toggle: 'Разрешить анонимную статистику', privacy: 'Прочитать Политику конфиденциальности', storageError: 'Не удалось обновить хранилище браузера. В этой вкладке отправка остановлена. Чтобы она не возобновилась, очистите данные этого сайта.' },
    fr: { title: 'Mesure facultative', detail: 'Comptage anonyme du tutoriel, de la première partie, d’une autre partie et du retour le lendemain. Désactivé par défaut et révocable à tout moment.', guardian: 'Les enfants doivent choisir avec un parent ou tuteur.', toggle: 'Autoriser la mesure anonyme', privacy: 'Lire la politique de confidentialité', storageError: 'Le stockage du navigateur n’a pas pu être mis à jour. L’envoi est arrêté dans cet onglet. Pour éviter sa reprise, effacez les données de ce site.' },
    de: { title: 'Freiwillige Nutzungsstatistik', detail: 'Anonyme Zählung des Tutorials, der ersten und weiteren Partie sowie der Rückkehr am nächsten Tag. Standardmäßig aus; jederzeit abschaltbar.', guardian: 'Kinder sollten gemeinsam mit Eltern oder Erziehungsberechtigten entscheiden.', toggle: 'Anonyme Nutzungsstatistik erlauben', privacy: 'Datenschutzerklärung lesen', storageError: 'Der Browserspeicher konnte nicht aktualisiert werden. In diesem Tab wird nichts mehr gesendet. Löschen Sie die Daten dieser Website, damit dies so bleibt.' },
    es: { title: 'Medición opcional', detail: 'Cuenta anónimamente el tutorial, la primera partida, otra partida y el regreso al día siguiente. Desactivada por defecto; puedes detenerla cuando quieras.', guardian: 'Los menores deben decidirlo con su padre, madre o tutor.', toggle: 'Permitir la medición anónima', privacy: 'Leer la Política de privacidad', storageError: 'No se pudo actualizar el almacenamiento del navegador. Esta pestaña ha dejado de enviar datos. Para evitar que se reanude, borra los datos de este sitio.' },
    tr: { title: 'İsteğe bağlı kullanım ölçümü', detail: 'Eğitimi, ilk ve sonraki oyunu ve ertesi gün dönüşü anonim olarak sayar. Varsayılan olarak kapalıdır; istediğiniz zaman durdurabilirsiniz.', guardian: 'Çocuklar ebeveynleri veya vasileriyle birlikte karar vermelidir.', toggle: 'Anonim kullanım ölçümüne izin ver', privacy: 'Gizlilik Politikasını oku', storageError: 'Tarayıcı depolaması güncellenemedi. Bu sekmede gönderim durdu. Kapalı kalmasını sağlamak için bu sitenin tarayıcı verilerini silin.' },
    pl: { title: 'Opcjonalny pomiar korzystania', detail: 'Anonimowo zlicza samouczek, pierwszą i kolejną grę oraz powrót następnego dnia. Domyślnie wyłączony; można go zawsze wyłączyć.', guardian: 'Dzieci powinny zdecydować razem z rodzicem lub opiekunem.', toggle: 'Zezwól na anonimowy pomiar', privacy: 'Przeczytaj Politykę prywatności', storageError: 'Nie udało się zaktualizować danych przeglądarki. W tej karcie wysyłanie zatrzymano. Aby nie wznowiło się, usuń dane tej witryny.' },
    hi: { title: 'वैकल्पिक उपयोग मापन', detail: 'ट्यूटोरियल, पहला खेल, दोबारा खेलना और अगले दिन वापसी की गुमनाम गिनती। शुरू में बंद है; कभी भी बंद कर सकते हैं।', guardian: 'बच्चे माता-पिता या अभिभावक के साथ मिलकर चुनें।', toggle: 'गुमनाम उपयोग मापन की अनुमति दें', privacy: 'गोपनीयता नीति पढ़ें', storageError: 'ब्राउज़र संग्रहण अपडेट नहीं हो सका। इस टैब में भेजना बंद है। इसे बंद रखने के लिए इस साइट का ब्राउज़र डेटा मिटाएँ।' },
    pt: { title: 'Medição opcional de uso', detail: 'Conta anonimamente o tutorial, a primeira partida, outra partida e o retorno no dia seguinte. Desativada por padrão; pode parar a qualquer momento.', guardian: 'Crianças devem decidir com um responsável.', toggle: 'Permitir medição anônima de uso', privacy: 'Ler a Política de Privacidade', storageError: 'Não foi possível atualizar o armazenamento do navegador. O envio parou nesta aba. Para garantir que continue parado, apague os dados deste site.' },
    ta: { title: 'விருப்பமான பயன்பாட்டு அளவீடு', detail: 'பயிற்சி, முதல் ஆட்டம், அடுத்த ஆட்டம், மறுநாள் வருகை ஆகியவற்றை பெயரில்லாமல் எண்ணும். இயல்பாக அணைக்கப்பட்டுள்ளது; எப்போது வேண்டுமானாலும் நிறுத்தலாம்.', guardian: 'குழந்தைகள் பெற்றோர் அல்லது பாதுகாவலருடன் சேர்ந்து தேர்வு செய்ய வேண்டும்.', toggle: 'பெயரில்லா பயன்பாட்டு அளவீட்டை அனுமதி', privacy: 'தனியுரிமைக் கொள்கையைப் படிக்கவும்', storageError: 'உலாவிச் சேமிப்பகத்தைப் புதுப்பிக்க முடியவில்லை. இந்தத் தாவலில் அனுப்புதல் நிறுத்தப்பட்டது. அது நிறுத்தப்பட்டே இருக்க, இந்தத் தளத்தின் உலாவித் தரவை அழிக்கவும்.' },
};

export function OptionalMetricsSettings({ lang }: { lang: Language }) {
    const [available, setAvailable] = useState(false);
    const [granted, setGranted] = useState(false);
    const [storageError, setStorageError] = useState(false);
    useEffect(() => {
        const sync = () => {
            setAvailable(optionalMetricsAvailable());
            setGranted(metricsConsentGranted());
            setStorageError(metricsWithdrawalIncomplete());
        };
        sync();
        window.addEventListener('storage', sync);
        window.addEventListener(METRICS_CONSENT_EVENT, sync);
        return () => { window.removeEventListener('storage', sync); window.removeEventListener(METRICS_CONSENT_EVENT, sync); };
    }, []);
    if (!available) return null;
    const text = copy[lang] ?? copy.en;
    return <section className="mt-4 space-y-2 border-t border-[#4A4238] pt-4" aria-labelledby="optional-metrics-title">
        <h3 id="optional-metrics-title" className="text-sm font-semibold text-[#E8E2D7]">{text.title}</h3>
        <p id="optional-metrics-detail" className="text-xs leading-relaxed text-[#A89C86]">{text.detail} {text.guardian}</p>
        <a href="/privacy/" target="_blank" rel="noopener noreferrer" className="inline-block text-xs text-[#D4B872] underline underline-offset-4">{text.privacy} ↗</a>
        <label className="flex min-h-11 items-center gap-3 text-sm text-[#E8E2D7]">
            <input type="checkbox" checked={granted} aria-describedby="optional-metrics-detail"
                onChange={event => {
                    const saved = setMetricsConsent(event.target.checked);
                    setGranted(metricsConsentGranted());
                    setStorageError(!saved || metricsWithdrawalIncomplete());
                }} />
            <span>{text.toggle}</span>
        </label>
        {storageError && <p role="alert" className="text-xs leading-relaxed text-[#F3B0A9]">{text.storageError}</p>}
    </section>;
}
