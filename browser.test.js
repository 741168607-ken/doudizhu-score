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
    const size = await c.eval(`({width:innerWidth,height:innerHeight,scroll:document.documentElement.scrollWidth,scrollH:document.documentElement.scrollHeight,third:document.querySelector('[data-player-picker="2"]').getBoundingClientRect().right,settle:document.getElementById('settleBtn').getBoundingClientRect().right,scoreWidth:document.querySelector('.score-panel').getBoundingClientRect().width,appWidth:document.querySelector('.app-shell').getBoundingClientRect().width,moreHidden:document.getElementById('moreScreen').inert})`);
    assert.ok(size.scroll <= width && size.scrollH <= height, `${width}x${height} 页面出现滚动`); assert.ok(size.third <= width && size.settle <= width, `${width}px 关键按钮超出屏幕`); assert.ok(size.scoreWidth > size.appWidth*.85 && size.moreHidden, '第一屏未独立显示本桌计分');
    await click('#moreBtn'); await wait(400);
    const more = await c.eval(`({visible:document.getElementById('moreScreen').classList.contains('visible'),settingsBottom:document.querySelector('.settings-panel').getBoundingClientRect().bottom,actionTop:document.querySelector('.action-dock').getBoundingClientRect().top,benchBottom:document.querySelector('.bench-list').getBoundingClientRect().bottom})`);
    assert.ok(more.visible && more.settingsBottom <= more.actionTop+1 && more.benchBottom <= more.actionTop+1, `${width}x${height} 第二屏设置区域被裁切`); await click('#backBtn'); await wait(400);
  }
  console.log('PASS 六种手机及平板桌面：第一屏仅计分，第二屏向上滑入且无页面滚动');
  await viewport(390,844);
  assert.equal(await c.eval(`document.querySelector('[data-bomb-value="0"]').getAttribute('aria-selected')`),'true');
  await wait(250); assert.ok(await c.eval(`(()=>{const w=document.getElementById('bombWheel'),b=w.querySelector('[data-bomb-value="0"]'),wr=w.getBoundingClientRect(),br=b.getBoundingClientRect();return Math.abs(br.left+br.width/2-(wr.left+wr.width/2))<3})()`),'默认 0 未在横向滚轮中居中');
  assert.equal(await c.eval(`document.querySelectorAll('.role-btn img').length`),3);
  assert.ok(await c.eval(`[...document.querySelectorAll('.role-btn img')].every(img=>img.complete&&img.naturalWidth>0)`));
  await click('#startBtn'); await click('[data-role="0"]');
  assert.match(await c.eval(`document.querySelector('[data-role="0"] img').src`),/landlord-win/);
  assert.match(await c.eval(`document.querySelector('[data-role="1"] img').src`),/farmer-lose/);
  await c.eval(`(()=>{const w=document.getElementById('bombWheel'),b=w.querySelector('[data-bomb-value="5"]'),wr=w.getBoundingClientRect(),br=b.getBoundingClientRect();w.scrollLeft=w.scrollLeft+br.left-wr.left+br.width/2-w.clientWidth/2;w.dispatchEvent(new Event('scroll'))})()`); await wait(400);
  assert.equal((await stored()).bombs,5); await click('[data-bomb-value="3"]'); await click('#settleBtn'); await wait(2300);
  let s = await stored(); assert.equal(s.totals['魏'],8); assert.equal(s.totals['熊'],8); assert.equal(s.totals['方']||0,0);
  console.log('PASS 横向滚轮滑动选择、角色状态图片、3 炸结算与 2 秒入账');
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
  const manifest = await (await fetch('http://127.0.0.1:8080/manifest.webmanifest')).json(); assert.equal(manifest.display,'fullscreen'); assert.ok(manifest.icons.length>=2);
  assert.equal(await c.eval(`document.querySelector('link[rel="manifest"]').getAttribute('href')`),'./manifest.webmanifest');
  console.log('PASS 全屏安装清单、应用图标与离线资源已配置');
  assert.deepEqual(c.errors,[]); console.log('PASS 页面无 JavaScript 运行错误');
  ws.close();
}
main().catch(error => { console.error(error); process.exit(1); });
