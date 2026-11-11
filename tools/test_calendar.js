// 验证生词本日历筛选
const { launch, connect, evaluate, shot, sleep } = require('./cdp.js');
const path = require('path'), fs = require('fs');
const URLIST = 'file:///C:/Users/12843/Desktop/%E8%AF%BE%E7%A8%8B%E8%B5%84%E6%96%99/cet4-vocab/index.html';

(async () => {
  const prof = path.join(__dirname, '..', '.edge-cal');
  fs.rmSync(prof, { recursive: true, force: true });
  const { proc, target } = await launch({ url: URLIST, profile: prof, width: 1200, height: 950 });
  const page = target.find(t => t.type === 'page') || target[0];
  const cdp = await connect(page.webSocketDebuggerUrl);
  const log = (...a) => console.log(...a);
  try {
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
    await sleep(900);
    await evaluate(cdp, `localStorage.clear(); location.reload()`).catch(()=>{});
    await sleep(1000);
    await evaluate(cdp, `document.querySelector('[data-book="cet4"]').click()`);
    await sleep(200);

    // 造跨月数据：今天、上个月 15 号、上上个月 3 号
    await evaluate(cdp, `(() => {
      const now = new Date();
      const today = Date.now();
      const mkKey = (y, m, d) => new Date(y, m, d, 12, 0, 0).getTime();
      const prev = new Date(now.getFullYear(), now.getMonth() - 1, 15, 12).getTime();
      const prev2 = new Date(now.getFullYear(), now.getMonth() - 2, 3, 12).getTime();
      STATE.stats = {};
      const mk = (id, nbAt, w) => STATE.stats[id] = { d:{t:w+1,c:1,w}, m:{t:0,c:0,w:0}, nb:true, h:false, at:nbAt, nbAt };
      mk(0, today, 2); mk(1, today, 1);
      mk(2, prev, 1);
      mk(3, prev2, 3);
      APP.nbDay = null; APP.screen = 'notebook'; render();
    })()`);
    await sleep(250);
    log('初始:', JSON.stringify(await evaluate(cdp, `({chips: Array.from(document.querySelectorAll('.daychip')).map(b=>b.textContent.trim()), items: document.querySelectorAll('.nb-item').length})`)));

    // 打开日历
    const opened = await evaluate(cdp, `(() => {
      document.querySelector('[data-cal-toggle]').click();
      return { open: APP.calOpen, title: document.querySelector('.cal-title').textContent,
               nextDisabled: document.querySelector('[data-cal-next]').disabled,
               days: document.querySelectorAll('button.cal-cell').length,
               offDays: document.querySelectorAll('.cal-cell.off').length };
    })()`);
    log('打开日历:', JSON.stringify(opened));
    await shot(cdp, path.join(__dirname, '..', 'docs', 'screenshot-notebook-calendar.png'));

    // 翻到上个月
    const prev = await evaluate(cdp, `(() => {
      document.querySelector('[data-cal-prev]').click();
      return { title: document.querySelector('.cal-title').textContent, nextDisabled: document.querySelector('[data-cal-next]').disabled };
    })()`);
    log('上个月:', JSON.stringify(prev));

    // 点上个月 15 号
    const pick = await evaluate(cdp, `(() => {
      const day = Array.from(document.querySelectorAll('[data-cal-day]')).find(b => b.textContent === '15');
      const key = day.getAttribute('data-cal-day');
      day.click();
      return { key: key, open: APP.calOpen, nbDay: APP.nbDay,
               items: document.querySelectorAll('.nb-item').length,
               chips: Array.from(document.querySelectorAll('.daychip')).map(b=>b.textContent.trim()),
               header: document.querySelector('.nb-head div div').textContent };
    })()`);
    log('选中上月15号:', JSON.stringify(pick));
    await shot(cdp, path.join(__dirname, '..', 'docs', 'screenshot-notebook-filtered.png'));

    // 未来日期不可点
    const future = await evaluate(cdp, `(() => {
      document.querySelector('[data-cal-toggle]').click();   // 重新打开
      const offs = document.querySelectorAll('.cal-cell.off');
      const last = offs.length ? offs[offs.length - 1] : null;
      return { open: APP.calOpen, offCount: offs.length, lastIsSpan: last ? last.tagName : null };
    })()`);
    log('未来日期:', JSON.stringify(future));

    // 清除筛选
    const cleared = await evaluate(cdp, `(() => {
      const b = document.querySelector('[data-cal-clear]');
      b.click();
      return { nbDay: APP.nbDay, items: document.querySelectorAll('.nb-item').length };
    })()`);
    log('清除筛选:', JSON.stringify(cleared));
  } finally {
    cdp.close(); proc.kill();
    await sleep(500);
    try { fs.rmSync(prof, { recursive: true, force: true, maxRetries: 6, retryDelay: 400 }); } catch(e){}
  }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
