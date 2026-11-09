// Verify meaning auto-advance + empty-submit guard + double-Enter safety
const { launch, connect, evaluate, sleep } = require('./cdp.js');
const path = require('path');
const fs = require('fs');
const URLIST = 'file:///C:/Users/12843/Desktop/%E8%AF%BE%E7%A8%8B%E8%B5%84%E6%96%99/cet4-vocab/index.html';

(async () => {
  const prof = path.join(__dirname, '..', '.edge-adv');
  fs.rmSync(prof, { recursive: true, force: true });
  const { proc, target } = await launch({ url: URLIST, profile: prof, width: 1200, height: 900 });
  const page = target.find((t) => t.type === 'page') || target[0];
  const cdp = await connect(page.webSocketDebuggerUrl);
  const log = (...a) => console.log(...a);
  try {
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
    await sleep(900);
    await evaluate(cdp, `localStorage.clear(); location.reload()`).catch(() => {});
    await sleep(1100);
    await evaluate(cdp, `document.querySelector('[data-book="cet4"]').click()`);
    await sleep(250);
    await evaluate(cdp, `document.querySelector('[data-start="mean"]').click()`);
    await sleep(400);

    // 1) 全对 -> 自动跳转
    await evaluate(cdp, `(() => { const q=APP.session.q; q.options.forEach((o,i)=>{ if(o.correct) APP.session.selected[i]=true; }); render(); document.querySelector('[data-act="submit"]').click(); })()`);
    await sleep(250);
    const mid = await evaluate(cdp, `({i: APP.session.i, answered: APP.session.answered, fb: document.querySelector('.feedback').textContent})`);
    await sleep(900);
    const after = await evaluate(cdp, `({i: APP.session.i, answered: APP.session.answered, correct: APP.session.correct, wrong: APP.session.wrong})`);
    log('全对提交:', JSON.stringify(mid));
    log('自动跳转后:', JSON.stringify(after));

    // 2) 空提交 -> 不判错、不跳题
    const i0 = await evaluate(cdp, `APP.session.i`);
    await evaluate(cdp, `document.querySelector('[data-act="submit"]').click()`);
    await sleep(500);
    const empty = await evaluate(cdp, `({i: APP.session.i, answered: APP.session.answered, wrong: APP.session.wrong, toast: document.querySelector('#toast').textContent})`);
    log('空提交:', JSON.stringify(empty), '(提交前 i=' + i0 + ')');

    // 3) 选错一项 -> 判错并停留
    await evaluate(cdp, `(() => { const q=APP.session.q; const wi=q.options.findIndex(o=>!o.correct); APP.session.selected[wi]=true; render(); document.querySelector('[data-act="submit"]').click(); })()`);
    await sleep(1100);
    const wrong = await evaluate(cdp, `({i: APP.session.i, answered: APP.session.answered, wrong: APP.session.wrong, hasNext: !!document.querySelector('[data-act="next"]')})`);
    log('选错:', JSON.stringify(wrong));

    // 4) 手动下一题
    await evaluate(cdp, `document.querySelector('[data-act="next"]').click()`);
    await sleep(300);
    log('点下一题后 i =', await evaluate(cdp, `APP.session.i`));

    // 5) 连按回车（全对后）不应误判下一题
    await evaluate(cdp, `(() => { const q=APP.session.q; q.options.forEach((o,i)=>{ if(o.correct) APP.session.selected[i]=true; }); render(); document.querySelector('[data-act="submit"]').click(); document.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter'})); document.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter'})); })()`);
    await sleep(1300);
    log('连按回车后:', JSON.stringify(await evaluate(cdp, `({i: APP.session.i, wrong: APP.session.wrong, correct: APP.session.correct})`)));

    // 6) 最后一题全对 -> 结果页
    await evaluate(cdp, `(() => { const s=APP.session; s.i=s.ids.length-1; s.answered=false; s.selected={}; s.q=null; render(); })()`);
    await sleep(250);
    await evaluate(cdp, `(() => { const q=APP.session.q; q.options.forEach((o,i)=>{ if(o.correct) APP.session.selected[i]=true; }); render(); document.querySelector('[data-act="submit"]').click(); })()`);
    await sleep(1200);
    log('最后一题:', await evaluate(cdp, `APP.screen`), 'sessions =', await evaluate(cdp, `STATE.sessions.length`));
  } finally {
    cdp.close(); proc.kill();
    await sleep(600);
    try { fs.rmSync(prof, { recursive: true, force: true, maxRetries: 6, retryDelay: 400 }); } catch (e) {}
  }
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
