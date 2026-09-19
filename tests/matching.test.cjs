/* 실행: node tests/matching.test.cjs — 실제 네트워크·시트 사용 없음 */
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const admin=fs.readFileSync(path.join(root,'admin.html'),'utf8');
const config={window:{}};vm.runInNewContext(fs.readFileSync(path.join(root,'site-config.js'),'utf8'),config);
const required=['name','phone','email','zip','housing','household','income','incomeYear','vehicleYear','fuel','vehicleOwned','purchaseType','wantsCharger','hasEV','previousApplied'];
for(const name of required){
  const tag=html.match(new RegExp('<(?:input|select)\\b[^>]*\\bname="'+name+'"[^>]*>'))?.[0];
  assert(tag&&/\brequired\b/.test(tag),name+' 필수 설정');
}
assert(!/\brequired\b/.test(html.match(/<input[^>]*name="panelCapacity"[^>]*>/)[0]));
console.log('통과: 필수 필드 전수 점검·패널 용량 선택 입력');
const ctx=vm.createContext({SITE_CONFIG:config.window.SITE_CONFIG,window:{},console,fetch:async()=>({json:async()=>({success:false})})});
vm.runInContext(html.slice(html.indexOf('const CONFIG='),html.indexOf('function show(')),ctx);
const applicant={income:'10000',household:'2',zip:'90001',vehicleYear:'2010',vehicleOwned:'yes',fuel:'gas',smog:'yes',purchaseType:'new',hasEV:'no',wantsCharger:'yes'};
const result=ctx.matchPrograms(applicant);
assert.equal(result.vehiclePrograms.length,4);assert.equal(result.chargerPrograms.length,2);
for(const list of [result.vehiclePrograms,result.chargerPrograms])assert(list.every((p,i)=>i===0||list[i-1].amount>=p.amount));
assert.equal(result.mutuallyExclusiveWarning,'이 중 하나만 신청 가능합니다');
assert(result.chargerPrograms.find(p=>p.id==='CALeVIP').applicabilityNote.includes('개인고객은 보통 해당없음'));
assert.equal(applicant.purchaseType,'new');
vm.runInContext("liveProgramStatuses.RYR='아니오';liveProgramStatuses.유틸리티리베이트='아니오';",ctx);
const off=ctx.matchPrograms(applicant);assert.equal(off.vehiclePrograms.find(p=>p.id==='RYR').isActive,false);assert.equal(off.chargerPrograms.find(p=>p.id==='Utility').isActive,false);
assert.equal(ctx.matchPrograms({...applicant,wantsCharger:'no'}).chargerPrograms.length,0);
const empty=ctx.matchPrograms({...applicant,income:'9999999',vehicleOwned:'no',hasEV:'yes',wantsCharger:'no'});
assert.equal(empty.vehiclePrograms.length+empty.chargerPrograms.length,0);assert.equal(empty.mutuallyExclusiveWarning,null);
console.log('통과: 두 그룹 정렬·복합 희망사항·상호배타·활성 상태·CALeVIP 주의');
const renderer=admin.slice(admin.indexOf('function renderMatchingGroups(c)'),admin.indexOf('function money(v)'));
const renderCtx=vm.createContext({esc:x=>String(x??'').replace(/</g,'&lt;'),money:x=>'$'+x});
vm.runInContext(renderer,renderCtx);
const rendered=renderCtx.renderMatchingGroups({matchingResult:off});
assert(rendered.includes('차량 프로그램'));assert(rendered.includes('충전기·전기공사 프로그램'));
assert(rendered.includes('1순위'));assert(rendered.includes('현재 신청 일시중단'));assert(rendered.includes('이 중 하나만 신청 가능합니다'));
assert(renderCtx.renderMatchingGroups({matchingResult:empty}).includes('해당 가능한 프로그램이 없습니다'));
assert(renderCtx.renderMatchingGroups({matchingResult:{results:result.vehiclePrograms}}).includes('1순위'));
console.log('통과: 관리자 그룹·순위·경고·비활성 배지 및 구버전 결과 호환');
const errors=new Map();
const validationCtx=vm.createContext({document:{
  getElementById:id=>errors.get(id),
  createElement:()=>({setAttribute(){},textContent:''})
}});
vm.runInContext(html.slice(html.indexOf('function validateFields('),html.indexOf('function valid(',html.indexOf('function validateFields('))),validationCtx);
function field(name,value,required=true,valid=true){
  return {name,value,required,type:name==='email'?'email':'text',attrs:{},checkValidity:()=>valid,
    setAttribute(k,v){this.attrs[k]=v;},insertAdjacentElement(where,e){errors.set(e.id,e);}};
}
const missing=required.map(name=>field(name,''));
assert.equal(validationCtx.validateFields(missing),missing[0]);
assert(missing.every(f=>f.attrs['aria-invalid']==='true'));
const optional=field('panelCapacity','',false);assert.equal(validationCtx.validateFields([optional]),null);
const phone=field('phone','abc');assert.equal(validationCtx.validateFields([phone]),phone);
phone.value='213-555-0100';assert.equal(validationCtx.validateFields([phone]),null);assert.equal(errors.get('field-error-phone').textContent,'');
assert.equal(validationCtx.validateFields([field('name','   ')]).name,'name');
assert.equal(validationCtx.validateFields([field('email','오류',true,false)]).name,'email');
assert(html.includes('if(!valid(true))return;'));
assert(!html.includes('renderMatchingGroups'));
console.log('통과: 공백·누락·전화·이메일 인라인 오류 및 최종 전체 재검증·고객 결과 비노출');
