/* 실행: node tests/payment-pages.test.cjs — 화면 스크립트 모의 실행, 네트워크 사용 없음 */
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const inline=file=>[...fs.readFileSync(path.join(root,file),'utf8').matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).filter(Boolean).join('\n');
function element(value=''){
  return {value,checked:false,disabled:false,textContent:'',innerHTML:'',hidden:false,attrs:{},listeners:{},
    classList:{add(){},remove(){},toggle(){}},addEventListener(k,fn){this.listeners[k]=fn;},setAttribute(k,v){this.attrs[k]=v;},
    querySelector(){return null;},scrollIntoView(){},closest(){return this;}};
}
async function intake(ready){
  const nodes=new Map(),get=s=>{if(!nodes.has(s))nodes.set(s,element());return nodes.get(s);};
  let sent=[],redirect='';
  const config={apiUrl:'https://example.test/api',contactEmail:'test@example.com',pricing:{vehicleOnly:99,chargerOnly:149,bundle:199,creditNote:'차감 안내'},stripe:{paymentLinkVehicleOnly:ready?'https://buy.stripe.com/test_example?locale=ko':'PASTE_STRIPE_LINK_VEHICLE_ONLY_HERE'}};
  const ctx=vm.createContext({console,URL,Date,JSON,Math,Number,Object,String,SITE_CONFIG:config,
    document:{querySelector:get,querySelectorAll:s=>s==='.step'?[element()]:[]},
    FormData:class{*[Symbol.iterator](){yield* Object.entries({name:'테스트',phone:'123',email:'test@example.com',wantsCharger:'no',income:'10000',household:'1',zip:'90001',purchaseType:'new'});}},
    alert:message=>{throw Error(message);},
    fetch:async(url,options)=>{if(!options)return {json:async()=>({success:true,statuses:{}})};
      sent.push(JSON.parse(options.body));return {json:async()=>({success:true,token:'PAY-'+'a'.repeat(32)})};},
    window:{SITE_CONFIG:config,location:{assign:url=>redirect=url}}
  });ctx.window.fetch=ctx.fetch;vm.runInContext(inline('index.html'),ctx);
  get('#applicationConsent').checked=true;get('#consentSignature').value='테스트';
  get('[name="serviceType"]:checked').value='vehicleOnly';
  await get('#form').onsubmit({preventDefault(){},target:get('#form')});
  if(ready){
    assert.equal(sent.length,1);assert.equal(sent[0].action,'createPendingPayment');
    assert.equal(sent[0].priceType,'vehicleOnly');
    const url=new URL(redirect);assert.equal(url.searchParams.get('client_reference_id'),'PAY-'+'a'.repeat(32));assert.equal(url.searchParams.get('locale'),'ko');
    assert.equal(sent[0].applicantData.applicationConsent,'예');
  }else{assert.equal(sent.length,0);assert.equal(redirect,'');assert(get('#results').innerHTML.includes('아직 준비되지 않았습니다'));}
}
async function successPage(responses,search='?session_id=cs_test_123'){
  const nodes=new Map(),get=s=>{if(!nodes.has(s))nodes.set(s,element());return nodes.get(s);};
  let now=0,calls=[],timers=new Map(),next=0;
  class FakeDate extends Date{static now(){return now;}}
  const ctx=vm.createContext({console,URLSearchParams,Date:FakeDate,JSON,Math,AbortController,
    location:{search},SITE_CONFIG:{apiUrl:'https://example.test/api',contactEmail:'test@example.com'},
    document:{querySelector:get},
    setTimeout:(fn,delay)=>{const id=++next;if(delay<=3000){now+=delay;Promise.resolve().then(fn);}else timers.set(id,fn);return id;},
    clearTimeout:id=>timers.delete(id),
    fetch:async(url,options)=>{calls.push(JSON.parse(options.body));const result=responses[Math.min(calls.length-1,responses.length-1)];return {ok:true,json:async()=>result};}
  });
  vm.runInContext(inline('payment-success.html'),ctx);
  for(let i=0;i<200;i++)await Promise.resolve();
  return {get,calls,now};
}
(async()=>{
  await intake(false);console.log('통과: 플레이스홀더는 임시 저장·결제 이동 없이 안내');
  await intake(true);console.log('통과: 동의 데이터·가격 유형 전송 및 client_reference_id 연결');
  let p=await successPage([{success:true,status:'완료',payment:{priceType:'chargerOnly',name:'충전기·전기패널 업그레이드 지원만',amount:149}}]);assert.equal(p.calls[0].token,'');assert(p.get('#heading').textContent.includes('접수가 완료'));assert(p.get('#message').textContent.includes('예정'));assert.equal(p.get('#retry').hidden,true);assert.equal(p.get('#paymentSummary').textContent,'결제하신 서비스: 충전기·전기패널 업그레이드 지원만 ($149)');assert.equal(p.get('#paymentSummary').hidden,false);
  console.log('통과: 세션ID만으로 서버 검증 요청·접수 완료·메일 대기 안내');
  p=await successPage([{success:false,pending:true}]);assert.equal(p.now,20000);assert.equal(p.calls.length,7);assert.equal(p.get('#retry').hidden,false);assert.equal(p.get('#heading').textContent,'결제 확인 중입니다');
  console.log('통과: 3초 간격 확인·20초 제한·재시도 안내');
  p=await successPage([{success:false,error:'결제 시스템이 아직 설정되지 않았습니다'}]);assert.equal(p.calls.length,1);assert(p.get('#message').textContent.includes('아직 설정'));assert.equal(p.get('#retry').hidden,false);
  p=await successPage([], '?token=잘못된값');assert.equal(p.calls.length,0);assert(p.get('#message').textContent.includes('세션 정보가 없습니다'));
  console.log('통과: 비밀키 미설정 및 URL 누락 안내');
})().catch(error=>{console.error(error);process.exitCode=1;});
