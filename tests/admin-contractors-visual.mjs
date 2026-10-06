import puppeteer from '../tools/social-images/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import os from 'node:os';

const executablePath='C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser=await puppeteer.launch({headless:true,executablePath,args:['--no-sandbox']});
try{
  for(const width of [1280,390]){
    const page=await browser.newPage();
    await page.setViewport({width,height:850,deviceScaleFactor:1});
    await page.evaluateOnNewDocument(()=>{
      const contractor={contractorId:'CTR-20261006-0001',name:'JD Electric 자체시공 테스트 업체',phone:'213-555-0100',accessCode:'ACCESS-1234',contractStart:'2026-10-06',unitPrice:350,active:true,assigned:12,completed:9,averageDays:4,licenseNumber:'1059763',agreementAccepted:true,identityMethod:'관리자수동확인완료',licenseCopyLink:'https://example.com/license',bondCopyLink:'',businessProofLink:'https://example.com/proof',selfPerform:true};
      window.fetch=async(_url,options={})=>{let body={};try{body=JSON.parse(options.body||'{}')}catch{}const action=body.action;let result={success:true};if(action==='adminLogin')result={success:true,adminName:'대표님'};else if(action==='listContractors')result={success:true,contractors:[contractor]};else if(action==='updateContractor'){if(body.contractor&&typeof body.contractor.selfPerform==='boolean')contractor.selfPerform=body.contractor.selfPerform;}else if(action==='getDealers')result={success:true,dealers:[]};else if(action==='getLeads')result={success:true,leads:[]};else if(action==='getUnassignedCases')result={success:true,cases:[]};else if(action==='dashboard')result={success:true,summary:{statusCounts:{},contractors:[],delayed:[],missingConstructionContracts:[]}};else if(action==='getUnconfirmedPayments')result={success:true,payments:[]};else if(action==='getDealerFeeCases')result={success:true,cases:[]};else if(action==='getProgramStatuses')result={success:true,statuses:{}};else if(action==='listAdmins')result={success:true,admins:[]};else if(action==='getEmailQuota')result={success:true,remaining:100};return {ok:true,text:async()=>JSON.stringify(result),json:async()=>result};};
    });
    await page.goto(pathToFileURL(path.resolve('admin.html')).href,{waitUntil:'domcontentloaded'});
    await page.type('#password','test');
    await page.click('#loginBtn');
    await page.waitForSelector('.selfPerformToggle',{timeout:5000});
    await page.click('[data-tab="contractors"]');
    const metrics=await page.evaluate(()=>{const table=document.querySelector('.contractor-performance-table'),wrap=table.closest('.scroll'),first=table.querySelector('tbody td'),headers=[...table.querySelectorAll('th')];return {tableWidth:table.scrollWidth,wrapWidth:wrap.clientWidth,scrollable:wrap.scrollWidth>wrap.clientWidth,firstPosition:getComputedStyle(first).position,headerWhiteSpace:getComputedStyle(headers[0]).whiteSpace,widths:headers.map(x=>Math.round(x.getBoundingClientRect().width)),label:document.querySelector('.self-perform-control label span').textContent,badge:document.querySelector('.self-perform-badge').textContent};});
    if(!metrics.scrollable||metrics.firstPosition!=='sticky'||metrics.headerWhiteSpace!=='nowrap'||metrics.label!=='자체시공으로 지정'||metrics.badge!=='자체시공')throw Error(width+'px 시각 검증 실패: '+JSON.stringify(metrics));
    if(width===1280){await page.click('.selfPerformToggle');await page.waitForFunction(()=>document.querySelector('.self-perform-badge')?.textContent==='외부 업체');const persisted=await page.$eval('.selfPerformToggle',box=>!box.checked);if(!persisted)throw Error('자체시공 저장 후 재조회 값이 반영되지 않았습니다.');}
    const screenshot=path.join(os.tmpdir(),'clean-ev-contractors-'+width+'.png');
    await page.screenshot({path:screenshot,fullPage:true});
    console.log(width+'px 검증 통과: '+JSON.stringify(metrics));
    console.log('스크린샷: '+screenshot);
    await page.close();
  }
}finally{await browser.close();}
