'use client';
import { accountDeletionText } from '../locales/accountDeletionText';
import { accountDataGuide } from '../locales/accountDataGuide';
import type { Language } from '../locales/dict';
export function AccountDataGuide({ lang }: { lang: Language }) {
  const deletion = accountDeletionText(lang);
  return <section id="delete-account" className="my-8 max-w-3xl space-y-4 leading-relaxed">
    <h2 className="text-xl text-[#D4B872]">Q-Gambit — {deletion.title}</h2>
    <p>{accountDataGuide(lang)[0]}</p>
    <p>{deletion.scope}</p>
    <p>{accountDataGuide(lang)[1]}</p>
    <p>{accountDataGuide(lang)[2]}</p>
  </section>;
}
