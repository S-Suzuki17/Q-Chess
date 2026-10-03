// T0 release barrier. Environment variables alone must never enable unfinished
// ticket flows. T1/T2/T3 must prove their own completion before changing these.
export const RANKED_TICKET_ADMISSION_RELEASE_READY = false;
export const CPU_HINT_TICKETS_RELEASE_READY = false;
export const DAILY_LOGIN_REWARDS_RELEASE_READY = false;

export const rankedTicketAdmissionEnabled = () => RANKED_TICKET_ADMISSION_RELEASE_READY
    && process.env.RANKED_TICKET_ADMISSION_ENABLED === 'true';
export const cpuHintTicketsEnabled = () => CPU_HINT_TICKETS_RELEASE_READY
    && process.env.CPU_HINT_TICKETS_ENABLED === 'true';
export const dailyLoginRewardsEnabled = () => DAILY_LOGIN_REWARDS_RELEASE_READY
    && process.env.DAILY_LOGIN_REWARDS_ENABLED === 'true';
