/** Once selling starts, production is live; sandbox QA is another deployment/DB. */
export function stripeDeploymentModeAllowed(environment: string | undefined, mode: string | undefined): boolean {
    return (environment === 'production' && mode === 'live') || (environment === 'sandbox' && mode === 'test');
}
