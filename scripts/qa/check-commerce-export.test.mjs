import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkCommerceExport, parseCommerceExportArgs } from './check-commerce-export.mjs';
const products=[['standard_monthly','3.00',null],['plus_monthly','6.00',null],['hints_1','1.00',1],['hints_13','10.00',13],
    ['hints_27','20.00',27],['hints_44','30.00',44],['hints_77','50.00',77],['hints_166','100.00',166]];
const web = open => `<article data-commerce-disclosure data-commerce-sales="${open?'open':'closed'}">鈴木 壮太 内宿台2-184-1 070-7660-1602 qgambit970@gmail.com
    <section data-legacy-commerce-terms>USD 2.99</section>${open?'商品と価格':'現在、新規購入は受け付けていません。新商品（販売準備中）'}
    <ul>${products.map(([sku,total,hints])=>`<li data-commerce-sku="${sku}">USD $${total}${hints===null?'':` QUBEヒント ${hints}枚`}</li>`).join('')}</ul></article>`;
test('requires an explicit sales configuration and rejects Android ON',()=>{
    for(const args of [[],['web'],['web','on'],['web','--sales=maybe'],['android','--sales=on'],['web','--sales=on','a','b']]) assert.throws(()=>parseCommerceExportArgs(args));
    assert.deepEqual(parseCommerceExportArgs(['web','--sales=on','/export.html']),{target:'web',sales:'on',htmlPath:'/export.html'});
    assert.deepEqual(parseCommerceExportArgs(['android','--sales=off']),{target:'android',sales:'off',htmlPath:undefined});
});
test('accepts the requested Web configuration and rejects mixed/stale sales output',()=>{
    checkCommerceExport('web','on',web(true));checkCommerceExport('web','off',web(false));
    assert.throws(()=>checkCommerceExport('web','on',web(false)));
    assert.throws(()=>checkCommerceExport('web','off',web(true)));
    assert.throws(()=>checkCommerceExport('web','on',web(true).replace('USD $3.00','USD $2.99')));
    assert.throws(()=>checkCommerceExport('web','on',web(true).replace('鈴木 壮太','')));
});
test('rejects missing products, wrong pack quantities and unscoped legacy terms',()=>{
    assert.throws(()=>checkCommerceExport('web','on',web(true).replace(/<li data-commerce-sku="hints_13">.*?<\/li>/,'')));
    assert.throws(()=>checkCommerceExport('web','on',web(true).replace('QUBEヒント 166枚','QUBEヒント 13枚')));
    assert.throws(()=>checkCommerceExport('web','on',web(true).replace('data-legacy-commerce-terms','data-old')));
    assert.throws(()=>checkCommerceExport('web','on',web(true).replace('商品と価格','新商品（販売準備中）')));
});
test('Android excludes actual sales/price/links, while serialized code is ignored',()=>{
    const android='<main>Q-Gambit</main><script>'+web(true)+'</script>';
    checkCommerceExport('android','off',android);
    for(const extra of [web(true),'USD 2.99','Q-Gambit Plus','<a href="/commerce/">Web</a>','<a href="https://checkout.stripe.com/c/pay/x">Pay</a>','<a href="https://billing.stripe.com/p/session/x">Manage</a>']) assert.throws(()=>checkCommerceExport('android','off',android+extra));
});
test('both Web configurations exclude payment links and private seller fields',()=>{
    for(const mode of ['on','off']) for(const extra of ['acct_secret','生年月日','<a href="https://checkout.stripe.com/c/pay/x">Pay</a>']) assert.throws(()=>checkCommerceExport('web',mode,web(mode==='on')+extra));
});
