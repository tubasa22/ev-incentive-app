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
  let held=false,lockCount=0,session={},apiCode=200,failHistory=false,failFinalize=false,failRefund=false;const mails=[];
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
    MailApp:{sendEmail:message=>mails.push(message),getRemainingDailyQuota:()=>42},
    ContentService:{MimeType:{JSON:'json'},createTextOutput:text=>({setMimeType:()=>JSON.parse(text)})},
    UrlFetchApp:{fetch:(url,options)=>{
      assert(url.startsWith('https://api.stripe.com/v1/checkout/sessions/cs_test_'));
      assert.equal(options.headers.Authorization,'Bearer '+props.STRIPE_SECRET_KEY);
      return {getResponseCode:()=>apiCode,getContentText:()=>JSON.stringify(session)};
    }}
  });
  vm.runInContext(source,ctx);
  ctx.withLock_(()=>ctx.sheets_());
  const applicant={name:'테스트 신청자',phone:'213-555-0100',email:'test@example.com',zip:'90001',electricUtility:'LADWP',housing:'자가',residenceType:'단독주택',household:'2',income:'10000',incomeYear:'2025',vehicleYear:'2010',fuel:'gas',vehicleOwned:'yes',hasEV:'no',previousApplied:'no',serviceType:'chargerOnly',wantsCharger:'yes',purchaseType:'charger',applicationConsent:'예',applicationConsentSignature:'테스트 신청자',applicationConsentAt:new Date().toISOString(),serviceFee:1};
  function pending(unused=false,testMode=false){
    return ctx.createPendingPayment({...applicant},{results:[]},'chargerOnly',testMode).token;
  }
  function paid(token,changes={}){
    session={id:'cs_test_'+crypto.randomBytes(8).toString('hex'),client_reference_id:token,payment_status:'paid',status:'complete',mode:'payment',currency:'usd',amount_total:14900,livemode:false,...changes};
    return session.id;
  }
  function age(token){const sh=tables.get('PendingPayments'),row=sh.data.find(row=>row[0]===token);row[1]=new Date(Date.now()-25*3600000);}
  const cases=()=>tables.get('Cases').data.length-1;
  return {ctx,props,tables,pending,paid,age,cases,applicant,mails,failHistory:()=>failHistory=true,failFinalize:()=>failFinalize=true,failRefund:()=>failRefund=true,setApiCode:n=>apiCode=n,lockCount:()=>lockCount};
}
let checks=0;
function test(name,fn){fn();checks++;console.log('통과: '+name);}
test('결제대기 저장·서버 가격·상태 공개 범위',()=>{
  const e=environment(),t=e.pending();assert.equal(e.cases(),0);
  const row=e.tables.get('PendingPayments').data[1];
  assert.equal(row[3],149);assert.equal(JSON.parse(row[6]).serviceFee,149);
  assert.equal(JSON.stringify(e.ctx.getPendingPaymentStatus(t)),JSON.stringify({status:'대기'}));
  assert.equal(JSON.stringify(e.ctx.getPendingPaymentStatus('없는 토큰')),JSON.stringify({status:'없음'}));
  assert.throws(()=>e.ctx.createPendingPayment({...e.applicant,serviceType:'bundle'},{results:[]},'bundle'));
  assert.throws(()=>e.ctx.createPendingPayment({...e.applicant,applicationConsent:'아니오'},{results:[]},'chargerOnly'));
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
test('테스트 결제만 소액을 허용하고 운영 결제는 정가를 검증',()=>{
  const testEnv=environment(),testToken=testEnv.pending(false,true),testRow=testEnv.tables.get('PendingPayments').data[1],headers=testEnv.tables.get('PendingPayments').data[0];
  assert.equal(testRow[headers.indexOf('테스트모드')],'예');
  assert.equal(testEnv.ctx.verifyStripeSession(testEnv.paid(testToken,{amount_total:50}),testToken).success,true);
  const liveEnv=environment(),liveToken=liveEnv.pending(false,true);liveEnv.props.STRIPE_SECRET_KEY='sk_live_검증용';
  assert.equal(liveEnv.ctx.verifyStripeSession(liveEnv.paid(liveToken,{amount_total:50,livemode:true}),liveToken).success,false);
  const regularEnv=environment(),regularToken=regularEnv.pending();
  assert.equal(regularEnv.ctx.verifyStripeSession(regularEnv.paid(regularToken,{amount_total:50}),regularToken).success,false);
});
test('공개 createCase 우회 차단',()=>{
  const e=environment();
  assert.equal(e.ctx.doPost({postData:{contents:JSON.stringify({action:'createCase',applicant:e.applicant})}}).success,false);
  assert.equal(e.cases(),0);
});
test('무료 자격확인 리드·이메일·결제 후 전환 분리',()=>{
  const e=environment(),applicant={...e.applicant};delete applicant.applicationConsent;delete applicant.applicationConsentSignature;delete applicant.applicationConsentAt;
  const checked=e.ctx.submitEligibilityCheck(applicant,{source:'meta',medium:'paid_social',campaign:'가을캠페인',content:'영상A'});assert.equal(checked.status,'가능성있음');assert.equal(e.cases(),0);assert.equal(e.tables.get('Leads').data.length,2);
  const leadSheet=e.tables.get('Leads'),leadMap=e.ctx.map_(leadSheet);assert.equal(leadSheet.data[1][leadMap['UTM소스']],'meta');assert.equal(leadSheet.data[1][leadMap['UTM매체']],'paid_social');assert.equal(leadSheet.data[1][leadMap['UTM캠페인']],'가을캠페인');assert.equal(leadSheet.data[1][leadMap['UTM콘텐츠']],'영상A');
  assert.equal(e.mails.length,2);const customerMail=e.mails.find(mail=>mail.to===applicant.email),adminLeadMail=e.mails.find(mail=>mail.subject&&mail.subject.includes('신규 리드'));assert(customerMail);assert(adminLeadMail);assert(!customerMail.body.includes('Replace Your Ride'));assert(customerMail.body.includes('선택하신 서비스: 충전기 또는 전기패널 업그레이드 지원 / 이용료: $149'));assert(!customerMail.body.includes('둘 다: $199'));assert(customerMail.htmlBody.includes('clean-ev-email-logo.png'));assert(customerMail.htmlBody.includes('계속 진행하기'));assert(customerMail.htmlBody.includes('C-10 #1059763'));assert(!adminLeadMail.body.includes('C-10 #1059763'));
  const continued=e.ctx.getLeadForContinue(checked.leadId);assert.equal(continued.success,true);assert.equal(continued.priceType,'chargerOnly');
  const pending=e.ctx.createPendingPaymentFromLead(checked.leadId,'chargerOnly',{applicationConsent:'예',applicationConsentSignature:'테스트 신청자',applicationConsentAt:new Date().toISOString()});
  assert.equal(e.cases(),0);const sid=e.paid(pending.token);assert.equal(e.ctx.verifyStripeSession(sid,pending.token).success,true);assert.equal(e.cases(),1);assert(e.mails.some(mail=>mail.subject&&mail.subject.includes('신규 결제 접수')));
  assert.equal(e.ctx.getLeadForContinue(checked.leadId).error,'이미 처리된 신청입니다');
});
test('결제 임시 게이트는 리드를 준비중으로 전환하고 관리자에게 알림',()=>{
  const e=environment(),applicant={...e.applicant};delete applicant.applicationConsent;delete applicant.applicationConsentSignature;delete applicant.applicationConsentAt;
  const checked=e.ctx.submitEligibilityCheck(applicant),result=e.ctx.markLeadPaymentWaiting(checked.leadId),sh=e.tables.get('Leads'),m=e.ctx.map_(sh);
  assert.equal(result.status,'결제대기(준비중)');assert.equal(sh.data[1][m['리드상태']],'결제대기(준비중)');assert(e.mails.some(mail=>mail.subject&&mail.subject.includes('결제 오픈 대기 리드')));assert.equal(e.ctx.getLeadForContinue(checked.leadId).success,false);
});
test('서비스 지역 밖은 보류 이메일, 불명확 관할은 관리자 확인으로 분리',()=>{
  const held=environment(),heldApplicant={...held.applicant,electricUtility:'SCE'};delete heldApplicant.applicationConsent;delete heldApplicant.applicationConsentSignature;delete heldApplicant.applicationConsentAt;
  const checked=held.ctx.submitEligibilityCheck(heldApplicant);assert.equal(checked.status,'보류');assert.equal(held.cases(),0);assert.equal(held.mails.length,1);assert(held.mails[0].body.includes('LA시(LADWP) 지역의 충전기 설치 지원부터'));assert(held.mails[0].htmlBody.includes('clean-ev-email-logo.png'));
  const sh=held.tables.get('Leads'),m=held.ctx.map_(sh);assert.equal(sh.data[1][m['사유']],'서비스지역외');assert.equal(held.ctx.getLeadForContinue(checked.leadId).success,false);
  const program=held.tables.get('ProgramStatus'),pm=held.ctx.map_(program),ladwp=held.ctx.findRow_(program,'프로그램명','서비스유틸리티_LADWP'),sce=held.ctx.findRow_(program,'프로그램명','서비스유틸리티_SCE');assert.equal(ladwp.data[pm['활성여부']],'예');assert.equal(sce.data[pm['활성여부']],'아니오');held.ctx.withLock_(()=>program.getRange(sce.row,pm['활성여부']+1).setValue('예'));assert.equal(held.ctx.submitEligibilityCheck({...heldApplicant,email:'sce@example.com'}).status,'가능성있음');
  const review=environment(),unknown={...review.applicant,electricUtility:'잘 모르겠음',zip:'99999'};delete unknown.applicationConsent;delete unknown.applicationConsentSignature;delete unknown.applicationConsentAt;
  const needsReview=review.ctx.submitEligibilityCheck(unknown);assert.equal(needsReview.status,'확인필요');assert.equal(review.mails.length,1);assert.equal(review.mails[0].to,'jdlee.electric@gmail.com');assert(review.mails[0].subject.includes('전력회사 수동 확인 필요'));
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
test('충전기 $149 검증',()=>{
  const e=environment(),t=e.pending(true);
  assert.equal(e.ctx.verifyStripeSession(e.paid(t,{amount_total:19900}),t).success,false);
  assert.equal(e.ctx.verifyStripeSession(e.paid(t,{amount_total:14900}),t).success,true);
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
  const intakeHtml=fs.readFileSync(path.join(root,'index.html'),'utf8'),serviceChoice=intakeHtml.match(/<fieldset id="serviceChoice">([\s\S]*?)<\/fieldset>/)[1];assert(!serviceChoice.includes('$'));assert(!serviceChoice.includes('할인'));
  assert(!intakeHtml.includes('name="continueServiceType"'));assert(intakeHtml.includes("id='continueServiceSummary'"));assert(intakeHtml.includes('다른 서비스를 원하시면 <a href="index.html">처음부터 다시 진행해주세요</a>'));
  assert(intakeHtml.includes("document.documentElement.classList.add('lead-entry')"));assert(intakeHtml.includes('정보를 확인하고 있습니다...'));assert(intakeHtml.includes('.lead-entry #intake{display:none}'));
  const config={window:{}};vm.runInNewContext(fs.readFileSync(path.join(root,'site-config.js'),'utf8'),config);
  assert.equal(config.window.SITE_CONFIG.pricing.vehicleOnly,99);
  assert.equal(config.window.SITE_CONFIG.pricing.bundle,199);
  assert.equal(config.window.SITE_CONFIG.stripe.testMode,true);
  assert.equal(config.window.SITE_CONFIG.stripe.test.paymentLinkVehicleOnly,'https://buy.stripe.com/test_dRm14naVd1eeb9qdzM2kw00');
  assert.equal(config.window.SITE_CONFIG.stripe.test.paymentLinkChargerOnly,'https://buy.stripe.com/test_dRm6oHaVd8GG4L21R42kw01');
  assert.equal(config.window.SITE_CONFIG.stripe.test.paymentLinkBundle,'https://buy.stripe.com/test_7sY14n5ATg987XeanA2kw02');
  assert(config.window.SITE_CONFIG.stripe.live.paymentLinkVehicleOnly.startsWith('PASTE_'));
  assert.equal(config.window.SITE_CONFIG.metaPixelId,'PASTE_META_PIXEL_ID_HERE');
  assert(!source.includes('handleStripeWebhook'));
});
test('UTM은 세션의 첫 유입값을 유지하고 Meta 픽셀 플레이스홀더는 비활성',()=>{
  const values=new Map(),sessionStorage={getItem:key=>values.has(key)?values.get(key):null,setItem:(key,value)=>values.set(key,String(value))};
  const context={URLSearchParams,sessionStorage,window:{location:{search:'?utm_source=meta&utm_medium=paid_social&utm_campaign=first'}}};context.window.window=context.window;context.window.sessionStorage=sessionStorage;
  vm.runInNewContext(fs.readFileSync(path.join(root,'site-config.js'),'utf8'),context);context.SITE_CONFIG=context.window.SITE_CONFIG;context.window.SITE_TRACKING.captureUtm();context.window.location.search='?utm_source=google&utm_content=creative-b';context.window.SITE_TRACKING.captureUtm();
  assert.equal(JSON.stringify(context.window.SITE_TRACKING.getUtm()),JSON.stringify({source:'meta',medium:'paid_social',campaign:'first',content:'creative-b'}));assert.equal(context.window.SITE_TRACKING.initMetaPixel(true),false);
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
test('자체시공 정산 제외와 시공계약 체결 전 착공 차단',()=>{
  const e=environment(),auth={adminPassword:'검증용'},contractor=e.ctx.registerContractor({contractor:{name:'JD Electric',phone:'213-555-0199',selfPerform:true}}),contractorSheet=e.tables.get('Contractors'),cr=e.ctx.findRow_(contractorSheet,'컨트랙터ID',contractor.contractorId);
  e.ctx.withLock_(()=>{contractorSheet.getRange(cr.row,cr.m['라이선스만료일']+1).setValue(new Date(Date.now()+86400000));contractorSheet.getRange(cr.row,cr.m['본드만료일']+1).setValue(new Date(Date.now()+86400000));contractorSheet.getRange(cr.row,cr.m['본인확인방식']+1).setValue('관리자수동확인완료')});
  const created=e.ctx.createCase_({applicant:e.applicant,matchingResult:{},programs:[]}),caseId=created.caseId;
  e.ctx.assignCaseToContractor(caseId,contractor.contractorId,'대표님');const payments=e.tables.get('Payments'),pm=e.ctx.map_(payments);assert.equal(payments.data[1][pm['하청비지급상태']],'해당없음(자체시공)');
  assert.throws(()=>e.ctx.updateStatus_({caseId,newStatus:'시공중',note:'',agent:'JD Electric'}),/시공계약서 체결/);
  assert.throws(()=>e.ctx.updateStatus_({caseId,newStatus:'시공중',note:'',constructionContractOverride:true,...auth}),/시공계약서 체결/);
  assert.equal(e.ctx.updateStatus_({caseId,newStatus:'시공중',note:'대표 승인',constructionContractOverride:true,...auth}).success,true);
  const cases=e.tables.get('Cases'),cm=e.ctx.map_(cases),caseRow=e.ctx.findRow_(cases,'CaseID',caseId);e.ctx.withLock_(()=>{cases.getRange(caseRow.row,cm['현재상태']+1).setValue('시공완료')});assert.equal(e.ctx.paymentCandidates_().length,0);
  const saved=e.ctx.saveConstructionContract({caseId,contractAmount:8000,signedDate:'2026-10-06',cancellationNoticeDate:'2026-10-06',depositAmount:800,feeCreditApplied:'예',startDate:'2026-10-10',contractLink:'https://drive.google.com/example',...auth});assert.equal(saved.success,true);assert.equal(saved.constructionContract.contractAmount,8000);
  assert.equal(e.ctx.getEmailQuota(auth).remaining,42);
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
  for(const name of ['name','phone','email','zip','electricUtility','housing','household','income','incomeYear','serviceType','hasEV','previousApplied']){
    assert.throws(()=>e.ctx.createPendingPayment({...e.applicant,[name]:''},{results:[]},'chargerOnly'),name);
  }
  assert.throws(()=>e.ctx.createPendingPayment({...e.applicant,household:'0'},{results:[]},'chargerOnly'));
  assert.throws(()=>e.ctx.createPendingPayment({...e.applicant,panelCapacity:'음수'},{results:[]},'chargerOnly'));
  const matching={vehiclePrograms:[{id:'RYR',name:'차량 프로그램',amount:12000,reason:'대상',isActive:false}],chargerPrograms:[],mutuallyExclusiveWarning:null};
  const t=e.ctx.createPendingPayment({...e.applicant,panelCapacity:''},matching,'chargerOnly').token;
  assert.equal(e.ctx.verifyStripeSession(e.paid(t),t).success,true);
  const sh=e.tables.get('Cases'),m=e.ctx.map_(sh);
  const saved=JSON.parse(sh.data[1][m['매칭결과JSON']]);
  assert.equal(saved.vehiclePrograms.length,0);
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
  assert.equal(matching.chargerPrograms.length,2);assert(matching.chargerPrograms.some(p=>p.id==='LADWP_CHARGER'));assert(matching.chargerPrograms.some(p=>p.id==='SCAQMD_EV_CHARGING'));
  assert.equal(e.ctx.verifyStripeSession(e.paid(t,{amount_total:9900}),t).success,false);
  assert.equal(e.ctx.verifyStripeSession(e.paid(t,{amount_total:14900}),t).success,true);
  assert.throws(()=>e.ctx.createPendingPayment(a,{results:[]},'bundle'));
  assert.throws(()=>e.ctx.createPendingPayment({...a,serviceType:'bundle'},{results:[]},'bundle'));
});
test('기존 withCharger 대기 결제는 $199 확인 유지·신규 생성은 차단',()=>{
  const e=environment(),t=e.pending(true);
  e.tables.get('PendingPayments').data[1][2]='withCharger';e.tables.get('PendingPayments').data[1][3]=199;
  assert.equal(e.ctx.verifyStripeSession(e.paid(t,{amount_total:19900}),t).success,true);
  assert.throws(()=>e.ctx.createPendingPayment({...e.applicant,serviceType:'withCharger'},{results:[]},'withCharger'));
});
test('결제 요약은 저장된 유형·금액만 사용하고 검증 응답에 포함',()=>{
  const e=environment(),t=e.pending(),sid=e.paid(t);
  const result=e.ctx.verifyStripeSession(sid,t);
  assert.deepEqual(JSON.parse(JSON.stringify(result.payment)),{priceType:'chargerOnly',name:'충전기·전기패널 업그레이드 지원만',amount:149});
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
test('딜러 등록·수정·MyFirstEV 소개·소개비 독립 추적',()=>{
  const e=environment(),auth={adminPassword:'검증용'};
  assert.throws(()=>e.ctx.getDealers({}));
  const registered=e.ctx.registerDealer({name:'테스트 딜러',contactName:'김담당',phone:'213-555-9999',email:'dealer@example.com',programs:'MyFirstEV',referralFee:500},auth);
  assert.match(registered.dealerId,/^DLR-/);assert.equal(e.ctx.getDealers(auth).length,1);
  e.ctx.updateDealer(registered.dealerId,{referralFee:600},auth);assert.equal(e.ctx.getDealers(auth)[0].referralFee,600);
  const created=e.ctx.createCase_({applicant:e.applicant,matchingResult:{vehiclePrograms:[{id:'MyFirstEV',name:'My First EV'}],chargerPrograms:[]},paymentConfirmed:true});
  assert.throws(()=>e.ctx.referCaseToDealer(created.caseId,registered.dealerId,{}));
  const referred=e.ctx.referCaseToDealer(created.caseId,registered.dealerId,auth);assert.equal(referred.dealerName,'테스트 딜러');
  assert.throws(()=>e.ctx.referCaseToDealer(created.caseId,registered.dealerId,auth));
  const history=e.tables.get('StatusHistory').data;assert(history.at(-1)[4].includes('딜러소개: 테스트 딜러'));
  let candidates=e.ctx.dealerReferralCandidates_(auth);assert.equal(candidates.length,1);assert.equal(candidates[0].expectedFee,600);
  e.ctx.recordDealerReferralFee(created.caseId,600,'2026-09-18',auth);assert.equal(e.ctx.dealerReferralCandidates_(auth).length,0);
  const cases=e.tables.get('Cases'),row=cases.data[1],headers=cases.data[0];assert.equal(row[headers.indexOf('소개비수령여부')],'예');assert.equal(row[headers.indexOf('소개비수령액')],600);
  assert.equal(e.tables.get('Payments').data.length,1,'기존 컨트랙터 정산 시트는 변경하지 않음');
  const other=e.ctx.createCase_({applicant:e.applicant,matchingResult:{vehiclePrograms:[{id:'RYR'}],chargerPrograms:[]},paymentConfirmed:true});
  assert.throws(()=>e.ctx.referCaseToDealer(other.caseId,registered.dealerId,auth));
});
test('딜러 관리자 UI와 API 라우팅은 관리자 화면에만 존재',()=>{
  const admin=fs.readFileSync(path.join(root,'admin.html'),'utf8'),contractor=fs.readFileSync(path.join(root,'contractor.html'),'utf8'),index=fs.readFileSync(path.join(root,'index.html'),'utf8');
  for(const text of ['딜러 제휴','딜러 소개비 관리','referCaseToDealer','recordDealerReferralFee'])assert(admin.includes(text));
  assert(!contractor.includes('딜러 소개비'));assert(!index.includes('딜러 소개비'));
});
test('협력업체 지원서는 웹폼과 관리자 이메일 수동등록을 구분',()=>{
  const e=environment(),auth={adminPassword:'검증용'},data={name:'테스트 전기',phone:'714-555-1111',email:'apply@example.com',serviceArea:'오렌지카운티',licenseNumber:'1234567',licenseType:'C-10',licenseExpiry:'2027-01-01',bondCompany:'테스트 본드',bondNumber:'B-123',bondAmount:'25000',bondExpiry:'2027-02-01',bio:'주택용 전기 시공'};
  const publicResult=e.ctx.submitContractorApplication(data),sh=e.tables.get('ContractorApplications'),m=e.ctx.map_(sh);assert.equal(sh.data[1][m['등록방식']],'웹폼');assert.equal(e.mails.length,2);assert.throws(()=>e.ctx.submitContractorApplication(data));
  assert.throws(()=>e.ctx.adminSubmitContractorApplication(data,false,{}));const manual=e.ctx.adminSubmitContractorApplication(data,false,auth);assert.equal(sh.data[2][m['등록방식']],'이메일수동등록');assert.equal(sh.data[2][m['지원상태']],'검토대기');assert.equal(e.mails.length,2);assert.equal(manual.applicantEmailSent,false);assert.equal(manual.adminEmailSent,false);
  const mailed=e.ctx.adminSubmitContractorApplication({...data,email:'second@example.com'},true,auth);assert.equal(mailed.applicantEmailSent,true);assert.equal(e.mails.length,3);
  const routed=e.ctx.doPost({postData:{contents:JSON.stringify({action:'adminSubmitContractorApplication',data:{...data,email:'route@example.com'},sendConfirmation:false,adminPassword:'검증용'})}});assert.equal(routed.success,true);
  const admin=fs.readFileSync(path.join(root,'admin.html'),'utf8');for(const text of ['id="manualApplicationForm"','adminSubmitContractorApplication','지원자에게 접수확인 이메일 발송','등록방식:','name="approveImmediately" type="checkbox" checked','관리자 수동등록 후 즉시승인','reviewContractorApplication','approval.accessCode'])assert(admin.includes(text));
  assert(!admin.includes('id="contractorForm"'));assert(!admin.includes("api('registerContractor'"));const contractors=admin.indexOf('<section id="contractors"'),applications=admin.indexOf('<section id="applications"'),manualIndex=admin.indexOf('id="manualApplicationForm"');assert(contractors<manualIndex&&manualIndex<applications);const applicationSection=admin.slice(applications,admin.indexOf('<section id="programs"'));assert(!applicationSection.includes('manualApplicationForm'));
});
test('컨트랙터 로그인 실패 원인과 라우팅 실패를 실행 로그에 기록',()=>{
  const code=source;
  for(const text of ['로그인 시도: contractorId=','컨트랙터ID를 찾을 수 없음:','비활성 업체:','액세스코드 불일치: 입력값=[','로그인 성공:','contractorLogin 인증 실패: contractorId='])assert(code.includes(text));
  assert(code.includes("if(d.action==='contractorLogin'){var success=validateContractorLogin"));
});
test('관리자 케이스 검색은 버튼 또는 IME 조합 완료 후 Enter에서만 실행',()=>{
  const admin=fs.readFileSync(path.join(root,'admin.html'),'utf8');
  assert(admin.includes('id="reviewQuery" type="text"'));assert(admin.includes("addEventListener('compositionstart'"));assert(admin.includes("addEventListener('compositionend'"));
  assert(admin.includes("event.key==='Enter'&&!event.isComposing&&!reviewQueryComposing"));assert(!admin.includes("$('#reviewQuery').onkeydown"));
});
test('관리자 케이스 검토는 최신순 페이지와 검색·상태필터·TEST 배지를 제공',()=>{
  const e=environment(),auth={adminPassword:'검증용'},created=[];
  for(let i=0;i<3;i++)created.push(e.ctx.createCase_({applicant:{...e.applicant,name:'신청자'+i},matchingResult:{vehiclePrograms:[],chargerPrograms:[]},paymentConfirmed:true,testMode:i===1}).caseId);
  const sh=e.tables.get('Cases'),m=e.ctx.map_(sh);sh.data[1][m['최종수정일시']]=new Date('2026-01-01');sh.data[2][m['최종수정일시']]=new Date('2026-03-01');sh.data[3][m['최종수정일시']]=new Date('2026-02-01');
  assert.throws(()=>e.ctx.getRecentCases(30,0,{}));
  const first=e.ctx.getRecentCases(2,0,auth),second=e.ctx.getRecentCases(2,2,auth);assert.deepEqual(first.map(c=>c.caseId),[created[1],created[2]]);assert.deepEqual(second.map(c=>c.caseId),[created[0]]);assert.equal(first[0].testPayment,true);assert(first[0].matchingResult);
  const routed=e.ctx.doPost({postData:{contents:JSON.stringify({action:'getRecentCases',limit:1,offset:0,adminPassword:'검증용'})}});assert.equal(routed.cases.length,1);
  const admin=fs.readFileSync(path.join(root,'admin.html'),'utf8');for(const text of ['id="reviewCaseRows"','id="reviewStatus"','id="reviewMore"','getRecentCases','class="test-badge"'])assert(admin.includes(text));
});
test('관리자 탭은 업무 흐름 순서로 배치되고 이름 호칭을 중복하지 않음',()=>{
  const admin=fs.readFileSync(path.join(root,'admin.html'),'utf8');
  assert(admin.includes("const order=['dashboard','leads','review','assign','contractors','applications','dealers','payments','programs','admins']"));
  assert(admin.includes("honorific=/님$/.test(adminName)?'':'님'"));assert(!admin.includes("(result.adminName||'관리자')+'님 로그인 중'"));
});
test('관리자 리드·프로그램 화면은 보류/확인필요와 서비스 재개 배너를 제공',()=>{
  const admin=fs.readFileSync(path.join(root,'admin.html'),'utf8');
  for(const text of ['<option>보류</option>','<option>확인필요</option>','<th>사유</th>','heldLeadCount','건의 보류 리드가 있습니다. 다시 안내하시겠습니까?','보류 리드 보기'])assert(admin.includes(text));
});
test('LADWP 8단계는 배정 컨트랙터만 순서대로 기록',()=>{
  const e=environment(),contractors=e.tables.get('Contractors'),cm=e.ctx.map_(contractors),contractorRow=Array(contractors.getLastColumn()).fill('');
  contractorRow[cm['컨트랙터ID']]='CTR-1';contractorRow[cm['액세스코드']]='1234';contractorRow[cm['활성여부']]='예';e.ctx.withLock_(()=>contractors.appendRow(contractorRow));
  const applicant={...e.applicant,serviceType:'bundle',wantsCharger:'yes',residenceType:'다세대주택'},created=e.ctx.createCase_({applicant,matchingResult:{vehiclePrograms:[],chargerPrograms:[{id:'LADWP_CHARGER'}]},paymentConfirmed:true});
  const cases=e.tables.get('Cases'),m=e.ctx.map_(cases),row=cases.data[1];e.ctx.withLock_(()=>cases.getRange(2,m['컨트랙터ID']+1).setValue('CTR-1'));
  assert.throws(()=>e.ctx.updateLadwpStep(created.caseId,'CTR-2','1234',1));assert.throws(()=>e.ctx.updateLadwpStep(created.caseId,'CTR-1','1234',2));
  assert.equal(e.ctx.updateLadwpStep(created.caseId,'CTR-1','1234',1).step,1);assert.equal(row[m['LADWP절차단계']],1);
  assert(e.tables.get('StatusHistory').data.at(-1)[4].includes('LADWP 1단계: 딜러 상담 완료'));
  const portal=e.ctx.getCasesForContractor('CTR-1','1234')[0];assert.equal(portal.isLadwpInstall,true);assert.equal(portal.ladwpStep,1);assert.equal(portal.address.residenceType,'다세대주택');assert.equal('income' in portal,false);
});
console.log('총 '+checks+'개 결제·환불·신청 검증 테스트 통과');
