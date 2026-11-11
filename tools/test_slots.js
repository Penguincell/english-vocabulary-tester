// 验证横线：输入阶段不区分对错（全绿），只有超长/提交错误后才变红
const { launch, connect, evaluate, shot, sleep } = require('./cdp.js');
const path = require('path'), fs = require('fs');
const URLIST = 'file:///C:/Users/12843/Desktop/%E8%AF%BE%E7%A8%8B%E8%B5%84%E6%96%99/cet4-vocab/index.html';

(async () => {
  const prof = path.join(__dirname, '..', '.edge-slot2');
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

    const setup = (word) => `
      (() => {
        const id = VOCAB.findIndex(v => v.word === ${JSON.stringify(word)});
        APP.session = { mode:'dict', ids:[id>=0?id:0], i:0, correct:0, wrong:0, skipped:0, records:[], startedAt:Date.now(), answered:false, hinted:false, selected:{} };
        APP.screen='dict'; render();
      })()`;
    const type = (v) => `
      (() => { const el=document.querySelector('#answer'); el.value=${JSON.stringify(v)}; el.dispatchEvent(new Event('input',{bubbles:true})); })()`;
    const snap = `(() => Array.from(document.querySelectorAll('#slots .slot')).map(e => e.className.replace(/^slot\\s*/,'') + ':' + (e.textContent||'_')).join(' | '))()`;

    // 目标词 formation（第 9 个位置输入错误字母）
    await evaluate(cdp, setup('formation'));
    await evaluate(cdp, type('formati'));
    log('正确前缀 formati  ->', await evaluate(cdp, snap));
    await evaluate(cdp, type('formativ'));
    log('错误字母 formativ ->', await evaluate(cdp, snap), '（应全绿，不暴露错误位置）');
    await evaluate(cdp, type('formationxy'));
    log('超长 formationxy  ->', await evaluate(cdp, snap), '（应整排红）');
    await evaluate(cdp, type('formati'));
    log('删回 formati      ->', await evaluate(cdp, snap), '（应恢复绿色）');

    // 提交错误 → 逐位标红
    await evaluate(cdp, setup('formation'));
    await evaluate(cdp, type('formativ'));
    const wrong = await evaluate(cdp, `(() => {
      document.querySelector('[data-act="submit"]').click();
      return Array.from(document.querySelectorAll('#slots .slot')).map(e => e.className.replace(/^slot\\s*/,'') + ':' + (e.textContent||'_')).join(' | ');
    })()`);
    log('提交错误后        ->', wrong, '（错位应标 bad）');

    // 截图：输入阶段（错误字母也应当是绿色）
    await evaluate(cdp, setup('formation'));
    await evaluate(cdp, type('formativ'));
    await sleep(150);
    await shot(cdp, path.join(__dirname, '..', 'docs', 'screenshot-dict-typing.png'));

    // 截图：提交错误
    await evaluate(cdp, `document.querySelector('[data-act="submit"]').click()`);
    await sleep(200);
    await shot(cdp, path.join(__dirname, '..', 'docs', 'screenshot-dict-wrong.png'));
  } finally {
    cdp.close(); proc.kill();
    await sleep(500);
    try { fs.rmSync(prof, { recursive: true, force: true, maxRetries: 6, retryDelay: 400 }); } catch(e){}
  }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
