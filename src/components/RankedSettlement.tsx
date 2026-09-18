import type { RatingSettlement } from '../lib/rankedProtocol';
import { rankedText } from '../locales/rankedText';

/** Only a matching server receipt may display a confirmed rating change. */
export function RankedSettlement({lang,settlement}:{lang:string;settlement:RatingSettlement|null}) {
    return <p role="status" className="my-4 text-sm text-[#D4B872]" data-rating-status={settlement?'settled':'pending'}>
        {settlement?<>{rankedText(lang,'settled')} · {settlement.before} → {settlement.after} ({settlement.delta>0?'+':''}{settlement.delta})</>:rankedText(lang,'pending')}
    </p>;
}
