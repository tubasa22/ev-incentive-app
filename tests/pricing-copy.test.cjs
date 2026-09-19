/* 실행: node tests/pricing-copy.test.cjs — 3단계 가격 관련 안내 문구 정합성 */
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8');
const legal=read('legal.html'),index=read('index.html'),code=read('apps-script/Code.gs'),success=read('payment-success.html');
assert(legal.includes('차량 프로그램 신청 대행: $99 / 충전기·전기패널 업그레이드 신청 대행: $149 / 둘 다 함께: $199(개별 구매 대비 $49 할인)'));
assert(legal.includes('세 가지 서비스 유형에 동일하게 적용됩니다'));
assert(legal.includes('이용료($149 또는 $199)'));
assert(legal.includes('차량 프로그램만 신청하신 경우($99)는 시공이 발생하지 않으므로 해당 사항이 없습니다'));
assert(legal.includes('Civil Code 1689.5 검토'));
assert(index.includes('id="consentServiceName"'));assert(index.includes('id="consentServiceAmount"'));
assert(index.includes('id="consentConstructionCredit" hidden'));
assert(index.includes('이 환불 조건은 세 가지 서비스 유형 모두에 동일하게 적용됩니다'));
assert(index.includes('<!-- TODO: 변호사 검토 필요 -->'));
assert(!index.includes('프로그램 승인 여부와 무관하게 환불되지 않습니다'));
assert(code.includes("paymentLine=payment?'결제하신 서비스: '+payment.name+' ($'+payment.amount+')'"));
assert(success.includes("결제하신 서비스: '+payment.name+' ($'+payment.amount+')"));
for(const file of ['index.html','admin.html','payment-success.html'])for(const match of read(file).matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))new vm.Script(match[1]);
console.log('통과: 법적고지·동의서·이메일·관리자·결제완료 3단계 가격 문구 정합성');
