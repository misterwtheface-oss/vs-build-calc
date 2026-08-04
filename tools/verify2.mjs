const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const OUT   = 'C:\\Users\\miste\\AppData\\Local\\Temp\\claude\\C--Users-miste-claude-workspace\\bd0c2538-53a4-42f5-be91-1f251af3e134\\scratchpad';
const { spawn } = await import('child_process');
const { writeFileSync } = await import('fs');
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
const browser = spawn(EDGE, ['--headless=new','--no-sandbox','--remote-debugging-port=9228','--window-size=1280,800','--hide-scrollbars','about:blank']);
await sleep(2000);
const { default: http } = await import('http');
const targets = await new Promise((res,rej) => { http.get('http://localhost:9228/json', r => { let d=''; r.on('data',c=>d+=c); r.on('end',()=>res(JSON.parse(d))); }).on('error',rej); });
const ws = new WebSocket(targets.find(t=>t.type==='page')?.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r, {once:true}));
let mid=1; const pending=new Map();
ws.addEventListener('message', ({data:raw}) => { const m=JSON.parse(raw); if(m.id&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);} });
const send = (method,params={}) => new Promise((res,rej) => { const id=mid++; pending.set(id,m=>m.error?rej(new Error(JSON.stringify(m.error))):res(m.result)); ws.send(JSON.stringify({id,method,params})); });
const ss = async name => { await sleep(800); const {data}=await send('Page.captureScreenshot',{format:'png'}); writeFileSync(`${OUT}\\${name}.png`,Buffer.from(data,'base64')); console.log(name); };
const click = expr => send('Runtime.evaluate', {expression: `document.querySelector('${expr}')?.click()`});
await send('Page.enable'); await send('Runtime.enable');
await send('Page.navigate', {url:'http://localhost:8080'}); await sleep(1800);
await click('[data-count="1"]'); await sleep(1200);
await ss('v_plan_empty_sidebar');
// select Antonio via char overlay
await click('[data-type="char"][data-action="open-slot"]'); await sleep(1200);
await send('Runtime.evaluate', {expression: `document.querySelector('.char-card[data-char="Antonio Belpaese"]')?.click()`}); await sleep(400);
await click('[data-action="ovl-confirm"]'); await sleep(1200);
// left-click the char slot to show info sidebar
await click('[data-type="char"][data-action="view-slot"]'); await sleep(800);
await ss('v_sidebar_char');
// left-click the starter weapon slot
await click('.slot-locked'); await sleep(800);
await ss('v_sidebar_weapon');
ws.close(); browser.kill(); console.log('done');
