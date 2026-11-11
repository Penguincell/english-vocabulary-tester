// 复核：模块掌握判定 + 抽题构成 + 真实答题流程
const { launch, connect, evaluate, sleep } = require('./cdp.js');
const path = require('path'), fs = require('fs');
const URLIST = 'file:///C:/Users/12843/Desktop/%E8%AF%BE%E7%A8%8B%E8%B5%84%E6%96%99/cet4-vocab/index.html';

(async () => {
  const prof = path.join(__dirname, '..', '.edge-r18b');
  fs.rmSync(prof, { recursive: true, force: true });
  const { proc, target } = await launch({ url: URLIST, profile: prof });
  const page = target.find(t => t.type === 'page') || target[0];
  const cdp = await connect(page.webSocketDebuggerUrl);
  try {
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
    await sleep(900);
    await evaluate(cdp, `localStorage.clear(); location.reload()`).catch(()=>{});
    await sleep(1000);
    await evaluate(cdp, `document.querySelector('[data-book="cet4"]').click()`);
    await sleep(200);

    const mastery = await evaluate(cdp, `(() => {
      const mk = (d,m) => ({ d, m, nb:false, h:false, at:0 });
      const A = mk({t:1,c:0,w:1},{t:0,c:0,w:0});   // 默写欠 1
      const B = mk({t:1,c:1,w:0},{t:0,c:0,w:0});   // 默写已过，词义没考
      const C = mk({t:2,c:1,w:1},{t:1,c:1,w:0});   // 两模块都过
      const E = mk({t:3,c:1,w:2},{t:2,c:0,w:2});   // 两边都还欠
      return {
        A: [mastered(A,'dict'), mastered(A,'mean')],
        B: [mastered(B,'dict'), mastered(B,'mean')],
        C: [mastered(C,'dict'), mastered(C,'mean')],
        E: [mastered(E,'dict'), mastered(E,'mean')]
      };
    })()`);
    console.log('掌握判定 (dict,mean):', JSON.stringify(mastery));

    // 只留 3 个新词，其余都标记为已掌握 → 默写队列应包含这 3 个
    const queue = await evaluate(cdp, `(() => {
      STATE.stats = {};
      for (let i = 0; i < VOCAB.length; i++) {
        STATE.stats[i] = { d:{t:1,c:1,w:0}, m:{t:1,c:1,w:0}, nb:false, h:false, at: i };
      }
      delete STATE.stats[10]; delete STATE.stats[11]; delete STATE.stats[12];
      // 10 号欠 2 次错误
      STATE.stats[10] = { d:{t:4,c:1,w:3}, m:{t:1,c:1,w:0}, nb:true, h:false, at: 5 };
      // 11 号词义欠账，默写已过
      STATE.stats[11] = { d:{t:1,c:1,w:0}, m:{t:2,c:0,w:2}, nb:true, h:false, at: 6 };
      delete STATE.stats[12];
      const dq = buildQueue('dict'), mq = buildQueue('mean');
      const cnt = (arr) => {
        let fresh=0, review=0, done=0;
        arr.forEach(id => {
          const st = STATE.stats[id] || {d:{t:0,c:0,w:0},m:{t:0,c:0,w:0}};
          const m = modOf(st, 'dict');
          if (!m.t) fresh++; else if (m.c < m.w) review++; else done++;
        });
        return { fresh, review, done };
      };
      return {
        dq_has10: dq.indexOf(10)>=0, dq_has11: dq.indexOf(11)>=0, dq_has12: dq.indexOf(12)>=0,
        dq: cnt(dq),
        mq_has10: mq.indexOf(10)>=0, mq_has11: mq.indexOf(11)>=0, mq_has12: mq.indexOf(12)>=0
      };
    })()`);
    console.log('抽题构成:', JSON.stringify(queue));

    // 真实流程：一个词默写答错 → 生词本；再考一次答对 → 模块平衡
    const flow = await evaluate(cdp, `(() => {
      STATE.stats = {};
      const id = 20;
      APP.session = { mode:'dict', ids:[id], i:0, correct:0, wrong:0, skipped:0, records:[], startedAt:Date.now(), answered:false, hinted:false, selected:{} };
      APP.screen='dict'; render();
      document.querySelector('#answer').value = 'zzz';
      document.querySelector('[data-act="submit"]').click();
      return { d: STATE.stats[id].d, nb: STATE.stats[id].nb, mastered: mastered(STATE.stats[id],'dict') };
    })()`);
    console.log('默写答错:', JSON.stringify(flow));

    const flow2 = await evaluate(cdp, `(() => {
      const id = 20;
      APP.session = { mode:'dict', ids:[id], i:0, correct:0, wrong:0, skipped:0, records:[], startedAt:Date.now(), answered:false, hinted:false, selected:{} };
      APP.screen='dict'; render();
      document.querySelector('#answer').value = VOCAB[id].word;
      document.querySelector('[data-act="submit"]').click();
      return { d: STATE.stats[id].d, nb: STATE.stats[id].nb, mastered: mastered(STATE.stats[id],'dict'), meanMastered: mastered(STATE.stats[id],'mean') };
    })()`);
    console.log('默写再答对:', JSON.stringify(flow2));
  } finally {
    cdp.close(); proc.kill();
    await sleep(500);
    try { fs.rmSync(prof, { recursive: true, force: true, maxRetries: 6, retryDelay: 400 }); } catch(e){}
  }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
