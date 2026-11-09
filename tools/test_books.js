// Verify: books screen + new queue rules
const { launch, connect, evaluate, shot, sleep } = require('./cdp.js');
const path = require('path');
const fs = require('fs');
const URLIST = 'file:///C:/Users/12843/Desktop/%E8%AF%BE%E7%A8%8B%E8%B5%84%E6%96%99/cet4-vocab/index.html';

(async () => {
  const prof = path.join(__dirname, '..', '.edge-books');
  fs.rmSync(prof, { recursive: true, force: true });
  const { proc, target } = await launch({ url: URLIST, profile: prof, width: 1200, height: 950 });
  const page = target.find((t) => t.type === 'page') || target[0];
  const cdp = await connect(page.webSocketDebuggerUrl);
  const log = (...a) => console.log(...a);
  try {
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
    await sleep(900);
    await evaluate(cdp, `localStorage.clear(); location.reload()`).catch(() => {});
    await sleep(1100);

    // 1) 入口是词书页
    const s0 = await evaluate(cdp, `({
      screen: APP.screen,
      books: Array.from(document.querySelectorAll('.book-card')).map(b => b.className + '|' + b.textContent.replace(/\\s+/g,' ').trim().slice(0,40))
    })`);
    log('① 初始页面:', JSON.stringify(s0));
    await shot(cdp, path.join(__dirname, '..', 'docs', 'screenshot-books.png'));

    // 2) 点击未上线的词书 -> 提示，且不跳转
    await evaluate(cdp, `document.querySelectorAll('.book-card')[1].click()`);
    await sleep(250);
    const s1 = await evaluate(cdp, `({screen: APP.screen, toast: document.querySelector('#toast').textContent})`);
    log('② 点六级:', JSON.stringify(s1));
    await evaluate(cdp, `document.querySelectorAll('.book-card')[2].click()`);
    await sleep(250);
    log('   点高考:', JSON.stringify(await evaluate(cdp, `({screen: APP.screen, toast: document.querySelector('#toast').textContent})`)));

    // 3) 点击四级 -> 进入首页
    await evaluate(cdp, `document.querySelectorAll('.book-card')[0].click()`);
    await sleep(300);
    const s2 = await evaluate(cdp, `({screen: APP.screen, book: APP.book, modes: document.querySelectorAll('.mode').length})`);
    log('③ 点四级:', JSON.stringify(s2));

    // 4) 全新状态：25 题应全是新词
    const q0 = await evaluate(cdp, `(() => {
      const ids = buildQueue('dict');
      let fresh=0, nb=0, settled=0;
      ids.forEach(id => { const s = STATE.stats[id]; if (!s || !s.t) fresh++; else if (s.nb) nb++; else settled++; });
      return { total: ids.length, fresh, notebook: nb, settled };
    })()`);
    log('④ 全新队列:', JSON.stringify(q0));

    // 5) 造数据：3 个生词 + 10 个已答对 + 其余新词
    const q1 = await evaluate(cdp, `(() => {
      STATE.stats = {};
      for (let i = 0; i < 3; i++) STATE.stats[i] = { t: 2, w: 1 + i, h: i === 2, nb: true, last: 'err', at: 1000 + i };
      for (let i = 3; i < 13; i++) STATE.stats[i] = { t: 1, w: 0, h: false, nb: false, last: 'ok', at: 2000 + i };
      const ids = buildQueue('dict');
      let fresh=0, nb=0, settled=0, nbIds=[];
      ids.forEach(id => { const s = STATE.stats[id]; if (!s || !s.t) fresh++; else if (s.nb) { nb++; nbIds.push(id); } else settled++; });
      return { total: ids.length, fresh, notebook: nb, settled, nbIds };
    })()`);
    log('⑤ 生词3个时:', JSON.stringify(q1));

    // 6) 生词 8 个 -> 只取 5 个，其余 20 新词
    const q2 = await evaluate(cdp, `(() => {
      STATE.stats = {};
      for (let i = 0; i < 8; i++) STATE.stats[i] = { t: 3, w: 8 - i, h: false, nb: true, last: 'err', at: 1000 + i };
      for (let i = 8; i < 20; i++) STATE.stats[i] = { t: 1, w: 0, h: false, nb: false, last: 'ok', at: 2000 + i };
      const ids = buildQueue('dict');
      let fresh=0, nb=0, settled=0, nbIds=[];
      ids.forEach(id => { const s = STATE.stats[id]; if (!s || !s.t) fresh++; else if (s.nb) { nb++; nbIds.push(id); } else settled++; });
      return { total: ids.length, fresh, notebook: nb, settled, nbIds: nbIds.sort((a,b)=>a-b) };
    })()`);
    log('⑥ 生词8个时:', JSON.stringify(q2), '(应 notebook=5, fresh=20, settled=0, nbIds 取错误多的 0-4)');

    // 7) 生词 0、已答对 30 个 -> 全取新词，不回收已答对
    const q3 = await evaluate(cdp, `(() => {
      STATE.stats = {};
      for (let i = 0; i < 30; i++) STATE.stats[i] = { t: 1, w: 0, h: false, nb: false, last: 'ok', at: 2000 + i };
      const ids = buildQueue('dict');
      let fresh=0, nb=0, settled=0;
      ids.forEach(id => { const s = STATE.stats[id]; if (!s || !s.t) fresh++; else if (s.nb) nb++; else settled++; });
      return { total: ids.length, fresh, notebook: nb, settled };
    })()`);
    log('⑦ 无生词+30已答对:', JSON.stringify(q3), '(应 fresh=25, settled=0)');

    // 8) 新词耗尽（全库都考过且答对）-> 才回收
    const q4 = await evaluate(cdp, `(() => {
      STATE.stats = {};
      const idsAll = VOCAB.map((v,i)=>i);
      idsAll.forEach(i => { STATE.stats[i] = { t: 1, w: 0, h: false, nb: false, last: 'ok', at: 2000 + i }; });
      const ids = buildQueue('dict');
      return { total: ids.length, distinct: new Set(ids).size };
    })()`);
    log('⑧ 全库考完:', JSON.stringify(q4));

    // 9) 首页点「← 词书」回到词书页
    await evaluate(cdp, `localStorage.clear(); location.reload()`).catch(() => {});
    await sleep(1000);
    await evaluate(cdp, `document.querySelector('[data-book="cet4"]').click()`);
    await sleep(200);
    await evaluate(cdp, `document.querySelector('[data-nav="books"]').click()`);
    await sleep(250);
    log('⑨ 返回词书页:', JSON.stringify(await evaluate(cdp, `({screen: APP.screen, cards: document.querySelectorAll('.book-card').length})`)));

    // 手机视图
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await sleep(300);
    await shot(cdp, path.join(__dirname, '..', 'docs', 'screenshot-books-mobile.png'));
    await cdp.send('Emulation.clearDeviceMetricsOverride');
  } finally {
    cdp.close(); proc.kill();
    await sleep(600);
    try { fs.rmSync(prof, { recursive: true, force: true, maxRetries: 6, retryDelay: 400 }); } catch (e) {}
  }
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
