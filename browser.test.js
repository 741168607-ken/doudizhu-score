const assert = require('node:assert/strict');
const wait = ms => new Promise(r => setTimeout(r, ms));

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); this.errors = []; ws.onmessage = e => { const msg = JSON.parse(e.data); if (msg.id && this.pending.has(msg.id)) { const {resolve,reject} = this.pending.get(msg.id); this.pending.delete(msg.id); msg.error ? reject(msg.error) : resolve(msg.result); } if (msg.method === 'Runtime.exceptionThrown') this.errors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text); }; }
  send(method, params = {}) { return new Promise((resolve,reject) => { const id = ++this.id; this.pending.set(id,{resolve,reject}); this.ws.send(JSON.stringify({id,method,params})); }); }
  async eval(expression) { const r = await this.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true}); if (r.exceptionDetails) throw new Error(r.exceptionDetails.text); return r.result.value; }
}
async function main() {
  const targets = await (await fetch('http://127.0.0.1:9222/json')).json();
  const page = targets.find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);
  const c = new CDP(ws); await c.send('Page.enable'); await c.send('Runtime.enable');
  async function navigate(initScript) { const init = initScript ? await c.send('Page.addScriptToEvaluateOnNewDocument',{source:initScript}) : null; await c.send('Page.navigate',{url:'http://127.0.0.1:8080'}); await wait(500); if(init) await c.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:init.identifier}); }
  async function viewport(width,height=900) { await c.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<768}); await wait(100); }
  async function click(selector) { await c.eval(`document.querySelector(${JSON.stringify(selector)}).click()`); }
  async function stored() { return c.eval(`JSON.parse(localStorage.getItem('beef-noodles-ddj-v1')).state`); }
  async function waitFor(read, timeout=6000) { const start=Date.now(); while(Date.now()-start<timeout){ if(await read()) return; await wait(100); } throw new Error('等待页面状态超时: '+JSON.stringify(await stored())); }
  await viewport(390); await navigate(`localStorage.clear()`);
  assert.equal(await c.eval(`document.getElementById('modalBackdrop').hidden`),true);
  for (const [width,height] of [[320,568],[360,640],[375,667],[390,844],[412,915],[430,932],[768,1024],[1280,900]]) {
    await viewport(width,height);
    const size = await c.eval(`({width:innerWidth,height:innerHeight,scroll:document.documentElement.scrollWidth,scrollH:document.documentElement.scrollHeight,third:document.querySelector('[data-player-picker="2"]').getBoundingClientRect().right,settle:document.getElementById('settleBtn').getBoundingClientRect().right,scoreWidth:document.querySelector('.score-panel').getBoundingClientRect().width,appWidth:document.querySelector('.app-shell').getBoundingClientRect().width,settingsBottom:document.querySelector('.settings-panel').getBoundingClientRect().bottom,actionTop:document.querySelector('.action-dock').getBoundingClientRect().top,benchBottom:document.querySelector('.bench-list').getBoundingClientRect().bottom})`);
    assert.ok(size.scroll <= width, `${width}px 页面横向溢出: ${size.scroll}`); assert.ok(size.third <= width && size.settle <= width, `${width}px 关键按钮超出屏幕`);
    if(width<=720){ assert.ok(size.scrollH <= height, `${width}x${height} 页面出现纵向滚动: ${size.scrollH}`); assert.ok(size.scoreWidth > size.appWidth*.9, `${width}x${height} 主计分区未占满屏宽`); assert.ok(size.settingsBottom <= size.actionTop+1 && size.benchBottom <= size.actionTop+1, `${width}x${height} 设置区域被裁切`); }
  }
  console.log('PASS 6 种手机尺寸及平板桌面无横向溢出，手机整屏无页面滚动');
  await viewport(390,844); await click('#startBtn'); await click('[data-role="0"]');
  await click('#bombPicker'); await click('[data-option="3"]'); await click('#confirmPicker'); await click('#settleBtn'); await wait(2300);
  let s = await stored(); assert.equal(s.totals['魏'],8); assert.equal(s.totals['熊'],8); assert.equal(s.totals['方']||0,0);
  console.log('PASS 页面完成开局、选地主、选 3 炸、2 秒入账');
  const point = await c.eval(`(()=>{const r=document.getElementById('undoZone').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  await c.send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1}); await wait(2200); await c.send('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1});
  assert.match(await c.eval(`document.getElementById('modalTitle').textContent`),/撤回/); await click('#modalActions .modal-confirm');
  s = await stored(); assert.equal(Object.values(s.totals).reduce((a,b)=>a+b,0),0);
  console.log('PASS 手机长按 2 秒撤回并恢复结算前金额');
  const rotationState = {version:1,started:true,active:['方','魏','熊'],bench:['李','邱','覃'],involved:['方','魏','熊','李','邱','覃'],totals:{方:99},min:1,max:200,threshold:100,step:50,bombs:0,result:'landlordWin',landlord:1};
  await navigate(`localStorage.setItem('beef-noodles-ddj-v1',JSON.stringify({state:${JSON.stringify(rotationState)},lastSnapshot:null}))`); await click('#settleBtn'); await waitFor(() => c.eval(`document.getElementById('modalTitle').textContent.includes('轮换')`));
  assert.match(await c.eval(`document.getElementById('modalTitle').textContent`),/轮换/); await click('#modalActions .modal-confirm');
  s = await stored(); assert.equal(s.active[0],'李'); assert.equal(s.bench[0],'方'); assert.equal(s.totals['方'],100); assert.equal(s.threshold,150);
  await navigate(); s = await stored(); assert.equal(s.active[0],'李'); assert.equal(s.totals['方'],100);
  console.log('PASS 斩杀线轮换、金额保留、步进更新及刷新恢复');
  await click('#resetBtn'); await click('#modalActions .modal-confirm'); s = await stored(); assert.equal(s.started,false); assert.equal(s.threshold,100); assert.equal(s.active[0],'方');
  await click('#resetBtn'); assert.equal(await c.eval(`document.getElementById('modalBackdrop').hidden`),true);
  console.log('PASS 翻台确认恢复默认，默认状态翻台不弹窗');
  assert.deepEqual(c.errors,[]); console.log('PASS 页面无 JavaScript 运行错误');
  ws.close();
}
main().catch(error => { console.error(error); process.exit(1); });
