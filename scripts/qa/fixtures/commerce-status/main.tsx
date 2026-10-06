import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { StripeMembershipPanel } from '../../../../src/components/StripeMembershipPanel';
import { MemberTicketsPanel } from '../../../../src/components/MemberTicketsPanel';
import { circuitAccess } from '../../../../src/lib/circuitAccess';
import { qa, scenario, native } from './stubs';
import '../../../../src/app/globals.css';
import '../../../../src/components/rewards-hub.css';

const first = { id: 'CommerceFixture', name: 'Fixture', type: 'registered' as const };
const login = (user: typeof first) => circuitAccess.grant(user, circuitAccess.beginAuthentication());
login(first);
function Fixture() {
    const [user, setUser] = useState(first);
    const lang = new URLSearchParams(location.search).get('lang') === 'ja' ? 'ja' : 'en';
    useEffect(() => {
        document.documentElement.lang = lang;
        qa.replaceAccount = () => {
            const next = { ...first, id: 'ReplacementFixture' };
            login(next); setUser(next);
        };
        qa.ready = true;
    }, [lang]);
    return <main className="min-h-dvh p-4" style={{ height: '100dvh', overflowY: 'auto' }}>
        <div className="mx-auto max-w-3xl space-y-6" data-commerce-fixture data-scenario={scenario}
            data-platform={native ? 'android' : 'web'} data-account={user.id}>
            <div data-panel="store"><StripeMembershipPanel user={user} lang={lang} /></div>
            <div data-panel="usage"><MemberTicketsPanel user={user} lang={lang} /></div>
        </div>
    </main>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
