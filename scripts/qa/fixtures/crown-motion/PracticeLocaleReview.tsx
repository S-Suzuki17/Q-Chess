import LocalGameBoard from '../../../../src/components/LocalGameBoard';
import type {Language} from '../../../../src/locales/dict';
export function PracticeLocaleReview({lang}:{lang:Language}) {
 return <LocalGameBoard lang={lang} user={{id:'GUEST-LOCALE-QA',name:'Guest',type:'guest'}} cpuLevel={1} timeControl="10m" onlineRole="white" onHome={()=>{}}/>;
}
