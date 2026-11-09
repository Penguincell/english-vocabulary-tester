// Deterministic 25-question run
const { launch, connect, evaluate, shot, sleep } = require('./cdp.js');
const path = require('path');
const fs = require('fs');
const URLIST = 'file:///C:/Users/12843/Desktop/%E8%AF%BE%E7%A8%8B%E8%B5%84%E6%96%99/cet4-vocab/index.html';

(async () => {
  const prof = path.join(__dirname, '..', '.edge-final');
  fs.rmSync(prof, { recursive: true, force: true });
  const { proc, target } = await launch({ url: URLIST, profile: prof, width: 1200, height: 880 });
  const page = target.find((t) => t.type === 'page') || target[0];
  const cdp = await connect(page.webSocketDebuggerUrl);
  try {
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
    await sleep(900);

    // 入口是词书页，先选四级
    await evaluate(cdp, `document.querySelector('[data-book="cet4"]').click()`);
    await sleep(250);

    await evaluate(cdp, `document.querySelector('[data-start="dict"]').click()`);
    await sleep(250);

    for (let k = 1; k <= 25; k++) {
      const before = await evaluate(cdp, `({screen: APP.screen, i: APP.session.i, total: APP.session.ids.length})`);
      if (before.screen !== 'dict') { console.log('left dict at', k); break; }
      // if a pending next button exists from a previous wrong answer, press it first
      const hasNext = await evaluate(cdp, `!!document.querySelector('[data-act="next"]')`);
      if (hasNext) {
        await evaluate(cdp, `document.querySelector('[data-act="next"]').click()`);
        await sleep(200);
      }
      const q = await evaluate(cdp, `({i: APP.session.i, answered: APP.session.answered, word: VOCAB[APP.session.ids[APP.session.i]].word})`);
      if (q.answered) { await evaluate(cdp, `document.querySelector('[data-act="next"]').click()`); await sleep(200); continue; }
      if (k === 2 || k === 3) {
        await evaluate(cdp, `document.querySelector('#answer').value = 'zzz'`);
        await evaluate(cdp, `document.querySelector('[data-act="submit"]').click()`);
        await sleep(260);
        const nb = await evaluate(cdp, `notebookCount()`);
        if (k === 2) console.log('after wrong #1 notebook =', nb);
        await evaluate(cdp, `document.querySelector('[data-act="next"]').click()`);
        await sleep(240);
      } else if (k === 4) {
        await evaluate(cdp, `document.querySelector('[data-act="hint"]').click()`);
        await sleep(120);
        const hinted = await evaluate(cdp, `({hint: document.querySelector('.hint-text') ? document.querySelector('.hint-text').textContent : null, nb: notebookCount()})`);
        console.log('hint shown:', JSON.stringify(hinted));
        await evaluate(cdp, `document.querySelector('#answer').value = ${JSON.stringify(q.word)}`);
        await evaluate(cdp, `document.querySelector('[data-act="submit"]').click()`);
        await sleep(900); // auto-advance
      } else {
        await evaluate(cdp, `document.querySelector('#answer').value = ${JSON.stringify(q.word)}`);
        await evaluate(cdp, `document.querySelector('[data-act="submit"]').click()`);
        await sleep(900); // auto-advance
      }
    }
    await sleep(500);
    console.log('final screen:', await evaluate(cdp, `APP.screen`));
    console.log('session:', JSON.stringify(await evaluate(cdp, `STATE.sessions[STATE.sessions.length-1]`)));
    console.log('notebook:', await evaluate(cdp, `notebookCount()`));
    console.log('notebook detail:', JSON.stringify(await evaluate(cdp, `Object.keys(STATE.stats).filter(k=>STATE.stats[k].nb).map(k=>({id:k,w:STATE.stats[k].w,h:STATE.stats[k].h,t:STATE.stats[k].t}))`)));
    await shot(cdp, path.join(__dirname, '..', 'final-result.png'));

    // meaning mode 3 questions（全对后自动跳题，不再点「下一题」）
    await evaluate(cdp, `APP.screen='home'; render()`);
    await sleep(200);
    await evaluate(cdp, `document.querySelector('[data-start="mean"]').click()`);
    await sleep(350);
    for (let k = 0; k < 3; k++) {
      const i0 = await evaluate(cdp, `APP.session.i`);
      await evaluate(cdp, `(() => { const q=APP.session.q; q.options.forEach((o,i)=>{ if(o.correct) APP.session.selected[i]=true; }); render(); document.querySelector('[data-act="submit"]').click(); })()`);
      await sleep(950); // 等自动跳转
      const i1 = await evaluate(cdp, `APP.session.i`);
      console.log('  meaning Q' + (k + 1) + ': 提交后自动从 i=' + i0 + ' 跳到 i=' + i1);
    }
    console.log('mean page ok:', await evaluate(cdp, `APP.screen === 'mean' && document.querySelectorAll('.opt').length === 5`));
  } finally {
    cdp.close(); proc.kill();
    await sleep(600);
    try { fs.rmSync(prof, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }); } catch (e) { /* 浏览器可能仍占用 */ }
  }
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
