import type {Language} from '../locales/dict';
import {maintenanceInfo} from '../locales/maintenanceInfo';
export function ScheduledMaintenanceNotice({lang}:{lang:Language}){
 const text=maintenanceInfo(lang);
 return <section lang={lang} data-scheduled-maintenance className="mx-auto my-5 w-full max-w-4xl min-w-0 break-words rounded-xl border border-[#6E614C] bg-[#101610] p-3 text-base sm:p-5 text-left leading-relaxed text-[#BEB6A8]">
  <h2 className="mb-3 font-semibold text-[#D4B872]">{text.title}</h2>
  <p>{text.schedule}</p><p className="mt-2">{text.impact}</p><p className="mt-2">{text.updates}</p>
 </section>;
}
