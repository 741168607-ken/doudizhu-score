(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DDJGame = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const NAMES = [...'方雷李邱覃魏熊章赵朱', ...Array.from({length: 26}, (_, i) => String.fromCharCode(65 + i))];
  const OPTIONS = { min: [1,2,3,4,5,6,7,8,9,10], max: [100,200,300,400,500,1000,1500,2000], threshold: [100,200,300,400,500,1000,1500,2000], step: [50,100,200,500,1000], bombs: [0,1,2,3,4,5,6,7,8,9,10] };
  const clone = value => JSON.parse(JSON.stringify(value));
  const defaults = () => ({ version: 1, started: false, active: ['方','魏','熊'], bench: ['李','邱','覃'], involved: ['方','魏','熊','李','邱','覃'], totals: {}, min: 1, max: 200, threshold: 100, step: 50, bombs: 0, result: null });
  function normalize(raw) {
    const base = defaults();
    if (!raw || raw.version !== 1 || !Array.isArray(raw.active) || raw.active.length !== 3 || !Array.isArray(raw.bench)) return base;
    const people = [...raw.active, ...raw.bench];
    if (people.some(n => !NAMES.includes(n)) || new Set(people).size !== people.length) return base;
    return { ...base, ...raw, totals: raw.totals && typeof raw.totals === 'object' ? raw.totals : {}, result: raw.result === null || raw.result === 'landlordWin' || raw.result === 'landlordLose' ? raw.result : null, landlord: Number.isInteger(raw.landlord) ? raw.landlord : null };
  }
  function amount(state, bombs = state.bombs) { return Math.min(state.max, state.min * Math.pow(2, bombs)); }
  function deltas(state) {
    const out = [0,0,0];
    if (!state.result || !Number.isInteger(state.landlord)) return out;
    const base = amount(state);
    state.active.forEach((_, i) => {
      if (state.result === 'landlordWin' && i !== state.landlord) out[i] = base;
      if (state.result === 'landlordLose' && i === state.landlord) out[i] = Math.min(state.max, base * 2);
    });
    return out;
  }
  function selectRole(state, index) {
    if (!state.started || state.animating) return state;
    const next = clone(state);
    if (next.landlord === index && next.result) next.result = next.result === 'landlordWin' ? 'landlordLose' : 'landlordWin';
    else { next.landlord = index; next.result = 'landlordWin'; }
    return next;
  }
  function ranking(state) {
    return [...new Set(state.involved)].map(name => ({ name, total: Number(state.totals[name]) || 0, status: state.active.includes(name) ? '场上' : state.bench.includes(name) ? '候场' : '暂离' })).sort((a,b) => b.total - a.total || a.name.localeCompare(b.name, 'zh-CN'));
  }
  function settle(state) {
    if (!state.started || !state.result || state.animating) return null;
    const changes = deltas(state), next = clone(state);
    next.active.forEach((name, i) => { next.totals[name] = (Number(next.totals[name]) || 0) + changes[i]; });
    next.result = null; next.landlord = null; next.bombs = 0;
    return { state: next, changes };
  }
  function rotationPlan(state) {
    const eligible = state.active.map((name, slot) => ({name, slot, total: Number(state.totals[name]) || 0})).filter(p => p.total >= state.threshold && state.bench.length);
    if (!eligible.length) return [];
    const max = Math.max(...eligible.map(p => p.total));
    let targets = eligible.filter(p => p.total === max).sort((a,b) => a.name.localeCompare(b.name, 'zh-CN'));
    if (targets.length > state.bench.length) targets = targets.slice(0,1);
    return targets.map((target, i) => ({ ...target, replacement: state.bench[i] }));
  }
  function rotate(state, plan) {
    const next = clone(state);
    plan.forEach(item => {
      const benchIndex = next.bench.indexOf(item.replacement);
      next.active[item.slot] = item.replacement;
      if (benchIndex >= 0) next.bench[benchIndex] = item.name;
      else next.bench.push(item.name);
    });
    if (plan.length) next.threshold = Math.max(...plan.map(p => p.total)) + next.step;
    return next;
  }
  function isDefault(state) {
    const d = defaults();
    return state.started === d.started && state.min === d.min && state.max === d.max && state.threshold === d.threshold && state.step === d.step && state.bombs === 0 && !state.result && JSON.stringify(state.active) === JSON.stringify(d.active) && JSON.stringify(state.bench) === JSON.stringify(d.bench) && Object.values(state.totals).every(v => !v);
  }
  return { NAMES, OPTIONS, defaults, normalize, amount, deltas, selectRole, ranking, settle, rotationPlan, rotate, isDefault, clone };
});
