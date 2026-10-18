import {describe,it,expect} from 'vitest';
import {tutorialCourseText} from '../locales/tutorialCourseText';
import {tutorialCourse} from '../lib/tutorialCourse';
import {LANGUAGES} from '../locales/dict';

describe('QUBE progressive classroom content',()=>{
 it.each(LANGUAGES.map(language=>language.code))('covers all 24 lessons and controls in %s',lang=>{
  const text=tutorialCourseText[lang];
  expect(text.chapters).toHaveLength(6);
  expect(text.titles).toHaveLength(tutorialCourse.length);
  expect(text.lessons).toHaveLength(tutorialCourse.length);
  for(const lesson of text.lessons)expect(lesson.trim().length).toBeGreaterThan(20);
  for(const [key,value]of Object.entries(text)){
   if(typeof value==='string')expect(value.trim(),key).not.toBe('');
  }
  if(lang!=='en')expect(text.lessons).not.toEqual(tutorialCourseText.en.lessons);
 });
 it('explains both-side teaching control, special choices, drawn finishes and unresolved mate',()=>{
  const text=tutorialCourseText.ja;
  expect(text.lessons[2]).toContain('実戦で動かせるのは自分の色');
  expect(text.lessons[12]).toContain('通常のルーク移動');
  expect(text.lessons[13]).toContain('元の正体枠はポーン');
  expect(text.lessons[15]).toContain('直後の一手だけ');
  expect(text.lessons[21]).toContain('引き分け');
  expect(text.lessons[23]).toContain('候補を残したまま');
 });
});
