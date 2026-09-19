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
  let held=false,lockCount=0,session={},apiCode=200,failHistory=false,failFinalize=false,failRefund=false;
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
        if(this.name==='Cases'&&width>1&&failRefund){failRefund=false;throw Error('환불 필드 저장 실패 재현');}
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
  const applicant={name:'테스트 신청자',phone:'213-555-0100',email:'test@example.com',zip:'90001',housing:'자가',household:'2',income:'10000',incomeYear:'2025',vehicleYear:'2010',fuel:'gas',vehicleOwned:'yes',hasEV:'no',previousApplied:'no',serviceType:'vehicleOnly',wantsCharger:'no',purchaseType:'new',applicationConsent:'예',applicationConsentSignature:'테스트 신청자',applicationConsentAt:new Date().toISOString(),serviceFee:1};
  function pending(charger=false){
    return ctx.createPendingPayment({...applicant,serviceType:charger?'bundle':'vehicleOnly',wantsCharger:charger?'yes':'no'},{results:[]},charger?'bundle':'vehicleOnly').token;
  }
  function paid(token,changes={}){
    session={id:'cs_test_'+crypto.randomBytes(8).toString('hex'),client_reference_id:token,payment_status:'paid',status:'complete',mode:'payment',currency:'usd',amount_total:9900,livemode:false,...changes};
    return session.id;
  }
  function age(token){const sh=tables.get('PendingPayments'),row=sh.data.find(row=>row[0]===token);row[1]=new Date(Date.now()-25*3600000);}
  const cases=()=>tables.get('Cases').data.length-1;
  return {ctx,props,tables,pending,paid,age,cases,applicant,failHistory:()=>failHistory=true,failFinalize:()=>failFinalize=true,failRefund:()=>failRefund=true,setApiCode:n=>apiCode=n,lockCount:()=>lockCount};
}
let checks=0;
function test(name,fn){fn();checks++;console.log('통과: '+name);}
test('결제대기 저장·서버 가격·상태 공개 범위',()=>{
  const e=environment(),t=e.pending();assert.equal(e.cases(),0);
  const row=e.tables.get('PendingPayments').data[1];
  assert.equal(row[3],99);assert.equal(JSON.parse(row[6]).serviceFee,99);
  assert.equal(JSON.stringify(e.ctx.getPendingPaymentStatus(t)),JSON.stringify({status:'대기'}));
  assert.equal(JSON.stringify(e.ctx.getPendingPaymentStatus('없는 토큰')),JSON.stringify({status:'없음'}));
  assert.throws(()=>e.ctx.createPendingPayment({...e.applicant,serviceType:'bundle'},{results:[]},'vehicleOnly'));
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
  assert.equal(config.window.SITE_CONFIG.pricing.bundle,199);
  assert(config.window.SITE_CONFIG.stripe.paymentLinkVehicleOnly.startsWith('PASTE_'));
  assert(config.window.SITE_CONFIG.stripe.paymentLinkBundle.startsWith('PASTE_'));
  assert(!source.includes('handleStripeWebhook'));
});
test('환불 72시간 경계·제출상태·누락/미래 시각·이력 판별',()=>{
  const e=environment(),now=Date.now();
  e.ctx.Date=class extends Date{static now(){return now;}};
  const check=(changes={})=>e.ctx.getRefundEligibility_({paidAt:new Date(now-72*3600000),status:'대기',...changes});
  for(const status of ['대기','배정됨','방문예정','시공중','서류접수'])assert.equal(check({status}).eligible,true);
  assert.equal(check({paidAt:new Date(now-72*3600000-1)}).eligible,false);
  assert.equal(check({paidAt:new Date(now+1)}).reason,'결제일시 확인 필요');
  assert.equal(check({paidAt:''}).reason,'결제일시 확인 필요');
  assert.equal(check({paidAt:'날짜 오류'}).reason,'결제일시 확인 필요');
  for(const status of ['제출','승인','거절','서류제출완료','정산완료'])assert.equal(check({status}).reason,'이미 신청서 제출됨');
  assert.equal(check({status:'결과안내완료'}).eligible,false);
  assert.equal(check({history:[{newStatus:'제출'}]}).reason,'이미 신청서 제출됨');
  assert.equal(check({refunded:true}).reason,'이미 환불처리됨');
});
test('결제일시 최초 기록·재요청 보존·관리자 조회 전용',()=>{
  const e=environment(),t=e.pending(),sid=e.paid(t);
  e.ctx.verifyStripeSession(sid,t);
  const sh=e.tables.get('Cases'),row=sh.data[1],m=e.ctx.map_(sh),date=row[m['결제일시']];
  assert(date instanceof Date);e.ctx.verifyStripeSession(sid,t);assert.equal(row[m['결제일시']],date);
  const admin=e.ctx.findCases_(row[m.CaseID],true)[0];assert.equal(admin.refundEligible.eligible,true);assert.equal(admin.refunded,false);
  const contractor=e.ctx.contractorCaseObj_(row,m,[],{});
  for(const key of ['paidAt','refundEligible','refunded','refundedAt','refundReason'])assert.equal(key in contractor,false);
});
test('환불 인증·사유·카드환불 확인·중복 방지·현재 업무상태 유지',()=>{
  const e=environment(),t=e.pending();e.ctx.verifyStripeSession(e.paid(t),t);
  const sh=e.tables.get('Cases'),m=e.ctx.map_(sh),id=sh.data[1][m.CaseID],auth={adminPassword:'검증용',cardRefundConfirmed:true};
  assert.throws(()=>e.ctx.processRefund(id,'고객 요청',{}));
  assert.throws(()=>e.ctx.processRefund(id,'',auth));
  assert.throws(()=>e.ctx.processRefund(id,'고객 요청',{adminPassword:'검증용'}));
  assert.equal(e.ctx.processRefund(id,'고객 취소 요청',auth).success,true);
  assert.equal(sh.data[1][m['환불처리여부']],'예');
  assert.equal(sh.data[1][m['환불사유']],'고객 취소 요청');assert.equal(sh.data[1][m['현재상태']],'대기');
  assert.equal(e.ctx.processRefund(id,'다른 메모',auth).alreadyProcessed,true);
  assert.equal(sh.data[1][m['환불사유']],'고객 취소 요청');
  const hist=e.tables.get('StatusHistory').data.filter(row=>row[3]==='환불처리');
  assert.equal(hist.length,1);assert.equal(hist[0][5],'대표님');
});
test('환불 불가 건 명시적 예외 확인·접두사 기록',()=>{
  const e=environment(),t=e.pending();e.ctx.verifyStripeSession(e.paid(t),t);
  const sh=e.tables.get('Cases'),m=e.ctx.map_(sh),id=sh.data[1][m.CaseID],auth={adminPassword:'검증용',cardRefundConfirmed:true};
  sh.data[1][m['결제일시']]=new Date(Date.now()-4*86400000);
  assert.equal(e.ctx.processRefund(id,'주말 취소 요청',auth).requiresOverride,true);
  assert.notEqual(sh.data[1][m['환불처리여부']],'예');
  e.ctx.processRefund(id,'주말 취소 요청',{...auth,forceRefund:true});
  assert.equal(sh.data[1][m['환불사유']],'[예외처리] 주말 취소 요청');
});
test('환불 기록 부분 실패 후 최초 이력으로 복구',()=>{
  const e=environment(),t=e.pending();e.ctx.verifyStripeSession(e.paid(t),t);
  const sh=e.tables.get('Cases'),m=e.ctx.map_(sh),id=sh.data[1][m.CaseID],auth={adminPassword:'검증용',cardRefundConfirmed:true};
  e.failRefund();assert.throws(()=>e.ctx.processRefund(id,'최초 사유',auth));
  assert.notEqual(sh.data[1][m['환불처리여부']],'예');
  assert.equal(e.ctx.processRefund(id,'재시도 사유',auth).success,true);
  assert.equal(sh.data[1][m['환불사유']],'최초 사유');
  assert.equal(e.tables.get('StatusHistory').data.filter(row=>row[3]==='환불처리').length,1);
});
test('환불 UI 배지·완료건 버튼 숨김·문자열 이스케이프',()=>{
  const html=fs.readFileSync(path.join(root,'admin.html'),'utf8');
  const code=html.slice(html.indexOf('function refundSection(c)'),html.indexOf("$('#reviewResults').addEventListener('click'",html.indexOf('function refundSection(c)')));
  const ctx=vm.createContext({esc:v=>String(v??'').replace(/</g,'&lt;').replace(/>/g,'&gt;')});
  vm.runInContext(code,ctx);
  assert(ctx.refundSection({refundEligible:{eligible:true}}).includes('refund-yes'));
  assert(ctx.refundSection({refundEligible:{eligible:false,reason:'3영업일 경과'}}).includes('환불 불가'));
  const done=ctx.refundSection({refunded:true,refundedAt:'2026-09-18',refundReason:'<script>'});
  assert(done.includes('환불완료 (2026-09-18)'));assert(!done.includes('<button'));assert(done.includes('&lt;script&gt;'));
});
test('새 필수 입력 서버 검증과 그룹 결과 Cases 저장',()=>{
  const e=environment();
  for(const name of ['name','phone','email','zip','housing','household','income','incomeYear','vehicleYear','fuel','vehicleOwned','purchaseType','serviceType','hasEV','previousApplied']){
    assert.throws(()=>e.ctx.createPendingPayment({...e.applicant,[name]:''},{results:[]},'vehicleOnly'),name);
  }
  assert.throws(()=>e.ctx.createPendingPayment({...e.applicant,household:'0'},{results:[]},'vehicleOnly'));
  assert.throws(()=>e.ctx.createPendingPayment({...e.applicant,panelCapacity:'음수'},{results:[]},'vehicleOnly'));
  const matching={vehiclePrograms:[{id:'RYR',name:'차량 프로그램',amount:12000,reason:'대상',isActive:false}],chargerPrograms:[],mutuallyExclusiveWarning:null};
  const t=e.ctx.createPendingPayment({...e.applicant,panelCapacity:''},matching,'vehicleOnly').token;
  assert.equal(e.ctx.verifyStripeSession(e.paid(t),t).success,true);
  const sh=e.tables.get('Cases'),m=e.ctx.map_(sh);
  const saved=JSON.parse(sh.data[1][m['매칭결과JSON']]);
  assert(saved.vehiclePrograms.some(p=>p.id==='DCAP'));
  assert(!saved.vehiclePrograms.some(p=>p.reason==='대상')); // 클라이언트가 보낸 결과가 아니라 서버 계산
  assert.deepEqual(JSON.parse(sh.data[1][m['매칭프로그램목록(JSON)']]),saved.vehiclePrograms.concat(saved.chargerPrograms));
});
test('충전기만 $149·차량 입력 제거·서버 매칭·가격 위변조 차단',()=>{
  const e=environment(),a={...e.applicant,serviceType:'chargerOnly',serviceFee:1};
  for(const key of ['vehicleYear','fuel','vehicleOwned','smog','purchaseType'])delete a[key];
  const t=e.ctx.createPendingPayment(a,{vehiclePrograms:[{id:'RYR'}],chargerPrograms:[]},'chargerOnly').token;
  const row=e.tables.get('PendingPayments').data[1],stored=JSON.parse(row[6]),matching=JSON.parse(row[7]);
  assert.equal(row[3],149);assert.equal(stored.serviceFee,149);assert.equal(stored.purchaseType,'charger');
  assert.equal(stored.vehicleYear,undefined);assert.equal(matching.vehiclePrograms.length,0);
  assert.equal(matching.chargerPrograms.length,1);assert.equal(matching.chargerPrograms[0].id,'Utility');
  assert.equal(e.ctx.verifyStripeSession(e.paid(t),t).success,false);
  assert.equal(e.ctx.verifyStripeSession(e.paid(t,{amount_total:14900}),t).success,true);
  assert.throws(()=>e.ctx.createPendingPayment(a,{results:[]},'bundle'));
  assert.throws(()=>e.ctx.createPendingPayment({...a,serviceType:'bundle'},{results:[]},'bundle'));
});
test('기존 withCharger 대기 결제는 $199 확인 유지·신규 생성은 차단',()=>{
  const e=environment(),t=e.pending(true);
  e.tables.get('PendingPayments').data[1][2]='withCharger';
  assert.equal(e.ctx.verifyStripeSession(e.paid(t,{amount_total:19900}),t).success,true);
  assert.throws(()=>e.ctx.createPendingPayment({...e.applicant,serviceType:'withCharger'},{results:[]},'withCharger'));
});
test('결제 요약은 저장된 유형·금액만 사용하고 검증 응답에 포함',()=>{
  const e=environment(),t=e.pending(),sid=e.paid(t);
  const result=e.ctx.verifyStripeSession(sid,t);
  assert.deepEqual(JSON.parse(JSON.stringify(result.payment)),{priceType:'vehicleOnly',name:'차량 교체/구매 지원만',amount:99});
  assert.equal(e.ctx.paymentSummary_({servicePricingType:'bundle',serviceFee:199}).name,'차량 및 충전기·전기패널 업그레이드 지원');
  assert.equal(e.ctx.paymentSummary_({servicePricingType:'chargerOnly'}),null);
  assert.equal(e.ctx.paymentSummary_({servicePricingType:'unknown',serviceFee:149}),null);
});
test('접수확인 이메일에 실제 유형·금액과 기존 절차 안내 유지',()=>{
  const e=environment(),sent=[];
  e.ctx.MailApp={sendEmail:mail=>sent.push(mail)};
  for(const [type,amount,label] of [['vehicleOnly',99,'차량 교체/구매 지원만'],['chargerOnly',149,'충전기·전기패널 업그레이드 지원만'],['bundle',199,'차량 및 충전기·전기패널 업그레이드 지원']]){
    e.ctx.sendConfirmationEmail_({...e.applicant,servicePricingType:type,serviceFee:amount},'EV-TEST');
    const mail=sent.pop(),line='결제하신 서비스: '+label+' ($'+amount+')';
    assert(mail.body.includes(line));assert(mail.htmlBody.includes(line));
    for(const phrase of ['1. 1차 검토','2. 서류 준비 및 제출','3. 프로그램 심사 및 승인']){assert(mail.body.includes(phrase));assert(mail.htmlBody.includes(phrase));}
  }
  const legacyApplicant={...e.applicant};
  delete legacyApplicant.serviceType;
  delete legacyApplicant.servicePricingType;
  delete legacyApplicant.serviceFee;
  e.ctx.sendConfirmationEmail_(legacyApplicant,'EV-OLD');
  assert(sent.pop().body.includes('결제 유형·금액 기록 확인 필요'));
});
console.log('총 '+checks+'개 결제·환불·신청 검증 테스트 통과');
