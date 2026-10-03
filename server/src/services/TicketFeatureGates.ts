// Integrated release verified on 2026-10-03. Runtime switches still default OFF;
// deploy the matching database migrations before explicitly enabling them.
export const RANKED_TICKET_ADMISSION_RELEASE_READY = true;
export const CPU_HINT_TICKETS_RELEASE_READY = true;
export const DAILY_LOGIN_REWARDS_RELEASE_READY = true;
// Rollback must stop new admissions while continuing cleanup of old admissions.
// Release both source gates together; then keep recovery enabled on rollback.
export const RANKED_ADMISSION_RECOVERY_RELEASE_READY = true;

export const rankedTicketAdmissionEnabled = () => RANKED_TICKET_ADMISSION_RELEASE_READY
    && process.env.RANKED_TICKET_ADMISSION_ENABLED === 'true';
export const rankedAdmissionRecoveryEnabled = () => rankedTicketAdmissionEnabled()
    || (RANKED_ADMISSION_RECOVERY_RELEASE_READY && process.env.RANKED_ADMISSION_RECOVERY_ENABLED === 'true');
export const cpuHintTicketsEnabled = () => CPU_HINT_TICKETS_RELEASE_READY
    && process.env.CPU_HINT_TICKETS_ENABLED === 'true';
export const dailyLoginRewardsEnabled = () => DAILY_LOGIN_REWARDS_RELEASE_READY
    && process.env.DAILY_LOGIN_REWARDS_ENABLED === 'true';
