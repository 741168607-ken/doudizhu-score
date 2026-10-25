(() => {
  'use strict';
  const G = window.DDJGame;
  const STORAGE_KEY = 'beef-noodles-ddj-v1';
  const SOUND_KEY = 'beef-noodles-ddj-muted';
  const $ = id => document.getElementById(id);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let state = G.defaults(), lastSnapshot = null, muted = false;
  let animation = null, dangerNames = [], rankExpanded = false, modalOpen = false;
  let picker = null, wheelTimer = null, toastTimer = null, audioContext = null;

  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (saved) {
      state = G.normalize(saved.state);
      state.animating = false;
      lastSnapshot = saved.lastSnapshot ? G.normalize(saved.lastSnapshot) : null;
    }
    muted = localStorage.getItem(SOUND_KEY) === 'true';
  } catch (_) { state = G.defaults(); }

  function save() {
    try {
      const persisted = { ...state, animating: false };
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ state: persisted, lastSnapshot }));
    } catch (_) { toast('本机存储不可用，当前数据仅在本次页面保留'); }
  }
  function toast(message) {
    clearTimeout(toastTimer); $('toast').textContent = message; $('toast').classList.add('show');
    toastTimer = setTimeout(() => $('toast').classList.remove('show'), 2400);
  }
  function icon(name) { return `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`; }
  function roleInfo(index) {
    if (!state.result || state.landlord === null) return { text: '地主', sub: '胜 / 败', cls: '' };
    if (index === state.landlord) return state.result === 'landlordWin' ? { text: '地主胜', sub: '再点切换为地主败', cls: 'landlord' } : { text: '地主败', sub: '再点切换为地主胜', cls: 'landlord' };
    return state.result === 'landlordWin' ? { text: '农民败', sub: '本局计入金', cls: 'farmer-loss' } : { text: '农民胜', sub: '本局不计入金', cls: 'farmer-win' };
  }
  function displayValues(index) {
    const name = state.active[index], total = Number(state.totals[name]) || 0;
    if (!animation) return { total, round: 0 };
    const progress = animation.progress;
    return { total: Math.round(animation.oldTotals[index] + animation.changes[index] * progress), round: Math.round(animation.changes[index] * (1 - progress)) };
  }
  function renderPlayers() {
    $('playerGrid').innerHTML = '<div class="player-label">玩家</div><div class="player-label total-label">入金小计</div><div class="player-label round-label">本局入金</div>' + state.active.map((name, i) => {
      const role = roleInfo(i), values = displayValues(i);
      const classes = ['player-cell', state.result ? 'pending' : '', dangerNames.includes(name) ? 'danger' : ''].join(' ');
      return `<div class="${classes}" data-player="${i}">
        <button class="player-select" style="grid-row:1;grid-column:${2 + i}" data-player-picker="${i}" type="button" ${state.started || state.animating || modalOpen ? 'disabled' : ''} aria-label="选择第 ${i + 1} 位玩家">${name}${icon('chevron')}</button>
        <div class="total-value" style="grid-row:2;grid-column:${2 + i}" data-total="${i}">${values.total}</div>
        <div class="round-value" style="grid-row:3;grid-column:${2 + i}" data-round="${i}">${values.round}</div>
        <button class="role-btn ${role.cls}" style="grid-row:4;grid-column:${2 + i}" data-role="${i}" type="button" ${!state.started || state.animating || modalOpen ? 'disabled' : ''} aria-label="${name}，${role.text}">${role.text}<small>${role.sub}</small></button>
      </div>`;
    }).join('');
  }
  function renderRanking() {
    const ranks = G.ranking(state), visible = ranks.slice(0, 6);
    $('rankList').innerHTML = visible.map((p, i) => `<li class="rank-item"><span class="rank-number">${String(i + 1).padStart(2,'0')}</span><span class="rank-name">${p.name}<span class="rank-tag">${p.status}</span></span><span class="rank-amount">${p.total}</span></li>`).join('');
    $('expandRank').hidden = ranks.length <= 6;
    $('expandRank').classList.remove('expanded');
    $('expandRank').innerHTML = `展开全部${icon('chevron')}`;
  }
  function render() {
    renderPlayers(); renderRanking();
    const locked = !state.started || state.animating || modalOpen;
    $('phaseBadge').className = `phase-badge ${state.started ? 'live' : ''}`;
    $('phaseBadge').innerHTML = `<i></i>${state.animating ? '正在入账' : state.started ? '计分进行中' : '等待开局'}`;
    $('bombValue').textContent = state.bombs === 0 ? '没' : `${state.bombs} 炸`;
    $('bombPicker').disabled = locked;
    $('settleBtn').disabled = locked;
    $('minValue').textContent = state.min; $('maxValue').textContent = state.max;
    $('thresholdValue').textContent = state.threshold; $('stepValue').textContent = `+${state.step}`;
    document.querySelectorAll('[data-picker="min"],[data-picker="max"],[data-picker="threshold"],[data-picker="step"]').forEach(btn => btn.disabled = state.started || state.animating || modalOpen);
    $('benchList').innerHTML = state.bench.map((name, i) => `<button class="bench-select" data-bench="${i}" type="button" ${state.started || state.animating || modalOpen ? 'disabled' : ''}>${name}${icon('chevron')}</button>`).join('');
    $('benchCount').textContent = `${state.bench.length} 位候场`;
    $('startBtn').className = `start-btn ${state.started ? 'playing' : ''}`;
    $('startBtn').disabled = state.started || state.animating || modalOpen;
    $('startBtn').innerHTML = state.started ? '计分进行中<span>点击身份按钮开始本局</span>' : '搞起来！<span>开始计分</span>';
    $('resetBtn').disabled = state.animating || modalOpen;
    $('roundHint').innerHTML = state.animating ? '<span class="hint-dot"></span>本局入金正在转入入金小计' : state.result ? '<span class="hint-dot"></span>胜负已确认，选择炸弹后点击“炸”入账' : '<span class="hint-dot"></span>点击玩家身份按钮确认地主胜负，0 炸也可结算';
    $('undoZone').classList.toggle('armed', Boolean(lastSnapshot));
    $('undoText').textContent = lastSnapshot ? '长按本区域 2 秒，撤回最近一次入金' : '完成一次入金后，可在此长按撤回';
    $('soundBtn').innerHTML = icon(muted ? 'muted' : 'volume');
    $('soundBtn').setAttribute('aria-label', muted ? '开启音效' : '关闭音效');
    $('soundBtn').setAttribute('aria-pressed', String(muted));
  }

  function getAudio() {
    if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === 'suspended') audioContext.resume();
    return audioContext;
  }
  function tone(freq, duration, volume = .05, type = 'sine', delay = 0) {
    if (muted) return;
    try {
      const ctx = getAudio(), osc = ctx.createOscillator(), gain = ctx.createGain(), at = ctx.currentTime + delay;
      osc.type = type; osc.frequency.setValueAtTime(freq, at); gain.gain.setValueAtTime(0, at); gain.gain.linearRampToValueAtTime(volume, at + .012); gain.gain.exponentialRampToValueAtTime(.0001, at + duration);
      osc.connect(gain); gain.connect(ctx.destination); osc.start(at); osc.stop(at + duration + .02);
    } catch (_) {}
  }
  function startSound() { [392,523,659,784].forEach((f,i) => tone(f,.22,.055,'triangle',i*.09)); }
  function tickSound() { tone(115,.045,.025,'square'); }

  function showModal({ kicker = 'PLEASE CONFIRM', title, body, confirm = '确定', cancel = '取消' }) {
    return new Promise(resolve => {
      modalOpen = true; render();
      $('modalKicker').textContent = kicker; $('modalTitle').textContent = title; $('modalBody').innerHTML = body;
      $('modalActions').innerHTML = `${cancel === null ? '' : `<button class="modal-cancel" type="button">${cancel}</button>`}<button class="modal-confirm" type="button">${confirm}</button>`;
      $('modalActions').style.gridTemplateColumns = cancel === null ? '1fr' : '1fr 1fr';
      $('modalBackdrop').hidden = false;
      const close = value => { $('modalBackdrop').hidden = true; modalOpen = false; render(); resolve(value); };
      const cancelButton = $('modalActions').querySelector('.modal-cancel'); if (cancelButton) cancelButton.onclick = () => close(false);
      $('modalActions').querySelector('.modal-confirm').onclick = () => close(true);
      $('modalActions').querySelector('.modal-confirm').focus();
    });
  }

  function unavailableNames(except) { return [...state.active, ...state.bench].filter(n => n !== except); }
  function openPicker(type, index = null) {
    if (modalOpen || state.animating) return;
    if (state.started && type !== 'bombs') return;
    if (!state.started && type === 'bombs') return;
    let options, current, title, apply;
    if (type === 'player') {
      const old = state.active[index]; options = G.NAMES.filter(n => !unavailableNames(old).includes(n)); current = old; title = `选择场上玩家 ${index + 1}`;
      apply = value => { state.active[index] = value; state.involved = [...new Set([...state.involved, value])]; };
    } else if (type === 'bench') {
      const old = state.bench[index]; options = G.NAMES.filter(n => !unavailableNames(old).includes(n)); current = old; title = `选择候场玩家 ${index + 1}`;
      apply = value => { state.bench[index] = value; state.involved = [...new Set([...state.involved, value])]; };
    } else {
      options = G.OPTIONS[type]; current = state[type]; title = { bombs: '选择炸弹数量', min: '选择桌限下限', max: '选择桌限上限', threshold: '选择斩杀线', step: '选择斩杀线步进' }[type];
      apply = value => { state[type] = value; };
    }
    picker = { type, options, selected: Math.max(0, options.indexOf(current)), apply };
    $('pickerTitle').textContent = title; $('pickerSheet').hidden = false; $('sheetBackdrop').hidden = false;
    renderWheel(); requestAnimationFrame(() => { centerWheel(false); $('wheel').focus(); });
  }
  function renderWheel() {
    $('wheel').innerHTML = picker.options.map((value, i) => `<div class="wheel-option ${i === picker.selected ? 'selected' : ''}" role="option" aria-selected="${i === picker.selected}" data-option="${i}">${picker.type === 'bombs' && value === 0 ? '没（0 炸）' : picker.type === 'step' ? `+${value}` : value}</div>`).join('');
    $('wheel').querySelectorAll('[data-option]').forEach(el => el.onclick = () => { picker.selected = Number(el.dataset.option); centerWheel(true); renderWheel(); });
  }
  function centerWheel(smooth = true) { if (!picker) return; if ($('wheel').children[picker.selected]) $('wheel').children[picker.selected].scrollIntoView({ block: 'center', behavior: smooth && !reducedMotion.matches ? 'smooth' : 'auto' }); }
  function closePicker(confirm) {
    if (!picker) return;
    if (confirm) {
      picker.apply(picker.options[picker.selected]);
      if (state.min > state.max) state.min = 1;
      save(); render(); tone(520,.09,.035,'triangle');
    }
    picker = null; $('pickerSheet').hidden = true; $('sheetBackdrop').hidden = true;
  }

  async function settle() {
    if (!state.started || !state.result || state.animating || modalOpen) return;
    lastSnapshot = G.clone(state);
    const result = G.settle(state); if (!result) return;
    const oldTotals = state.active.map(n => Number(state.totals[n]) || 0);
    state = { ...result.state, animating: true }; dangerNames = []; save(); render();
    const duration = reducedMotion.matches ? 150 : 2000;
    animation = { oldTotals, changes: result.changes, progress: 0 };
    let lastTick = 0; const startedAt = performance.now();
    await new Promise(resolve => {
      function frame(now) {
        const linear = Math.min(1, (now - startedAt) / duration);
        animation.progress = 1 - Math.pow(1 - linear, 3);
        state.active.forEach((_, i) => {
          const values = displayValues(i), totalEl = document.querySelector(`[data-total="${i}"]`), roundEl = document.querySelector(`[data-round="${i}"]`);
          if (totalEl) totalEl.textContent = values.total; if (roundEl) roundEl.textContent = values.round;
        });
        if (now - lastTick > 90 && linear < 1 && result.changes.some(Boolean)) { tickSound(); lastTick = now; }
        if (linear < 1) requestAnimationFrame(frame); else resolve();
      }
      requestAnimationFrame(frame);
    });
    animation = null; state.animating = false; state.active.forEach((_,i) => {}); save(); render();
    $('announcer').textContent = `本局入金已完成，${state.active.map((n,i) => `${n}入金${result.changes[i]}`).join('，')}`;
    await checkRotation();
  }
  async function checkRotation() {
    const plan = G.rotationPlan(state); if (!plan.length) return;
    dangerNames = plan.map(p => p.name); render();
    const multi = plan.length > 1;
    const body = `<p>${multi ? '以下场上玩家同分触发斩杀线，候场人数充足，将同时轮换：' : `场上玩家 <strong>${plan[0].name}</strong> 的入金小计最高，且已达到当前斩杀线 ${state.threshold}。`}</p><ul class="rotation-list">${plan.map(p => `<li><span><b>${p.name}</b>（${p.total}）下场</span><strong>${p.replacement} 上场</strong></li>`).join('')}</ul><p>确认后，新斩杀线将更新为 <strong>${Math.max(...plan.map(p => p.total)) + state.step}</strong>。</p>`;
    const yes = await showModal({ kicker: 'ROTATION', title: multi ? '同时轮换玩家？' : `是否轮换候场玩家 ${plan[0].replacement}？`, body, confirm: '是，轮换', cancel: '否' });
    dangerNames = [];
    if (yes) { state = G.rotate(state, plan); toast('玩家轮换完成，斩杀线已更新'); startSound(); }
    save(); render();
  }

  let holdTimer = null, holdFrame = null, holdStart = 0;
  function cancelHold() { clearTimeout(holdTimer); cancelAnimationFrame(holdFrame); holdTimer = null; $('holdProgress').style.transform = 'scaleX(0)'; }
  function startHold(event) {
    if (!lastSnapshot || state.animating || modalOpen) return;
    if (event.type === 'pointerdown') $('undoZone').setPointerCapture(event.pointerId);
    holdStart = performance.now();
    const update = now => { $('holdProgress').style.transform = `scaleX(${Math.min(1,(now-holdStart)/2000)})`; if (now-holdStart<2000) holdFrame=requestAnimationFrame(update); };
    holdFrame = requestAnimationFrame(update);
    holdTimer = setTimeout(async () => {
      cancelHold(); tone(220,.15,.04,'triangle');
      const yes = await showModal({ title: '是否撤回最近一次入金？', body: '<p>将恢复本局结算前的玩家、入金小计、候场顺序、斩杀线和排名。此操作仅支持撤回一次。</p>', confirm: '确定撤回' });
      if (yes) { state = G.clone(lastSnapshot); state.animating = false; lastSnapshot = null; dangerNames = []; save(); render(); toast('已撤回最近一次入金'); }
    }, 2000);
  }

  $('playerGrid').addEventListener('click', event => {
    const player = event.target.closest('[data-player-picker]'), role = event.target.closest('[data-role]');
    if (player) openPicker('player', Number(player.dataset.playerPicker));
    if (role) { state = G.selectRole(state, Number(role.dataset.role)); tone(360,.08,.03,'triangle'); save(); render(); }
  });
  $('bombPicker').onclick = () => openPicker('bombs');
  document.querySelectorAll('[data-picker]').forEach(btn => { if (btn.id !== 'bombPicker') btn.onclick = () => openPicker(btn.dataset.picker); });
  $('benchList').onclick = event => { const btn = event.target.closest('[data-bench]'); if (btn) openPicker('bench', Number(btn.dataset.bench)); };
  $('settleBtn').onclick = settle;
  $('startBtn').onclick = () => { if (state.started) return; state.started = true; state.result = null; state.landlord = null; startSound(); save(); render(); toast('牌局开始，基础设置已锁定'); };
  $('resetBtn').onclick = async () => {
    if (G.isDefault(state)) return;
    const yes = await showModal({ title: '确认翻台？', body: '<p>翻台后所有数据将重新记录，是否继续？</p>', confirm: '是，翻台', cancel: '否' });
    if (yes) { state = G.defaults(); lastSnapshot = null; dangerNames = []; rankExpanded = false; save(); render(); toast('已翻台，所有数据恢复默认'); }
  };
  $('expandRank').onclick = () => { const ranks = G.ranking(state); showModal({ title: '全部入金排名', body: `<ol class="rank-list">${ranks.map((p,i) => `<li class="rank-item"><span class="rank-number">${String(i+1).padStart(2,'0')}</span><span class="rank-name">${p.name}<span class="rank-tag">${p.status}</span></span><span class="rank-amount">${p.total}</span></li>`).join('')}</ol>`, confirm: '关闭', cancel: null }); };
  $('soundBtn').onclick = () => { muted = !muted; localStorage.setItem(SOUND_KEY, String(muted)); if (!muted) tone(523,.12,.04,'triangle'); render(); };
  $('confirmPicker').onclick = () => closePicker(true); $('cancelPicker').onclick = () => closePicker(false); $('sheetBackdrop').onclick = () => closePicker(false);
  $('wheel').addEventListener('scroll', () => {
    clearTimeout(wheelTimer); wheelTimer = setTimeout(() => {
      if (!picker) return; const index = Math.max(0, Math.min(picker.options.length - 1, Math.round($('wheel').scrollTop / 64)));
      picker.selected = index; renderWheel(); centerWheel(true);
    }, 90);
  }, { passive: true });
  $('wheel').addEventListener('keydown', event => {
    if (!picker || !['ArrowUp','ArrowDown','Enter','Escape'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'Enter') closePicker(true); else if (event.key === 'Escape') closePicker(false); else { picker.selected = Math.max(0, Math.min(picker.options.length - 1, picker.selected + (event.key === 'ArrowDown' ? 1 : -1))); renderWheel(); centerWheel(true); }
  });
  $('undoZone').addEventListener('pointerdown', startHold);
  ['pointerup','pointercancel','pointerleave'].forEach(type => $('undoZone').addEventListener(type, cancelHold));
  $('undoZone').addEventListener('keydown', event => { if ((event.key === 'Enter' || event.key === ' ') && lastSnapshot && !event.repeat) { event.preventDefault(); startHold(event); } });
  $('undoZone').addEventListener('keyup', cancelHold);
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && picker) closePicker(false); });
  window.addEventListener('pagehide', save);
  render();
})();
