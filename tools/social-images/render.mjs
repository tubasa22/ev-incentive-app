import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const toolDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(toolDir, '..', '..');
const outputDir = path.join(projectDir, 'assets', 'social');
const chromeCandidates = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium'
].filter(Boolean);
const executablePath = chromeCandidates.find(existsSync);

if (!executablePath) throw new Error('Chrome 또는 Edge 실행 파일을 찾을 수 없습니다. CHROME_PATH를 지정해주세요.');
mkdirSync(outputDir, { recursive: true });

const jobs = [
  { html: 'profile.html', output: 'profile-1000x1000.png', width: 1000, height: 1000 },
  { html: 'cover.html', output: 'cover-1640x624.png', width: 1640, height: 624 },
  { html: 'share.html', output: 'share-1200x630.png', width: 1200, height: 630 }
];

function readPngSize(filePath) {
  const data = readFileSync(filePath);
  const signature = data.subarray(1, 4).toString('ascii');
  if (signature !== 'PNG') throw new Error(`${filePath}는 PNG 파일이 아닙니다.`);
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
}

const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--allow-file-access-from-files'] });
try {
  for (const job of jobs) {
    const page = await browser.newPage();
    await page.setViewport({ width: job.width, height: job.height, deviceScaleFactor: 1 });
    await page.goto(pathToFileURL(path.join(toolDir, job.html)).href, { waitUntil: 'networkidle0', timeout: 60000 });
    await page.evaluate(async () => { await document.fonts.ready; });
    const fontStatus = await page.evaluate(() => ({ loaded: document.fonts.check('800 32px Pretendard'), family: getComputedStyle(document.body).fontFamily }));
    const outputPath = path.join(outputDir, job.output);
    await page.screenshot({ path: outputPath, type: 'png', captureBeyondViewport: false });
    const actual = readPngSize(outputPath);
    if (actual.width !== job.width || actual.height !== job.height) {
      throw new Error(`${job.output} 해상도 불일치: ${actual.width}x${actual.height}`);
    }
    await page.close();
    console.log(`${job.output}: ${actual.width}x${actual.height}, Pretendard=${fontStatus.loaded}, font=${fontStatus.family}`);
  }
} finally {
  await browser.close();
}

