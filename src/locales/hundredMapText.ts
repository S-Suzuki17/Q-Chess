import type {Language} from './dict';

const keys=['title','next','travel','skip','current','selected','overview','tile','goal','help','complete','start'] as const;
const rows:Record<Language,readonly string[]>={
 ja:['100マスチャレンジ','次のマスへ','次のマスへ移動中','演出をスキップ','現在地','選択中','100マス全体','マス','ゴール','100マスを一つずつクリアしよう。勝利を保存すると次のマスが開きます。','100マス完走！','すぐ開始'],
 en:['100-Tile Challenge','Next tile','Moving to the next tile','Skip animation','Current position','Selected','All 100 tiles','Tile','Goal','Clear the 100 tiles one at a time. A saved victory unlocks the next tile. ','All 100 tiles cleared!','Start now'],
 zh:['100格挑战','前往下一格','正在移至下一格','跳过动画','当前位置','已选择','全部100格','格','终点','逐格完成100格挑战。保存胜利后解锁下一格。','100格全部完成！','立即开始'],
 ru:['Испытание из 100 клеток','Следующая клетка','Переход к следующей клетке','Пропустить анимацию','Текущая позиция','Выбрано','Все 100 клеток','Клетка','Финиш','Пройдите 100 клеток по очереди. Сохранённая победа открывает следующую. ','Все 100 клеток пройдены!','Начать сейчас'],
 fr:['Défi des 100 cases','Case suivante','Vers la case suivante','Passer l’animation','Position actuelle','Sélection','Les 100 cases','Case','Arrivée','Terminez les 100 cases une à une. Une victoire enregistrée débloque la suivante. ','Les 100 cases sont terminées !','Commencer'],
 de:['100-Felder-Herausforderung','Nächstes Feld','Zum nächsten Feld','Animation überspringen','Aktuelle Position','Ausgewählt','Alle 100 Felder','Feld','Ziel','Schließe die 100 Felder nacheinander ab. Ein gespeicherter Sieg öffnet das nächste Feld. ','Alle 100 Felder geschafft!','Jetzt starten'],
 es:['Desafío de 100 casillas','Siguiente casilla','Hacia la siguiente casilla','Omitir animación','Posición actual','Selección','Las 100 casillas','Casilla','Meta','Supera las 100 casillas una a una. Una victoria guardada desbloquea la siguiente. ','¡100 casillas completadas!','Comenzar'],
 tr:['100 Kare Mücadelesi','Sonraki kare','Sonraki kareye ilerleniyor','Animasyonu atla','Mevcut konum','Seçili','100 karenin tamamı','Kare','Bitiş','100 kareyi sırayla tamamla. Kaydedilen galibiyet sonraki kareyi açar. ','100 kare tamamlandı!','Şimdi başla'],
 pl:['Wyzwanie 100 pól','Następne pole','Przejście do następnego pola','Pomiń animację','Obecna pozycja','Wybrane','Wszystkie 100 pól','Pole','Meta','Ukończ 100 pól po kolei. Zapisana wygrana odblokowuje następne pole. ','Wszystkie 100 pól ukończone!','Zacznij teraz'],
 hi:['100 खाने की चुनौती','अगला खाना','अगले खाने की ओर','एनिमेशन छोड़ें','वर्तमान स्थान','चुना हुआ','सभी 100 खाने','खाना','लक्ष्य','100 खाने एक-एक करके पूरे करें। सहेजी गई जीत अगला खाना खोलती है। ','सभी 100 खाने पूरे!','अभी शुरू करें'],
 pt:['Desafio de 100 casas','Próxima casa','Indo para a próxima casa','Pular animação','Posição atual','Selecionada','Todas as 100 casas','Casa','Meta','Complete as 100 casas uma a uma. Uma vitória salva libera a próxima casa. ','Todas as 100 casas concluídas!','Começar agora'],
 ta:['100 கட்டச் சவால்','அடுத்த கட்டம்','அடுத்த கட்டத்திற்குச் செல்கிறது','அசைவைக் கடந்து செல்','தற்போதைய இடம்','தேர்வு','100 கட்டங்களும்','கட்டம்','இலக்கு','100 கட்டங்களை ஒவ்வொன்றாக முடிக்கவும். சேமித்த வெற்றி அடுத்த கட்டத்தைத் திறக்கும். ','100 கட்டங்களும் முடிந்தன!','இப்போது தொடங்கு'],
};
export const hundredMapText=(lang:Language,key:typeof keys[number])=>rows[lang][keys.indexOf(key)];
