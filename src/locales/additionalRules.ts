import { additional } from './additional';
import { additionalTutorial } from './additionalTutorial';

const extra = {
    tr: ['Kimlikler başlangıçta gizlidir','Kimliği ortaya çıkarma','Kazanma ve strateji','Şahınızı gizleyin','Taş alma ve terfi','Oyun hakkında','Bu hareketi yapamayan kimlikler kalıcı olarak elenir.','Şahınızı erken açığa çıkarmayın. Diğer taşlarla şah gibi oynayarak rakibi yanıltabilirsiniz.','Kendi şahınızı korurken rakibin şahını bulmaya çalışın.','İnsanlara veya bilgisayara karşı mantık ve blöf becerilerinizi deneyin.','Hata bildirimi ve sorular için GitHub sayfamıza bakın.'],
    pl: ['Tożsamości są początkowo ukryte','Ujawnianie tożsamości','Zwycięstwo i strategia','Ukryj swojego króla','Bicie i promocja','O grze','Tożsamości niezdolne do tego ruchu są trwale wykluczane.','Nie ujawniaj króla za wcześnie. Możesz blefować, poruszając inną figurą jak królem.','Chroń swojego króla, szukając króla przeciwnika.','Sprawdź dedukcję i blef przeciw komputerowi lub innym graczom.','Błędy i pytania zgłaszaj na naszej stronie GitHub.'],
    pt: ['As identidades começam ocultas','Revelando a identidade','Vitória e estratégia','Esconda seu rei','Captura e promoção','Sobre o jogo','Identidades incapazes de realizar o lance são eliminadas permanentemente.','Não revele seu rei cedo. Você pode blefar movendo outra peça como se fosse o rei.','Proteja seu rei enquanto procura o rei adversário.','Teste lógica e blefe contra o computador ou outros jogadores.','Para relatar erros ou fazer perguntas, visite nosso GitHub.'],
    hi: ['पहचान शुरू में छिपी होती है','पहचान प्रकट करना','जीत और रणनीति','अपने राजा को छिपाएँ','मारना और पदोन्नयन','खेल के बारे में','जो पहचान यह चाल नहीं चल सकती, वह स्थायी रूप से हट जाती है।','राजा को जल्दी उजागर न करें। दूसरे मोहरे को राजा की तरह चलाकर भ्रम पैदा कर सकते हैं।','अपने राजा को बचाते हुए प्रतिद्वंद्वी का राजा खोजें।','कंप्यूटर या अन्य खिलाड़ियों के विरुद्ध तर्क और छल की क्षमता आज़माएँ।','समस्याओं और सवालों के लिए हमारा GitHub पृष्ठ देखें।'],
    ta: ['தொடக்கத்தில் அடையாளங்கள் மறைந்திருக்கும்','அடையாளத்தை வெளிப்படுத்துதல்','வெற்றியும் உத்தியும்','உங்கள் ராஜாவை மறையுங்கள்','வெட்டுதலும் பதவி உயர்வும்','விளையாட்டைப் பற்றி','இந்த நகர்வைச் செய்ய முடியாத அடையாளங்கள் நிரந்தரமாக நீக்கப்படும்.','ராஜாவை முன்கூட்டியே வெளிப்படுத்த வேண்டாம். வேறு காயை ராஜா போல நகர்த்தி எதிராளியை ஏமாற்றலாம்.','உங்கள் ராஜாவைப் பாதுகாத்து எதிரியின் ராஜாவைக் கண்டுபிடியுங்கள்.','கணினி அல்லது பிற வீரர்களுக்கு எதிராக உங்கள் தர்க்கத்தையும் உத்தியையும் சோதியுங்கள்.','பிழைகள் அல்லது கேள்விகளுக்கு எங்கள் GitHub பக்கத்தைப் பாருங்கள்.'],
};
const plain = (text:string) => text.replace(/^\d+\.\s*/, '');
function buildRules(lang: keyof typeof additional) {
    const parts = extra[lang];
    const t=additional[lang], tutorial=additionalTutorial[lang];
    return {
        back:`‹ ${t.back}`,title:`Q-GAMBIT: ${t.rulesButton}`,intro:t.seoDesc,
        sec1Title:`1. ${parts[0]}`,sec1p1:plain(t.rule1),sec1p2:t.tips,
        sec2Title:`2. ${parts[1]}`,sec2p1:plain(t.rule2),sec2li1:t.tutorialDiagonal,
        sec2li2:parts[6],sec2li3:tutorial.steps[8],sec2rule:t.errIdentity,
        sec3Title:`3. ${parts[2]}`,sec3p1:plain(t.rule4),sec3BoxTitle:parts[3],sec3Boxp1:parts[8],
        sec3Boxli1:parts[7],sec3Boxli2:tutorial.steps[9],sec3Boxli3:tutorial.steps[11],
        sec4Title:`4. ${parts[4]}`,sec4p1:plain(t.rule3),sec4p2:t.promotionDesc,
        sec5Title:`5. ${parts[5]}`,sec5p1:t.subtitle2,sec5p2:parts[9],footer:parts[10],playTutorial:t.rulesButton,
    };
}
export const additionalRules = {tr:buildRules('tr'),pl:buildRules('pl'),pt:buildRules('pt'),hi:buildRules('hi'),ta:buildRules('ta')};
