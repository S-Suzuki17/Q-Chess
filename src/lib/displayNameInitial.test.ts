import {afterEach,expect,it,vi} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {AccountAvatar} from '../components/AccountAvatar';
import {displayNameInitial} from './displayNameInitial';
afterEach(()=>vi.unstubAllGlobals());
it.each([['😀Alex','😀'],['👩🏽‍💻Player','👩🏽‍💻'],['🇯🇵東京','🇯🇵'],['e\u0301mile','e\u0301'],['கிName','கி'],['鈴木','鈴'],['Łukasz','Ł'],['Иван','И'],['','?']])('renders %s as a complete initial without UTF-8 replacement', (name,initial)=>{
 expect(displayNameInitial(name)).toBe(initial);
 const html=Buffer.from(renderToStaticMarkup(createElement(AccountAvatar,{name}))).toString('utf8');
 expect(html).toContain(initial);expect(html).not.toContain('\ufffd');
});
it('falls back to code points on older WebViews without splitting surrogate pairs',()=>{
 vi.stubGlobal('Intl',{Segmenter:undefined});expect(displayNameInitial('😀Alex')).toBe('😀');expect(displayNameInitial('\ud800')).toBe('?');
});
