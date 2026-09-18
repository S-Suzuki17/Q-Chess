'use client';
import { LockKeyhole } from 'lucide-react';
import { campaignText } from '../locales/campaignText';
import { circuitAccessText } from '../locales/circuitAccessText';
import type { Language } from '../locales/dict';
import './campaign.css';

export function CircuitLoginGate({lang,onLogin,onBack}:{lang:Language;onLogin:()=>void;onBack:()=>void}) {
    return <section className="campaign-login-gate" data-testid="circuit-login-gate" aria-labelledby="circuit-login-title">
        <LockKeyhole size={36} aria-hidden="true"/>
        <p>{campaignText(lang,'title')}</p><h1 id="circuit-login-title">{circuitAccessText(lang,'action')}</h1>
        <p>{circuitAccessText(lang,'help')}</p>
        <div><button className="campaign-primary" onClick={onLogin}>{circuitAccessText(lang,'action')}</button><button onClick={onBack}>{campaignText(lang,'back')}</button></div>
    </section>;
}
