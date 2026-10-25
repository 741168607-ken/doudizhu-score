const assert = require('node:assert/strict');
const G = require('./game.js');
let passed = 0;
function test(name, fn) { fn(); passed++; console.log(`PASS ${name}`); }
function withResult(state, landlord, result, bombs) { state.started = true; state.landlord = landlord; state.result = result; state.bombs = bombs; return state; }

test('36 位玩家及全部预设选项', () => { assert.equal(G.NAMES.length, 36); assert.deepEqual(G.OPTIONS.bombs, [0,1,2,3,4,5,6,7,8,9,10]); });
test('地主胜：每位农民入金 8，地主为 0', () => { const s = withResult(G.defaults(),0,'landlordWin',3); assert.deepEqual(G.deltas(s),[0,8,8]); });
test('地主败：地主入金为基础值两倍', () => { const s = withResult(G.defaults(),0,'landlordLose',3); assert.deepEqual(G.deltas(s),[16,0,0]); });
test('农民败：理论值 256 被封顶为 200', () => { const s = withResult(G.defaults(),0,'landlordWin',8); assert.deepEqual(G.deltas(s),[0,200,200]); });
test('地主败：最终金额同样封顶为默认 MAX 200', () => { const s = withResult(G.defaults(),0,'landlordLose',8); assert.deepEqual(G.deltas(s),[200,0,0]); });
test('最终封顶跟随 MAX 设置：MAX 500 时地主与农民都封顶 500', () => { const s = withResult(G.defaults(),0,'landlordLose',9); s.max = 500; assert.deepEqual(G.deltas(s),[500,0,0]); s.result = 'landlordWin'; assert.deepEqual(G.deltas(s),[0,500,500]); });
test('地主翻倍未超过 MAX 时保留实际金额', () => { const s = withResult(G.defaults(),0,'landlordLose',3); s.max = 500; assert.deepEqual(G.deltas(s),[16,0,0]); });
test('身份按钮：重复点击切换地主胜负并联动农民', () => { let s = G.defaults(); s.started = true; s = G.selectRole(s,1); assert.equal(s.landlord,1); assert.equal(s.result,'landlordWin'); s = G.selectRole(s,1); assert.equal(s.result,'landlordLose'); });
test('未确认胜负时不产生结算', () => { const s = G.defaults(); s.started = true; assert.equal(G.settle(s),null); });
test('结算累计入金并清理单局状态', () => { const s = withResult(G.defaults(),0,'landlordWin',3), r = G.settle(s); assert.equal(r.state.totals['魏'],8); assert.equal(r.state.totals['熊'],8); assert.equal(r.state.result,null); assert.equal(r.state.bombs,0); });
test('同分最高且候场充足时两人同时轮换', () => { const s = G.defaults(); Object.assign(s.totals,{方:150,魏:150,熊:100}); const p = G.rotationPlan(s); assert.equal(p.length,2); const n = G.rotate(s,p); assert.deepEqual(n.active,['李','邱','熊']); assert.equal(n.totals['方'],150); assert.equal(n.threshold,200); });
test('触发者金额不同只轮换最高者', () => { const s = G.defaults(); Object.assign(s.totals,{方:180,魏:150,熊:100}); const p = G.rotationPlan(s); assert.equal(p.length,1); assert.equal(p[0].name,'方'); const n = G.rotate(s,p); assert.equal(n.active[0],'李'); assert.equal(n.bench[0],'方'); assert.equal(n.totals['方'],180); assert.equal(n.threshold,230); });
test('候场不足时不执行多人同时轮换', () => { const s = G.defaults(); s.bench = ['李']; Object.assign(s.totals,{方:150,魏:150}); const p = G.rotationPlan(s); assert.equal(p.length,1); });
test('排名金额降序，同分按姓名升序', () => { const s = G.defaults(); Object.assign(s.totals,{方:10,魏:10,熊:20}); assert.deepEqual(G.ranking(s).slice(0,3).map(x=>x.name),['熊','方','魏']); });
test('完全默认状态可直接翻台', () => { assert.equal(G.isDefault(G.defaults()),true); });
test('非默认状态需要翻台确认', () => { const s = G.defaults(); s.totals['方'] = 1; assert.equal(G.isDefault(s),false); });
test('损坏的本地存档回退到默认状态', () => { assert.deepEqual(G.normalize({version:1,active:['无效']}),G.defaults()); });

console.log(`\n${passed} 项规则测试全部通过`);
