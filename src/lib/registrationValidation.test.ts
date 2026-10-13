import {expect,it} from 'vitest';
import {registrationFormIssues,registrationIssues,registrationEmail,readRegistrationIssue} from '../../server/src/services/RegistrationValidation';
import {registrationFieldText,registrationFormText} from '../locales/registrationValidationText';

const email='fixture@example.test',password='River!Cloud#47';
it('keeps registration length, strength, reserved-name and Unicode boundaries',()=>{
    for(const value of ['Ab3!'.repeat(3),'Ab3!'.repeat(18),'春夏秋冬'.repeat(6),'🌱🌸🍁🧊'.repeat(4)+'🌱🌸','ＡＢＣＤ１２３４ＥＦＧＨ','  Ab3!Cd4?  ']){
        expect(registrationIssues('Fixture1',value,email)).toEqual([]);
    }
    for(const [value,reason] of [['Ab3!Ab3!Cd4','short'],['Ab3!'.repeat(18)+'X','long'],['春夏秋冬'.repeat(6)+'空','long'],[password+'\x7f','control'],['password1234','weak'],['Aa1'.repeat(4),'variety']] as const){
        expect(registrationIssues('Fixture1',value,email)).toEqual([{field:'password',reason}]);
    }
    for(const name of ['Q17','Abcd1234Efgh567','Guestly','Adminson'])expect(registrationIssues(name,password,email)).toEqual([]);
    for(const [name,reason] of [['Ab','length'],['Abcd1234Efgh5678','length'],['Ab_cd','format'],['ＡＢＣ１２３','format'],['Admin','unavailable'],['Guest','unavailable']] as const){
        expect(registrationIssues(name,password,email)).toEqual([{field:'username',reason}]);
    }
});
it('preserves API and form normalization boundaries without normalizing passwords',()=>{
    expect(registrationFormIssues('  Fixture1  ','  Ab3!Cd4?  ',' FIXTURE@EXAMPLE.TEST ')).toEqual([]);
    expect(registrationIssues('  Fixture1  ',password,email)).toEqual([{field:'username',reason:'format'}]);
    expect(registrationEmail(' FIXTURE@EXAMPLE.TEST ')).toBe(email);
    expect(registrationEmail('a'.repeat(242)+'@example.com')).not.toBeNull();
    expect(registrationEmail('a'.repeat(243)+'@example.com')).toBeNull();
    expect(registrationEmail(['a@example.test','b@example.test'])).toBeNull();
    expect(registrationEmail('a@example.test,b@example.test')).toBeNull();
    expect(registrationFormIssues('Fixture1',password,'a,b@example.test',true)).toEqual([{field:'email',reason:'format'}]);
    expect(registrationFormIssues('Fixture1',' '.repeat(12),email)).toEqual([{field:'password',reason:'required'}]);
    // The existing API accepts diverse Unicode whitespace, while the form's
    // required-field rule rejects all-whitespace input. Keep both acceptance sets.
    const whitespace='\u2000\u2001\u2002\u2003'.repeat(3);
    expect(registrationIssues('Fixture1',whitespace,email)).toEqual([]);
    expect(registrationFormIssues('Fixture1',whitespace,email)).toEqual([{field:'password',reason:'required'}]);
});
it('orders multiple errors by form order and returns only safe codes',()=>{
    expect(registrationFormIssues('','','')).toEqual([{field:'email',reason:'required'},{field:'username',reason:'required'},{field:'password',reason:'required'}]);
    expect(readRegistrationIssue({field:'password',reason:'weak',message:'private'})).toEqual({field:'password',reason:'weak'});
    for(const value of [{field:'email',reason:'weak'},{field:'email',reason:'already_exists'},{field:'constructor',reason:'format'},null,[]])expect(readRegistrationIssue(value)).toBeUndefined();
});
it('has all field and form error text in twelve languages without a fallback',()=>{
    const pairs={email:['required','format'],username:['required','format','length','unavailable'],password:['required','short','long','control','weak','variety']};
    for(const lang of ['ja','en','zh','ru','fr','de','es','tr','pl','hi','pt','ta'] as const){
        for(const [field,reasons] of Object.entries(pairs))for(const reason of reasons){
            const issue=readRegistrationIssue({field,reason})!;expect(registrationFieldText(lang,issue).length).toBeGreaterThan(3);
            if(lang!=='en')expect(registrationFieldText(lang,issue)).not.toBe(registrationFieldText('en',issue));
        }
        for(const key of ['invalid','conflict','tryLater','unavailable'] as const)expect(registrationFormText(lang,key).length).toBeGreaterThan(3);
    }
});
