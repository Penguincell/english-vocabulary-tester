// Minimal Chrome DevTools Protocol driver (no dependencies).
const { spawn } = require('child_process');
const http = require('http');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

function getJSON(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => {
        try { resolve(JSON.parse(d)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function launch({ port = 9333, url, width = 1180, height = 900, profile }) {
  const args = [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=' + port,
    '--user-data-dir=' + profile,
    '--window-size=' + width + ',' + height,
    url,
  ];
  const proc = spawn(EDGE, args, { stdio: 'ignore', detached: false });
  let target = null;
  for (let i = 0; i < 60; i++) {
    await sleep(300);
    try {
      target = await getJSON('http://127.0.0.1:' + port + '/json');
      if (target && target.length) break;
    } catch (e) { /* not up yet */ }
  }
  if (!target) throw new Error('browser did not start');
  return { proc, target };
}

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const pending = new Map();
    let id = 0;
    ws.addEventListener('open', () => {
      resolve({
        send(method, params) {
          const mid = ++id;
          ws.send(JSON.stringify({ id: mid, method, params: params || {} }));
          return new Promise((res, rej) => pending.set(mid, { res, rej }));
        },
        close() { ws.close(); },
        on(fn) { ws.addEventListener('message', fn); },
        raw: ws,
      });
    });
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        const p = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) p.rej(new Error(JSON.stringify(msg.error)));
        else p.res(msg.result);
      }
    });
    ws.addEventListener('error', reject);
  });
}

async function evaluate(cdp, expr) {
  const r = await cdp.send('Runtime.evaluate', {
    expression: expr, returnByValue: true, awaitPromise: true, userGesture: true,
  });
  if (r.exceptionDetails) {
    throw new Error('JS error: ' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text));
  }
  return r.result.value;
}

async function shot(cdp, file) {
  const r = await cdp.send('Page.captureScreenshot', { format: 'png' });
  require('fs').writeFileSync(file, Buffer.from(r.data, 'base64'));
}

module.exports = { launch, connect, evaluate, shot, sleep };
