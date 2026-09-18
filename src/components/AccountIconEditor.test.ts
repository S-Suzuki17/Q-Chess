import {describe,it,expect,vi} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {readFileSync} from 'node:fs';
import sharp from 'sharp';
import {AccountIconEditor} from './AccountIconEditor';
import {CIRCUIT_ICONS} from '../config/circuitIcons';
vi.mock('../lib/profileAvatar',()=>({AvatarError:class extends Error{},prepareAvatarPhoto:vi.fn(),saveProfileAvatar:vi.fn()}));
describe('account icon presentation',()=>{
 it('opens an accessible chooser with explicit confirmation disabled before a choice',()=>{
  const html=renderToStaticMarkup(createElement(AccountIconEditor,{lang:'ja',userId:'alice',clears:100,onClose:()=>{},onSaved:()=>{}}));
  expect(html).toContain('アイコン変更');expect(html).toContain('写真を使う');expect(html).toContain('獲得アイコンを使う');
  expect(html).toContain('accept="image/png,image/jpeg,image/webp"');
  expect(html).toMatch(/disabled=""[^>]*>このアイコンに変更/);
  expect(html).toContain('aria-label="キャンセル"');expect(html).toContain('aria-label="アイコン変更"');
 });
 it('ships all 15 distinct standalone rasterizable SVG portraits',async()=>{
  const sources=new Set<string>();
  for(const icon of CIRCUIT_ICONS){
   const file=new URL('../../public'+icon.url,import.meta.url),source=readFileSync(file,'utf8');sources.add(source);
   expect(source.replace('http://www.w3.org/2000/svg','')).not.toMatch(/<script|<foreignObject|href=|https?:\/\//i);
   const png=await sharp(Buffer.from(source)).resize(64,64).png().toBuffer();
   expect((await sharp(png).metadata()).width).toBe(64);
  }
  expect(sources.size).toBe(15);
 });
});
