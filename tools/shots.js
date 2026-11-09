// Capture final screenshots: meaning question (key), dictation with hint, notebook
const { launch, connect, evaluate, shot, sleep } = require('./cdp.js');
const path = require('path');
const fs = require('fs');
const URLIST = 'file:///C:/Users/12843/Desktop/%E8%AF%BE%E7%A8%8B%E8%B5%84%E6%96%99/cet4-vocab/index.html';

(async () => {
  const prof = path.join(__dirname, '..', '.edge-shots');
  fs.rmSync(prof, { recursive: true, force: true });
  const { proc, target } = await launch({ url: URLIST, profile: prof, width: 1200, height: 900 });
  const page = target.find((t) => t.type === 'page') || target[0];
  const cdp = await connect(page.webSocketDebuggerUrl);
  try {
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
    await sleep(900);
    await evaluate(cdp, `localStorage.clear(); location.reload()`).catch(() => {});
    await sleep(1100);

    // key question
    await evaluate(cdp, `(() => {
      const id = VOCAB.findIndex(v => v.word.toLowerCase() === 'key');
      APP.session = { mode:'mean', ids:[id], i:0, correct:0, wrong:0, skipped:0, records:[], startedAt:Date.now(), answered:false, hinted:false, selected:{}, q:null };
      APP.screen='mean'; render();
    })()`);
    await sleep(300);
    await shot(cdp, path.join(__dirname, '..', 'docs', 'screenshot-meaning.png'));

    // dictation with hint used
    await evaluate(cdp, `(() => {
      const id = VOCAB.findIndex(v => v.word.toLowerCase() === 'discover');
      APP.session = { mode:'dict', ids:[id], i:0, correct:0, wrong:0, skipped:0, records:[], startedAt:Date.now(), answered:false, hinted:true, selected:{} };
      APP.screen='dict'; render();
    })()`);
    await sleep(300);
    await shot(cdp, path.join(__dirname, '..', 'docs', 'screenshot-dictation.png'));

    // home
    await evaluate(cdp, `APP.session=null; APP.screen='home'; render()`);
    await sleep(250);
    await shot(cdp, path.join(__dirname, '..', 'docs', 'screenshot-home.png'));

    // mobile meaning
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await sleep(300);
    await evaluate(cdp, `(() => {
      const id = VOCAB.findIndex(v => v.word.toLowerCase() === 'key');
      APP.session = { mode:'mean', ids:[id], i:0, correct:0, wrong:0, skipped:0, records:[], startedAt:Date.now(), answered:false, hinted:false, selected:{}, q:null };
      APP.screen='mean'; render();
    })()`);
    await sleep(300);
    await shot(cdp, path.join(__dirname, '..', 'docs', 'screenshot-mobile.png'));
    await cdp.send('Emulation.clearDeviceMetricsOverride');
  } finally {
    cdp.close(); proc.kill();
    await sleep(600);
    try { fs.rmSync(prof, { recursive: true, force: true, maxRetries: 6, retryDelay: 400 }); } catch (e) {}
  }
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
