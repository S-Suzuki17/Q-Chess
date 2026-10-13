import {hundredMapText} from './hundredMapText';
import type { Language } from './dict';
import {foundersRewardName} from './foundersText';
import { cosmeticLabel } from './cosmeticNames';
import { championshipReward } from '../config/championshipRewards';
import { championshipName } from './championshipText';
export const campaignKeys = ['title','intro','challenge','locked','cleared','rewards','equip','equipped','standard','win','loss','draw','next','retry','back','noHints','quick','local','saveError','champion','round','board','piece','white','black'] as const;
const keys = campaignKeys;
type Key = typeof keys[number];
type TranslatedTuple<T extends readonly unknown[]> = {readonly [K in keyof T]:string};
const copy: Record<Language, TranslatedTuple<typeof keys>> = {
 en:['100-Tile Challenge','Explore 100 castle chambers with QUBE.','Challenge','Locked','Cleared','Collection','Equip','Equipped','Original','Victory','Try again. Your unlocks are safe.','Draw','Next round','Rematch','Back','No hints','At least half your time remaining','Progress is saved on this device. Cosmetics do not affect strength.','Could not save. Keep this page open to retain progress.','Tournament champion','Round','Board','Piece material','White · first','Black · second'],
 ja:['100マスチャレンジ','QUBEと城の100の部屋へ。','挑戦する','未解放','クリア','コレクション','装備する','装備中','オリジナル','勝利','もう一度挑戦。解放済みの報酬は残ります。','引き分け','次のラウンド','再挑戦','戻る','ヒントなし','持ち時間が半分以上残って勝利','進行はこの端末に保存されます。外観で強さは変わりません。','保存できませんでした。進行を保つにはこの画面を閉じないでください。','トーナメント制覇','ラウンド','盤面','駒の材質','白・先手','黒・後手'],
 zh:['100格挑战','与QUBE探索城堡的100个房间。','挑战','未解锁','已通关','收藏','装备','已装备','原版','胜利','再试一次。已解锁奖励会保留。','和棋','下一轮','再次挑战','返回','不使用提示','获胜时至少剩余一半时间','进度保存在此设备。外观不影响实力。','无法保存。请保持此页面打开以保留进度。','锦标赛冠军','轮次','棋盘','棋子材质','白方·先手','黑方·后手'],
 ru:['Испытание из 100 клеток','Исследуйте 100 комнат замка с QUBE.','Вызвать','Закрыто','Пройдено','Коллекция','Выбрать','Выбрано','Оригинал','Победа','Попробуйте снова. Награды сохраняются.','Ничья','Следующий раунд','Реванш','Назад','Без подсказок','Осталось не менее половины времени','Прогресс хранится на устройстве. Облик не влияет на силу.','Не удалось сохранить. Не закрывайте страницу.','Чемпион турнира','Раунд','Доска','Материал фигур','Белые · первый ход','Чёрные · второй ход'],
 fr:['Défi des 100 cases','Explorez 100 salles du château avec QUBE.','Défier','Verrouillé','Terminé','Collection','Équiper','Équipé','Original','Victoire','Réessayez. Vos récompenses restent acquises.','Nulle','Manche suivante','Rejouer','Retour','Sans indice','Au moins la moitié du temps restant','Progression enregistrée sur cet appareil. Les apparences ne changent pas la force.','Échec de sauvegarde. Gardez cette page ouverte.','Champion du tournoi','Manche','Échiquier','Matériau des pièces','Blancs · premier','Noirs · second'],
 de:['100-Felder-Herausforderung','Erkunde 100 Burgkammern mit QUBE.','Herausfordern','Gesperrt','Geschafft','Sammlung','Ausrüsten','Ausgerüstet','Original','Sieg','Versuche es erneut. Freigeschaltete Belohnungen bleiben.','Remis','Nächste Runde','Revanche','Zurück','Ohne Hinweise','Mindestens die Hälfte der Zeit übrig','Fortschritt wird auf diesem Gerät gespeichert. Designs ändern die Stärke nicht.','Speichern fehlgeschlagen. Lass diese Seite geöffnet.','Turniersieger','Runde','Brett','Figurenmaterial','Weiß · erster Zug','Schwarz · zweiter Zug'],
 es:['Desafío de 100 casillas','Explora 100 salas del castillo con QUBE.','Desafiar','Bloqueado','Superado','Colección','Equipar','Equipado','Original','Victoria','Inténtalo de nuevo. Conservas tus recompensas.','Tablas','Siguiente ronda','Revancha','Volver','Sin pistas','Al menos la mitad del tiempo restante','El progreso se guarda en este dispositivo. El aspecto no cambia la fuerza.','No se pudo guardar. Mantén esta página abierta.','Campeón del torneo','Ronda','Tablero','Material de piezas','Blancas · primero','Negras · segundo'],
 tr:['100 Kare Mücadelesi','QUBE ile kalenin 100 odasını keşfet.','Meydan oku','Kilitli','Tamamlandı','Koleksiyon','Kuşan','Kuşanıldı','Orijinal','Zafer','Tekrar dene. Açılan ödüller sende kalır.','Berabere','Sonraki tur','Yeniden oyna','Geri','İpucu olmadan','Sürenin en az yarısı kalsın','İlerleme bu cihazda saklanır. Görünümler gücü değiştirmez.','Kaydedilemedi. Bu sayfayı açık tut.','Turnuva şampiyonu','Tur','Tahta','Taş malzemesi','Beyaz · ilk','Siyah · ikinci'],
 pl:['Wyzwanie 100 pól','Odkryj z QUBE 100 komnat zamku.','Rzuć wyzwanie','Zablokowane','Ukończono','Kolekcja','Załóż','Wybrane','Oryginalny','Zwycięstwo','Spróbuj ponownie. Odblokowane nagrody pozostają.','Remis','Następna runda','Rewanż','Wróć','Bez podpowiedzi','Pozostała co najmniej połowa czasu','Postęp zapisuje się na tym urządzeniu. Wygląd nie zmienia siły.','Nie udało się zapisać. Nie zamykaj tej strony.','Mistrz turnieju','Runda','Szachownica','Materiał figur','Białe · pierwsze','Czarne · drugie'],
 hi:['100 खाने की चुनौती','QUBE के साथ महल के 100 कक्षों की खोज करें।','चुनौती दें','बंद','पूरा','संग्रह','चुनें','चुना हुआ','मूल','जीत','फिर कोशिश करें। खुले पुरस्कार बने रहेंगे।','ड्रॉ','अगला दौर','फिर खेलें','वापस','बिना संकेत','कम से कम आधा समय बाकी हो','प्रगति इस उपकरण पर सहेजी जाती है। रूप से ताकत नहीं बदलती।','सहेज नहीं सके। यह पृष्ठ खुला रखें।','टूर्नामेंट विजेता','दौर','बोर्ड','मोहरे की सामग्री','सफेद · पहले','काला · दूसरे'],
 pt:['Desafio de 100 casas','Explore 100 salas do castelo com QUBE.','Desafiar','Bloqueado','Concluído','Coleção','Equipar','Equipado','Original','Vitória','Tente novamente. Suas recompensas continuam liberadas.','Empate','Próxima rodada','Revanche','Voltar','Sem dicas','Pelo menos metade do tempo restante','O progresso é salvo neste dispositivo. A aparência não muda a força.','Não foi possível salvar. Mantenha esta página aberta.','Campeão do torneio','Rodada','Tabuleiro','Material das peças','Brancas · primeiro','Pretas · segundo'],
 ta:['100 கட்டச் சவால்','QUBE உடன் கோட்டையின் 100 அறைகளை ஆராயுங்கள்.','சவால் விடு','திறக்கப்படவில்லை','முடிந்தது','சேகரிப்பு','பயன்படுத்து','பயன்பாட்டில்','அசல்','வெற்றி','மீண்டும் முயலுங்கள். திறந்த பரிசுகள் உங்களிடமே இருக்கும்.','சமநிலை','அடுத்த சுற்று','மீண்டும் ஆடு','திரும்பு','குறிப்பு இல்லாமல்','குறைந்தது பாதி நேரம் மீதமிருக்க வேண்டும்','முன்னேற்றம் இந்தச் சாதனத்தில் சேமிக்கப்படும். தோற்றம் வலிமையை மாற்றாது.','சேமிக்க முடியவில்லை. இந்தப் பக்கத்தைத் திறந்தே வைத்திருங்கள்.','போட்டி சாம்பியன்','சுற்று','பலகை','காய்களின் பொருள்','வெள்ளை · முதலில்','கருப்பு · அடுத்து'],
};
const profiles: Record<Language, readonly string[]> = {
 en:['A patient opening rival. Learn to narrow possibilities.','Explore 100 castle chambers with QUBE.','A guardian who protects pieces and preserves possibilities.','The final rival. Balanced judgment with deeper search.'],
 ja:['可能性を絞る基礎を試す、入門の相手。','QUBEと城の100の部屋へ。','駒の安全と候補の柔軟性を守る慎重型。','最終ボス。均衡の取れた評価と深い探索。'],
 zh:['入门对手，练习缩小候选范围。','与QUBE探索城堡的100个房间。','重视棋子安全与候选灵活性的守护者。','最终对手：均衡判断与更深搜索。'],
 ru:['Первый соперник: учитесь сужать варианты.','Исследуйте 100 комнат замка с QUBE.','Защищает фигуры и сохраняет варианты.','Финальный соперник: баланс и глубокий поиск.'],
 fr:['Un premier rival pour apprendre à réduire les possibilités.','Explorez 100 salles du château avec QUBE.','Protège les pièces et préserve les possibilités.','Le rival final : équilibre et recherche approfondie.'],
 de:['Der erste Rivale: Möglichkeiten eingrenzen lernen.','Erkunde 100 Burgkammern mit QUBE.','Schützt Figuren und bewahrt Möglichkeiten.','Der letzte Rivale: ausgewogen und tiefer suchend.'],
 es:['El primer rival: aprende a reducir posibilidades.','Explora 100 salas del castillo con QUBE.','Protege las piezas y conserva posibilidades.','Rival final: equilibrio y búsqueda profunda.'],
 tr:['İlk rakip: olasılıkları daraltmayı öğren.','QUBE ile kalenin 100 odasını keşfet.','Taşları korur ve olasılıkları saklar.','Son rakip: dengeli değerlendirme ve derin arama.'],
 pl:['Pierwszy rywal: naucz się zawężać możliwości.','Odkryj z QUBE 100 komnat zamku.','Chroni figury i zachowuje możliwości.','Ostatni rywal: równowaga i głębsze szukanie.'],
 hi:['पहला प्रतिद्वंद्वी: संभावनाएँ सीमित करना सीखें।','QUBE के साथ महल के 100 कक्षों की खोज करें।','मोहरों की सुरक्षा और संभावनाओं को बचाता है।','अंतिम प्रतिद्वंद्वी: संतुलित मूल्यांकन और गहरी खोज।'],
 pt:['Primeiro rival: aprenda a reduzir possibilidades.','Explore 100 salas do castelo com QUBE.','Protege as peças e preserva possibilidades.','Rival final: equilíbrio e busca mais profunda.'],
 ta:['முதல் எதிரி: சாத்தியங்களைக் குறைக்கக் கற்றுக்கொள்ளுங்கள்.','QUBE உடன் கோட்டையின் 100 அறைகளை ஆராயுங்கள்.','காய்களின் பாதுகாப்பையும் சாத்தியங்களையும் காப்பவர்.','இறுதி எதிரி: சமமான மதிப்பீடும் ஆழமான தேடலும்.'],
};
const cosmetics: Record<Language, readonly string[]> = {
 en:['Walnut','Explore 100 castle chambers with QUBE.','Marble','Boxwood','Ebony','Alabaster','Bronze','Silver','Gold','Crystal'],
 ja:['ウォールナット','QUBEと城の100の部屋へ。','大理石','ツゲ','黒檀','アラバスター','ブロンズ','シルバー','ゴールド','クリスタル'],
 zh:['胡桃木','与QUBE探索城堡的100个房间。','大理石','黄杨木','黑檀木','雪花石膏','青铜','白银','黄金','水晶'],
 ru:['Орех','Исследуйте 100 комнат замка с QUBE.','Мрамор','Самшит','Эбен','Алебастр','Бронза','Серебро','Золото','Кристалл'],
 fr:['Noyer','Explorez 100 salles du château avec QUBE.','Marbre','Buis','Ebene','Albatre','Bronze','Argent','Or','Cristal'],
 de:['Walnuss','Erkunde 100 Burgkammern mit QUBE.','Marmor','Buchsbaum','Ebenholz','Alabaster','Bronze','Silber','Gold','Kristall'],
 es:['Nogal','Explora 100 salas del castillo con QUBE.','Marmol','Boj','Ebano','Alabastro','Bronce','Plata','Oro','Cristal'],
 tr:['Ceviz','QUBE ile kalenin 100 odasını keşfet.','Mermer','Simsir','Abanoz','Kaymak Tasi','Bronz','Gumus','Altın','Kristal'],
 pl:['Orzech','Odkryj z QUBE 100 komnat zamku.','Marmur','Bukszpan','Heban','Alabaster','Brąz','Srebro','Złoto','Kryształ'],
 hi:['अखरोट','QUBE के साथ महल के 100 कक्षों की खोज करें।','संगमरमर','बोक्सवुड','आबनूस','एलाबास्टर','पीतल','चांदी','सोना','क्रिस्टल'],
 pt:['Nogueira','Explore 100 salas do castelo com QUBE.','Marmore','Buxo','Ebano','Alabastro','Bronze','Prata','Ouro','Cristal'],
 ta:['வால்நட்','QUBE உடன் கோட்டையின் 100 அறைகளை ஆராயுங்கள்.','பளிங்கு','பாக்ஸ்வுட்','எபனி','அலபாஸ்டர்','வெண்கலம்','வெள்ளி','தங்கம்','படிகம்'],
};
export const campaignText = (lang:Language,key:Key) => key==='title'?hundredMapText(lang,'title'):key==='intro'?hundredMapText(lang,'help'):copy[lang][keys.indexOf(key)];
export const bossDescription = (lang:Language,index:number) => profiles[lang][index];
export const rewardName = (lang:Language,id:string) => {
    const founders=foundersRewardName(lang,id);if(founders)return founders;
    const refIndex=['champion-board-reference-wood','champion-board-reference-neon','iceglass','neonglass'].indexOf(id);
    if(refIndex>=0)return cosmeticLabel(lang,['wood','neon','iceglass','neonglass'][refIndex]);
    const reward=championshipReward(id);
    if(reward) return championshipName(lang,reward);
    if(id==='standard') return campaignText(lang,'standard');
    const alias=id==='slate'?'marble':id==='obsidian'?'ebony':id==='copper'?'bronze':id==='jade'?'crystal':id;
    return cosmetics[lang][['walnut','mahogany','marble','boxwood','ebony','alabaster','bronze','silver','gold','crystal'].indexOf(alias)] ?? campaignText(lang,'standard');
};
export const campaignTranslationCount = (lang:Language) => copy[lang].length;
