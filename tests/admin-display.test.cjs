/* 실행: node tests/admin-display.test.cjs — 관리자 목록 표시 회귀 테스트, 네트워크 사용 없음 */
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const html=fs.readFileSync(path.resolve(__dirname,'..','admin.html'),'utf8');
const script=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(match=>match[1]).filter(Boolean).join('\n');
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const functionSource=script.match(/function renderUnconfirmedPayments\(payments\)\{[^\n]+\}/);
assert(functionSource,'결제 미확인 목록 렌더러가 있어야 합니다.');
const context=vm.createContext({esc});
vm.runInContext(functionSource[0],context);

const empty=context.renderUnconfirmedPayments([]);
assert(empty.includes('미확인 결제가 없습니다.'),'0건 안내가 표시되어야 합니다.');

const one=context.renderUnconfirmedPayments([{name:'테스트 고객',createdAt:'2026-10-06',phone:'213-555-0100',email:'test@example.com',token:'PAY-TEST',amount:149,priceType:'chargerOnly',sessionId:''}]);
assert(one.includes('테스트 고객'),'1건 이상일 때 고객 정보가 표시되어야 합니다.');
assert(one.includes('manualPayment'),'1건 이상일 때 수동 확인 버튼이 표시되어야 합니다.');
assert(script.includes("$$('.manualPayment').forEach"),'여러 결제 버튼은 querySelectorAll 기반 선택자를 사용해야 합니다.');
assert(!/(^|[^$])\$\('\.manualPayment'\)\.forEach/.test(script),'단일 요소 선택자에 forEach를 호출하면 안 됩니다.');
assert(html.includes('내부 기록용입니다. 고객에게는 표시되지 않고 알림도 발송되지 않습니다.'),'LADWP 내부 기록 안내가 있어야 합니다.');
assert(script.includes("saved.textContent='저장되었습니다'"),'LADWP 저장 성공 문구가 있어야 합니다.');
console.log('통과: 결제 미확인 0건/1건 표시와 LADWP 체크 UI 회귀 검증');
