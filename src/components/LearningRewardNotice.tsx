import type {Language} from '../locales/dict';
import {learningText} from '../locales/learningText';
import type {useLearningRewards} from '../hooks/useLearningRewards';
import './learning-reward-notice.css';
export function LearningRewardNotice({lang,account,userId}:{lang:Language;account:ReturnType<typeof useLearningRewards>;userId?:string}) {
    const t=learningText(lang);
    return <div className="learning-reward-notice" role="status" aria-live="polite">
        {!userId?t.login:account.busy?t.saving:account.receipt?.reward?
            account.receipt.reward==='ranked'?t.rankedReward:t.hintReward:
            account.error?t.unavailable:account.receipt&&!account.receipt.firstClear?t.already:null}
        {userId&&(account.error||account.pending)&&!account.busy&&<button type="button" onClick={()=>void account.retry()}>{account.pending?t.retry:t.refresh}</button>}
    </div>;
}
