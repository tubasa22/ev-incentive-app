/* 실행: node tests/payment-flow.test.cjs — 외부 API·실제 시트·메일을 사용하지 않습니다. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const crypto=require('node:crypto');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'apps-script/Code.gs'),'utf8');
function environment(){
  const tables=new Map(),props={STRIPE_SECRET_KEY:'sk_test_검증용',ADMIN_PASSWORD:'검증용'};
  let held=false,lockCount=0,session={},apiCode=200,failHistory=false,failFinalize=false;
  class Sheet{
    constructor(name){this.name=name;this.data=[];}
    appendRow(row){
      assert(held,'시트 쓰기는 잠금 안에서만 실행');
      if(this.name==='StatusHistory'&&failHistory){failHistory=false;throw Error('이력 저장 실패 재현');}
      this.data.push(row.slice());return this;
    }
    setFrozenRows(){}
    getLastColumn(){return Math.max(0,...this.data.map(row=>row.length));}
    getLastRow(){return this.data.length;}
    getDataRange(){return {getValues:()=>this.data.map(row=>row.slice())};}
    getRange(row,col,height=1,width=1){
      const write=values=>{
        assert(held,'범위 쓰기는 잠금 안에서만 실행');
        if(this.name==='PendingPayments'&&width>1&&failFinalize){failFinalize=false;throw Error('완료 기록 실패 재현');}
        values.forEach((line,i)=>line.forEach((v,j)=>{
          if(!this.data[row-1+i])this.data[row-1+i]=[];
          this.data[row-1+i][col-1+j]=v;
        }));
      };
      return {
        getValues:()=>Array.from({length:height},(_,i)=>Array.from({length:width},(_,j)=>this.data[row-1+i]?.[col-1+j]??'')),
        setValue:value=>write([[value]]),setValues:write
      };
    }
  }
  const ctx=vm.createContext({
    console,Date,JSON,Math,
    PropertiesService:{getScriptProperties:()=>({getProperty:key=>props[key]||null})},
    SpreadsheetApp:{getActive:()=>({getSheetByName:name=>tables.get(name),insertSheet:name=>{assert(held);const sh=new Sheet(name);tables.set(name,sh);return sh;}})},
    LockService:{getScriptLock:()=>({waitLock:()=>{assert(!held,'중첩 잠금 방지');held=true;lockCount++;},releaseLock:()=>{held=false;}})},
    Utilities:{getUuid:()=>crypto.randomUUID(),formatDate:()=>String(Date.now())},
    Session:{getScriptTimeZone:()=>'UTC'},
    Logger:{log:()=>{}},
    ContentService:{MimeType:{JSON:'json'},createTextOutput:text=>({setMimeType:()=>JSON.parse(text)})},
    UrlFetchApp:{fetch:(url,options)=>{
      assert(url.startsWith('https://api.stripe.com/v1/checkout/sessions/cs_test_'));
      assert.equal(options.headers.Authorization,'Bearer '+props.STRIPE_SECRET_KEY);
      return {getResponseCode:()=>apiCode,getContentText:()=>JSON.stringify(session)};
    }}
  });
  vm.runInContext(source,ctx);
  ctx.withLock_(()=>ctx.sheets_());
  const applicant={name:'테스트 신청자',phone:'213-555-0100',email:'test@example.com',wantsCharger:'no',purchaseType:'new',applicationConsent:'예',applicationConsentSignature:'테스트 신청자',applicationConsentAt:new Date().toISOString(),serviceFee:1};
  function pending(charger=false){
    return ctx.createPendingPayment({...applicant,wantsCharger:charger?'yes':'no'},{results:[]},charger?'withCharger':'vehicleOnly').token;
  }
  function paid(token,changes={}){
    session={id:'cs_test_'+crypto.randomBytes(8).toString('hex'),client_reference_id:token,payment_status:'paid',status:'complete',mode:'payment',currency:'usd',amount_total:9900,livemode:false,...changes};
    return session.id;
  }
  function age(token){const sh=tables.get('PendingPayments'),row=sh.data.find(row=>row[0]===token);row[1]=new Date(Date.now()-25*3600000);}
  const cases=()=>tables.get('Cases').data.length-1;
  return {ctx,props,tables,pending,paid,age,cases,applicant,failHistory:()=>failHistory=true,failFinalize:()=>failFinalize=true,setApiCode:n=>apiCode=n,lockCount:()=>lockCount};
}
let checks=0;
function test(name,fn){fn();checks++;console.log('통과: '+name);}
test('결제대기 저장·서버 가격·상태 공개 범위',()=>{
  const e=environment(),t=e.pending();assert.equal(e.cases(),0);
  const row=e.tables.get('PendingPayments').data[1];
  assert.equal(row[3],99);assert.equal(JSON.parse(row[6]).serviceFee,99);
  assert.equal(JSON.stringify(e.ctx.getPendingPaymentStatus(t)),JSON.stringify({status:'대기'}));
  assert.equal(JSON.stringify(e.ctx.getPendingPaymentStatus('없는 토큰')),JSON.stringify({status:'없음'}));
  assert.throws(()=>e.ctx.createPendingPayment({...e.applicant,wantsCharger:'yes'},{results:[]},'vehicleOnly'));
  assert.throws(()=>e.ctx.createPendingPayment({...e.applicant,applicationConsent:'아니오'},{results:[]},'vehicleOnly'));
  assert.throws(()=>e.ctx.createPendingPayment(e.applicant,{results:[]},'toString'));
});
test('미설정 키·미결제·위변조·금액·통화·모드 차단',()=>{
  const e=environment(),t=e.pending();
  for(const change of [{payment_status:'unpaid'},{status:'open'},{amount_total:100},{currency:'eur'},{mode:'subscription'},{livemode:true},{client_reference_id:'PAY-'+'0'.repeat(32)}]){
    const id=e.paid(t,change);assert.equal(e.ctx.verifyStripeSession(id,t).success,false);assert.equal(e.cases(),0);
  }
  const id=e.paid(t);e.setApiCode(401);assert.equal(e.ctx.verifyStripeSession(id,t).success,false);
  e.setApiCode(200);delete e.props.STRIPE_SECRET_KEY;assert.equal(e.ctx.verifyStripeSession(id,t).error,'결제 시스템이 아직 설정되지 않았습니다');
  assert.equal(e.cases(),0);
});
test('공개 createCase 우회 차단',()=>{
  const e=environment();
  assert.equal(e.ctx.doPost({postData:{contents:JSON.stringify({action:'createCase',applicant:e.applicant})}}).success,false);
  assert.equal(e.cases(),0);
});
test('정상 결제·토큰 복원·반복 호출·메일 대기',()=>{
  const e=environment(),t=e.pending(),id=e.paid(t);
  assert.equal(e.ctx.verifyStripeSession(id,'').success,true);
  assert.equal(e.ctx.verifyStripeSession(id,t).success,true);
  assert.equal(e.cases(),1);assert.equal(e.tables.get('StatusHistory').data.length,2);
  const sh=e.tables.get('Cases');assert.equal(sh.data[1][sh.data[0].indexOf('확인메일발송상태')],'대기');
  assert.equal(e.ctx.getPendingPaymentStatus(t).status,'완료');
  assert.equal(e.ctx.verifyStripeSession(id,'PAY-'+'1'.repeat(32)).success,false);
});
test('충전기 $199 검증',()=>{
  const e=environment(),t=e.pending(true);
  assert.equal(e.ctx.verifyStripeSession(e.paid(t),t).success,false);
  assert.equal(e.ctx.verifyStripeSession(e.paid(t,{amount_total:19900}),t).success,true);
});
for(const fail of ['failHistory','failFinalize']){
  test('부분 실패 후 중복 없는 재처리: '+fail,()=>{
    const e=environment(),t=e.pending(),id=e.paid(t);e[fail]();
    assert.equal(e.ctx.verifyStripeSession(id,t).success,false);assert.equal(e.cases(),1);
    assert.equal(e.ctx.getPendingPaymentStatus(t).status,'대기');
    assert.equal(e.ctx.verifyStripeSession(id,t).success,true);
    assert.equal(e.cases(),1);assert.equal(e.tables.get('StatusHistory').data.length,2);
    assert.equal(e.ctx.getPendingPaymentStatus(t).status,'완료');
  });
}
test('24시간 관리자 목록·수동 확인·감사 기록·세션 재사용 방지',()=>{
  const e=environment(),t=e.pending(),id=e.paid(t),auth={adminPassword:'검증용'};
  assert.throws(()=>e.ctx.listUnconfirmedPayments({}));
  assert.throws(()=>e.ctx.confirmPendingPaymentManually({token:t,sessionId:id,confirmed:true}));
  assert.equal(e.ctx.listUnconfirmedPayments(auth).payments.length,0);
  assert.throws(()=>e.ctx.confirmPendingPaymentManually({...auth,token:t,sessionId:id,confirmed:true}));
  e.age(t);assert.equal(e.ctx.listUnconfirmedPayments(auth).payments.length,1);
  assert.equal(e.ctx.confirmPendingPaymentManually({...auth,token:t,sessionId:id,confirmed:true}).success,true);
  assert.equal(e.ctx.confirmPendingPaymentManually({...auth,token:t,sessionId:id,confirmed:true}).success,true);
  const row=e.tables.get('PendingPayments').data[1];assert.equal(row[10],'관리자 수동확인');assert.equal(row[12],'대표님');
  assert.equal(e.cases(),1);
  const other=e.pending();e.age(other);
  assert.throws(()=>e.ctx.confirmPendingPaymentManually({...auth,token:other,sessionId:id,confirmed:true}));
  assert.equal(e.cases(),1);
});
test('HTML 스크립트 구문·설정·웹훅 부재',()=>{
  for(const file of ['index.html','admin.html','payment-success.html']){
    const html=fs.readFileSync(path.join(root,file),'utf8');
    for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))new vm.Script(match[1]);
  }
  const config={window:{}};vm.runInNewContext(fs.readFileSync(path.join(root,'site-config.js'),'utf8'),config);
  assert.equal(config.window.SITE_CONFIG.pricing.vehicleOnly,99);
  assert.equal(config.window.SITE_CONFIG.pricing.withCharger,199);
  assert(config.window.SITE_CONFIG.stripe.paymentLinkVehicleOnly.startsWith('PASTE_'));
  assert(config.window.SITE_CONFIG.stripe.paymentLinkWithCharger.startsWith('PASTE_'));
  assert(!source.includes('handleStripeWebhook'));
});
console.log('총 '+checks+'개 결제 흐름 테스트 통과');
