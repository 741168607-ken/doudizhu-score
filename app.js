(() => {
  'use strict';
  const G = window.DDJGame;
  const STORAGE_KEY = 'beef-noodles-ddj-v1';
  const SOUND_KEY = 'beef-noodles-ddj-muted';
  const $ = id => document.getElementById(id);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let state = G.defaults(), lastSnapshot = null, muted = false;
  let animation = null, dangerNames = [], rankExpanded = false, modalOpen = false;
  // 最近一局每位玩家入金（结算后保留显示在"计分牌"，供查看本局入金）
  let lastRoundChanges = [0, 0, 0];
  let picker = null, wheelTimer = null, toastTimer = null;
  let magnifierTimer = null;
  // 炸弹刻度盘旋转状态
  let ringRotation = 0, ringDragging = false, ringStartAngle = 0, ringStartPointerAngle = 0;
  let lastDragValue = 0; // 拖动过程中的上一个档位值，用于齿感音触发判定
  let bombSoundTriggered = false; // 本局点击炸弹播放"我炸.wav"后，抑制结算时的"金币.wav"
  /* ============ 音效：串行队列播放 wav 文件（一次只播一个，播完才播下一个，避免互相打断） ============ */
  const soundCache = {};
  let soundQueue = [], soundPlaying = false;
  function playSound(name) {
    if (muted) return;
    soundQueue.push(name);
    pumpSoundQueue();
  }
  // 清空队列中尚未播放的指定音效（保留正在播放的那个）
  function clearPendingSound(name) {
    soundQueue = soundQueue.filter(n => n !== name);
  }
  // 等待音效队列完全空闲（正在播放的播完、队列清空）
  function waitForSoundIdle() {
    return new Promise(resolve => {
      if (!soundPlaying && !soundQueue.length) return resolve();
      const check = () => { if (!soundPlaying && !soundQueue.length) resolve(); else setTimeout(check, 80); };
      check();
    });
  }
  // 数字变化.wav：即时打断式播放（不与串行队列混合，点击状态图时每次立即重播）
  let numberChangeAudio = null;
  function playNumberChange() {
    if (muted) return;
    if (!numberChangeAudio) { numberChangeAudio = new Audio('./assets/images/数字变化.wav'); numberChangeAudio.preload = 'auto'; }
    numberChangeAudio.currentTime = 0;
    const p = numberChangeAudio.play();
    if (p && p.catch) p.catch(() => {});
  }
  function pumpSoundQueue() {
    if (soundPlaying || !soundQueue.length) return;
    const name = soundQueue.shift();
    soundPlaying = true;
    try {
      if (!soundCache[name]) {
        const audio = new Audio('./assets/images/' + name);
        audio.preload = 'auto';
        audio.load();
        soundCache[name] = audio;
      }
      const audio = soundCache[name];
      audio.currentTime = 0;
      audio.onended = () => { soundPlaying = false; pumpSoundQueue(); };
      const p = audio.play();
      if (p && p.catch) p.catch(() => { soundPlaying = false; pumpSoundQueue(); });
    } catch (_) { soundPlaying = false; pumpSoundQueue(); }
  }

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
    } catch (_) {}
  }
  function toast(message) {
    clearTimeout(toastTimer); $('toast').textContent = message; $('toast').classList.add('show');
    toastTimer = setTimeout(() => $('toast').classList.remove('show'), 2400);
  }
  // 是否有任何入金：三玩家本局入金(lastRoundChanges)或入金小计(totals)任一非 0
  function hasAnyScore() {
    const roundNonZero = lastRoundChanges.some(v => v !== 0);
    const totalNonZero = state.active.some(name => (Number(state.totals[name]) || 0) !== 0);
    return roundNonZero || totalNonZero;
  }
  function icon(name) { return `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`; }

  function roleInfo(index) {
    if (!state.result || state.landlord == null) return { text: '未确定', cls: 'undecided', image: 'role-default' };
    const isLandlord = index === state.landlord;
    const landlordWon = state.result === 'landlordWin';
    const won = isLandlord ? landlordWon : !landlordWon;
    const cls = won ? 'win' : 'lose';
    if (isLandlord) return { text: landlordWon ? '地主胜' : '地主败', cls, image: landlordWon ? 'landlord-win' : 'landlord-lose' };
    return { text: landlordWon ? '农民败' : '农民胜', cls, image: landlordWon ? 'farmer-lose' : 'farmer-win' };
  }
  function displayValues(index) {
    const name = state.active[index], total = Number(state.totals[name]) || 0;
    if (!animation) return { total, round: lastRoundChanges[index] || 0 };
    const progress = animation.progress;
    return { total: Math.round(animation.oldTotals[index] + animation.changes[index] * progress), round: Math.round(animation.changes[index] * (1 - progress)) };
  }
  // 头像图映射：左边农民、中间地主、右边农民；未确定用牛头面(logo)
  function avatarImage(index) {
    const role = roleInfo(index);
    if (role.image === 'role-default') return './assets/images/logo.png';
    return './assets/images/' + role.image + '.png';
  }
  function renderPlayers() {
    $('playerGrid').innerHTML = state.active.map((name, i) => {
      const role = roleInfo(i), values = displayValues(i);
      const classes = ['player-cell', state.result ? 'pending' : '', dangerNames.includes(name) ? 'danger' : ''].join(' ');
      const columnClass = ['col-a', 'col-b', 'col-c'][i];
      return `<div class="${classes} ${columnClass}" data-player="${i}">
        <button class="player-select" data-player-picker="${i}" type="button" ${state.started || state.animating || modalOpen ? 'disabled' : ''} aria-label="选择第 ${i + 1} 位玩家">${name}</button>
        <div class="score-total" data-total="${i}">
          <img src="./assets/images/number-plate.png" alt="" draggable="false">
          <span class="flip-number">${values.total}</span>
        </div>
        <div class="score-round" data-round="${i}">
          <img src="./assets/images/score-board.png" alt="" draggable="false">
          <span class="round-number">${values.round}</span>
        </div>
        <div class="role-btn ${role.cls}" data-role="${i}" role="button" tabindex="0" aria-label="${name}，${role.text}" ${!state.started || state.animating || modalOpen ? 'data-disabled' : ''}>
          <img src="${avatarImage(i)}" alt="" draggable="false">
        </div>
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

  /* ============ 炸弹拉丝刻度盘（整图旋转 + 拖动） ============ */
  const RING_VALUES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  // 值 v 在刻度盘上的固定角度：v=0 在 12 点(0°)，顺时针递增，每档 36°
  function angleForValue(value) { return -value * 36; }
  function valueFromAngle(angle) {
    const seg = 36;
    let a = ((angle % 360) + 360) % 360;
    let idx = Math.round(-a / seg) % 10;
    idx = ((idx % 10) + 10) % 10;
    return RING_VALUES[idx];
  }
  function applyRingRotation(angle, animate) {
    ringRotation = angle;
    const dial = $('ringDial');
    if (!dial) return;
    dial.style.transition = animate ? 'transform .3s cubic-bezier(.16,1,.3,1)' : 'none';
    dial.style.transform = `rotate(${angle}deg)`;
  }
  function updateRingAria() {
    const ring = $('bombRing');
    ring.setAttribute('aria-valuenow', String(state.bombs));
    ring.setAttribute('aria-valuetext', `${state.bombs} 炸`);
  }
  // 放大镜：同步当前吸附数字 + 控制显示（拖动中显示，吸附后 0.5s 自动隐藏）
  function magnifierEl() { return document.querySelector('.ring-magnifier'); }
  function showMagnifier(highlight = false) {
    const mag = magnifierEl(); if (!mag) return;
    clearTimeout(magnifierTimer);
    const digit = mag.querySelector('.mg-digit');
    if (digit) digit.textContent = String(state.bombs);
    mag.classList.add('visible');
    if (highlight) {
      mag.classList.remove('highlight');
      void mag.offsetWidth;
      mag.classList.add('highlight');
    }
  }
  function hideMagnifierSoon() {
    clearTimeout(magnifierTimer);
    magnifierTimer = setTimeout(() => {
      const mag = magnifierEl(); if (mag) { mag.classList.remove('visible'); mag.classList.remove('highlight'); }
    }, 500);
  }
  function hideMagnifierNow() {
    clearTimeout(magnifierTimer);
    const mag = magnifierEl(); if (mag) { mag.classList.remove('visible'); mag.classList.remove('highlight'); }
  }
  function renderBombs() {
    const ring = $('bombRing'), locked = state.landlord == null || state.animating || modalOpen;
    if (!ring) return;
    ring.classList.toggle('locked', locked);
    applyRingRotation(angleForValue(state.bombs), false);
    updateRingAria();
    if (!ringDragging) hideMagnifierNow();
  }
  function selectBomb(value, smooth = true) {
    if (state.landlord == null || state.animating || modalOpen) return;
    state.bombs = Math.max(0, Math.min(9, value)); save();
    applyRingRotation(angleForValue(state.bombs), smooth && !reducedMotion.matches);
    updateRingAria();
    showMagnifier(true);
    hideMagnifierSoon();
    previewRoundRoll(state.bombs);
  }

  function ringPointerDown(e) {
    if (state.landlord == null || state.animating || modalOpen) return;
    ringDragging = true;
    const ring = $('bombRing');
    const rect = ring.getBoundingClientRect();
    const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
    ringStartPointerAngle = Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI;
    ringStartAngle = ringRotation;
    lastDragValue = state.bombs;
    if (ring.setPointerCapture) ring.setPointerCapture(e.pointerId);
    ring.classList.add('dragging');
    showMagnifier(false);
    e.preventDefault();
  }
  function ringPointerMove(e) {
    if (!ringDragging) return;
    const ring = $('bombRing');
    const rect = ring.getBoundingClientRect();
    const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
    let pointerAngle = Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI;
    // 处理 ±180° 跳变（跨过 0°/180° 边界）
    let delta = pointerAngle - ringStartPointerAngle;
    if (delta > 180) delta -= 360;
    else if (delta < -180) delta += 360;
    applyRingRotation(ringStartAngle + delta, false);
    // 拖动中实时更新放大镜数字（当前角度对应的档位值）
    const curValue = valueFromAngle(ringStartAngle + delta);
    const mag = magnifierEl();
    if (mag) {
      const digit = mag.querySelector('.mg-digit');
      if (digit) digit.textContent = String(curValue);
      mag.classList.add('visible');
      clearTimeout(magnifierTimer);
    }
    // 每跨过一个刻度档位，播放一次齿感音
    if (curValue !== lastDragValue) {
      lastDragValue = curValue;
      playSound('齿感音.wav');
    }
    e.preventDefault();
  }
  function ringPointerUp() {
    if (!ringDragging) return;
    ringDragging = false;
    $('bombRing').classList.remove('dragging');
    // 松手吸附：清空队列中尚未播放的齿感音（正在播的那个播完即止），不再播放剩余次数
    clearPendingSound('齿感音.wav');
    // 松手吸附最近档位
    const value = valueFromAngle(ringRotation);
    selectBomb(value, true);
  }
  // 刻度吸附后：计分牌(本局入金)按最新炸弹数预览滚动，但不真正入账
  function previewRoundRoll(bombs) {
    if (state.landlord == null || !state.result) return;
    const preview = { ...state, bombs };
    const deltas = G.deltas(preview);
    state.active.forEach((_, i) => {
      const roundEl = document.querySelector(`[data-round="${i}"]`);
      rollNumber(roundEl, deltas[i]);
    });
  }
  // 让数字滚动到目标值（带滚动动画，纯 DOM，不改 state）
  function rollNumber(container, target) {
    if (!container) return;
    const number = container.querySelector('.round-number');
    if (!number) return;
    const from = parseInt(number.textContent, 10) || 0;
    if (from === target) return;
    const dur = reducedMotion.matches ? 0 : 400;
    const start = performance.now();
    function step(now) {
      const p = dur === 0 ? 1 : Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      number.textContent = Math.round(from + (target - from) * eased);
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function render() {
    renderPlayers(); renderRanking(); renderBombs();
    const locked = !state.started || state.animating || modalOpen;
    $('phaseBadge').className = `phase-badge ${state.started ? 'live' : ''}`;
    $('phaseText').textContent = state.animating ? '正在入账' : state.started ? '计分进行中' : '等待开局';
    // 炸弹按钮：确定地主后可用（未确定地主时禁用），仅在入账动画或弹窗时禁用；已结算后禁用，直到重新选地主
    $('settleBtn').disabled = state.landlord == null || state.animating || modalOpen || state.settled;
    $('settleBtn').classList.toggle('boom', state.animating);
    $('minValue').textContent = state.min; $('maxValue').textContent = state.max;
    $('thresholdValue').textContent = state.threshold; $('stepValue').textContent = `+${state.step}`;
    document.querySelectorAll('[data-picker="min"],[data-picker="max"],[data-picker="threshold"],[data-picker="step"]').forEach(btn => btn.disabled = state.animating || modalOpen);
    $('benchList').innerHTML = state.bench.map((name, i) => {
      const disabled = state.animating || modalOpen;
      // 空位：仅显示"未选择"占位；非空位：左箭头 + 名字 + 右箭头
      const selectBtn = `<button class="bench-select" data-bench="${i}" type="button" ${disabled ? 'disabled' : ''}>${name || '未选择'}${icon('chevron')}</button>`;
      if (!name) return `<div class="bench-slot" data-bench-slot="${i}"><span class="bench-empty">${selectBtn}</span></div>`;
      const hasLeft = state.bench.slice(0, i).some(n => n !== '');
      const hasRight = state.bench.slice(i + 1).some(n => n !== '');
      const leftBtn = `<button class="bench-move" data-move="left" data-bench="${i}" type="button" aria-label="前移" ${disabled || !hasLeft ? 'disabled' : ''}>${icon('chevron')}</button>`;
      const rightBtn = `<button class="bench-move" data-move="right" data-bench="${i}" type="button" aria-label="后移" ${disabled || !hasRight ? 'disabled' : ''}>${icon('chevron')}</button>`;
      return `<div class="bench-slot" data-bench-slot="${i}">${leftBtn}${selectBtn}${rightBtn}</div>`;
    }).join('');
    $('startBtn').className = `start-btn side-action ${state.started ? 'playing' : ''}`;
    $('startBtn').disabled = state.started || state.animating || modalOpen;
    $('startBtn').textContent = '搞起';
    $('resetBtn').disabled = state.animating || modalOpen || !hasAnyScore();
    $('soundBtn').innerHTML = icon(muted ? 'muted' : 'volume');
    $('soundBtn').setAttribute('aria-label', muted ? '开启音效' : '关闭音效');
    $('soundBtn').setAttribute('aria-pressed', String(muted));
  }

  function showModal({ kicker = 'PLEASE CONFIRM', title, body, confirm = '确定', cancel = '取消' }) {
    return new Promise(resolve => {
      modalOpen = true; render();
      $('modalTitle').textContent = title; $('modalBody').innerHTML = body;
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
    // 仅场上玩家选择需在开局前；候场玩家与牌桌设置(数值)随时可调
    if (type === 'player' && state.started) return;
    let options, current, title, apply;
    if (type === 'player') {
      const old = state.active[index]; options = G.NAMES.filter(n => !unavailableNames(old).includes(n)); current = old; title = `选择场上玩家 ${index + 1}`;
      apply = value => { state.active[index] = value; state.involved = [...new Set([...state.involved, value])]; };
    } else if (type === 'bench') {
      const old = state.bench[index]; options = G.NAMES.filter(n => !unavailableNames(old).includes(n)); current = old; title = `选择候场玩家 ${index + 1}`;
      apply = value => { state.bench[index] = value; state.involved = [...new Set([...state.involved, value])]; };
    } else {
      options = G.OPTIONS[type]; current = state[type]; title = { min: '选择桌限下限', max: '选择桌限上限', threshold: '选择斩杀线', step: '选择斩杀线步进' }[type];
      apply = value => { state[type] = value; };
    }
    picker = { type, options, selected: Math.max(0, options.indexOf(current)), apply };
    $('pickerTitle').textContent = title; $('pickerSheet').hidden = false; $('sheetBackdrop').hidden = false;
    renderWheel(); requestAnimationFrame(() => { centerWheel(false); $('wheel').focus(); });
  }
  function renderWheel() {
    $('wheel').innerHTML = picker.options.map((value, i) => `<div class="wheel-option ${i === picker.selected ? 'selected' : ''}" role="option" aria-selected="${i === picker.selected}" data-option="${i}">${picker.type === 'step' ? `+${value}` : value}</div>`).join('');
    $('wheel').querySelectorAll('[data-option]').forEach(el => el.onclick = () => { picker.selected = Number(el.dataset.option); centerWheel(true); renderWheel(); });
  }
  function centerWheel(smooth = true) { if (!picker) return; if ($('wheel').children[picker.selected]) $('wheel').children[picker.selected].scrollIntoView({ block: 'center', behavior: smooth && !reducedMotion.matches ? 'smooth' : 'auto' }); }
  function closePicker(confirm) {
    if (!picker) return;
    if (confirm) {
      picker.apply(picker.options[picker.selected]);
      if (state.min > state.max) state.min = 1;
      save(); render();
    }
    picker = null; $('pickerSheet').hidden = true; $('sheetBackdrop').hidden = true;
  }

  function updateFlipNumber(container, value) {
    const number = container && container.querySelector('.flip-number');
    if (!number || number.textContent === String(value)) return;
    number.textContent = value;
    if (!reducedMotion.matches) { number.classList.remove('flip-tick'); void number.offsetWidth; number.classList.add('flip-tick'); }
  }
  function updateRoundNumber(container, value) {
    const number = container && container.querySelector('.round-number');
    if (!number) return;
    number.textContent = value;
  }
  async function settle() {
    if (!state.started || !state.result || state.animating || modalOpen || state.settled) return;
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
          if (totalEl) updateFlipNumber(totalEl, values.total); if (roundEl) updateRoundNumber(roundEl, values.round);
        });
        if (now - lastTick > 90 && linear < 1 && result.changes.some(Boolean) && !bombSoundTriggered) { playSound('金币.wav'); lastTick = now; }
        if (linear < 1) requestAnimationFrame(frame); else resolve();
      }
      requestAnimationFrame(frame);
    });
    animation = null; state.animating = false;
    lastRoundChanges = result.changes;
    save(); render();
    $('announcer').textContent = `本局入金已完成，${state.active.map((n,i) => `${n}入金${result.changes[i]}`).join('，')}`;
    await checkRotation();
  }
  async function checkRotation() {
    const plan = G.rotationPlan(state); if (!plan.length) return;
    dangerNames = plan.map(p => p.name); render();
    // 达到轮换标准：先等音效队列（尤其"我炸.wav"）全部播完，再弹切换对话框
    await waitForSoundIdle();
    const multi = plan.length > 1;
    const body = `<p>${multi ? '以下场上玩家同分触发斩杀线，候场人数充足，将同时轮换：' : `场上玩家 <strong>${plan[0].name}</strong> 的入金小计最高，且已达到当前斩杀线 ${state.threshold}。`}</p><ul class="rotation-list">${plan.map(p => `<li><span><b>${p.name}</b>（${p.total}）下场</span><strong>${p.replacement} 上场</strong></li>`).join('')}</ul><p>确认后，新斩杀线将更新为 <strong>${Math.max(...plan.map(p => p.total)) + state.step}</strong>。</p>`;
    const yes = await showModal({ kicker: 'ROTATION', title: multi ? '同时轮换玩家？' : `是否轮换候场玩家 ${plan[0].replacement}？`, body, confirm: '是，轮换', cancel: '否' });
    dangerNames = [];
    if (yes) { state = G.rotate(state, plan); playSound('让开.wav'); toast('玩家轮换完成，斩杀线已更新'); }
    save(); render();
  }

  /* ============ 长按撤回（在 phaseBadge「等待开局」按钮上） ============ */
  let holdTimer = null, holdFrame = null, holdStart = 0;
  function cancelHold() { clearTimeout(holdTimer); cancelAnimationFrame(holdFrame); holdTimer = null; $('phaseBadge').style.setProperty('--hold', '0'); }
  function startHold(event) {
    if (!lastSnapshot || state.animating || modalOpen) return;
    if (event.type === 'pointerdown') $('phaseBadge').setPointerCapture(event.pointerId);
    holdStart = performance.now();
    const update = now => { const p = Math.min(1, (now - holdStart) / 2000); $('phaseBadge').style.setProperty('--hold', String(p)); if (now - holdStart < 2000) holdFrame = requestAnimationFrame(update); };
    holdFrame = requestAnimationFrame(update);
    holdTimer = setTimeout(async () => {
      cancelHold();
      const yes = await showModal({ title: '是否撤回最近一次入金？', body: '<p>将恢复本局结算前的玩家、入金小计、候场顺序、斩杀线和排名。此操作仅支持撤回一次。</p>', confirm: '确定撤回' });
      if (yes) { state = G.clone(lastSnapshot); state.animating = false; lastSnapshot = null; dangerNames = []; lastRoundChanges = [0, 0, 0]; save(); render(); toast('已撤回最近一次入金'); }
    }, 2000);
  }

  // 事件绑定
  $('playerGrid').addEventListener('click', event => {
    const player = event.target.closest('[data-player-picker]'), role = event.target.closest('[data-role]');
    if (player) openPicker('player', Number(player.dataset.playerPicker));
    if (role) { playNumberChange(); state = G.selectRole(state, Number(role.dataset.role)); save(); render(); previewRoundRoll(state.bombs); $('bombImg').src = './assets/images/bomb-before.png'; }
  });
  document.querySelectorAll('[data-picker]').forEach(btn => { btn.onclick = () => openPicker(btn.dataset.picker); });
  $('benchList').onclick = event => {
    const move = event.target.closest('[data-move]');
    if (move) {
      const i = Number(move.dataset.bench), dir = move.dataset.move === 'left' ? -1 : 1;
      // 跳过空位，找到最近的非空候场交换（保证有效候场之间的相对顺序调整）
      let j = i + dir;
      while (j >= 0 && j < state.bench.length && state.bench[j] === '') j += dir;
      if (j < 0 || j >= state.bench.length) return;
      [state.bench[i], state.bench[j]] = [state.bench[j], state.bench[i]];
      save(); render();
      return;
    }
    const btn = event.target.closest('[data-bench]');
    if (btn) openPicker('bench', Number(btn.dataset.bench));
  };

  // 炸弹刻度盘交互
  const ring = $('bombRing');
  ring.addEventListener('pointerdown', ringPointerDown);
  ring.addEventListener('pointermove', ringPointerMove);
  ring.addEventListener('pointerup', ringPointerUp);
  ring.addEventListener('pointercancel', ringPointerUp);
  ring.addEventListener('keydown', event => {
    if (state.landlord == null || state.animating || modalOpen) return;
    if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'Home') selectBomb(0);
    else if (event.key === 'End') selectBomb(9);
    else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') selectBomb(state.bombs + 1);
    else selectBomb(state.bombs - 1);
  });

  // 炸弹按钮：确定地主后可点击，播放我炸.wav + 翻转为"炸弹点击后.png"，保持到点击状态按钮后才恢复默认
  function bombClick() {
    if (state.landlord == null || state.animating || modalOpen) return;
    bombSoundTriggered = true; // 已点炸弹，后续结算不再播金币.wav
    playSound('我炸.wav');
    $('bombImg').src = './assets/images/bomb-after.png';
  }
  $('settleBtn').addEventListener('click', event => {
    bombClick();
    settle();
  });

  function showMore(show) {
    $('moreScreen').classList.toggle('visible', show); $('moreScreen').inert = !show;
    $('drawerBackdrop').hidden = !show;
    $('moreBtn').setAttribute('aria-expanded', String(show));
    if (show) $('moreBtn').focus();
  }
  $('moreBtn').onclick = () => showMore(true);
  document.querySelector('.sheet-drag').onclick = () => showMore(false);
  $('drawerBackdrop').onclick = () => showMore(false);
  $('startBtn').onclick = () => { if (state.started) return; state.started = true; state.result = null; state.landlord = null; state.settled = false; bombSoundTriggered = false; save(); render(); toast('牌局开始'); };
  $('resetBtn').onclick = async () => {
    if (G.isDefault(state)) return;
    const yes = await showModal({ title: '确认翻台？', body: '<p>翻台后所有数据将重新记录，是否继续？</p>', confirm: '是，翻台', cancel: '否' });
    if (yes) { state = G.defaults(); lastSnapshot = null; dangerNames = []; rankExpanded = false; lastRoundChanges = [0, 0, 0]; bombSoundTriggered = false; save(); render(); toast('已翻台'); }
  };
  $('expandRank').onclick = () => { const ranks = G.ranking(state); showModal({ title: '全部入金排名', body: `<ol class="rank-list">${ranks.map((p,i) => `<li class="rank-item"><span class="rank-number">${String(i+1).padStart(2,'0')}</span><span class="rank-name">${p.name}<span class="rank-tag">${p.status}</span></span><span class="rank-amount">${p.total}</span></li>`).join('')}</ol>`, confirm: '关闭', cancel: null }); };
  $('soundBtn').onclick = () => { muted = !muted; localStorage.setItem(SOUND_KEY, String(muted)); render(); };
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
  // 长按撤回绑定到 phaseBadge
  $('phaseBadge').addEventListener('pointerdown', startHold);
  ['pointerup','pointercancel','pointerleave'].forEach(type => $('phaseBadge').addEventListener(type, cancelHold));
  $('phaseBadge').addEventListener('keydown', event => { if ((event.key === 'Enter' || event.key === ' ') && lastSnapshot && !event.repeat) { event.preventDefault(); startHold(event); } });
  $('phaseBadge').addEventListener('keyup', cancelHold);
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && picker) closePicker(false); else if (event.key === 'Escape' && $('moreScreen').classList.contains('visible') && !modalOpen) showMore(false); });
  window.addEventListener('pagehide', save);
  if ('serviceWorker' in navigator && location.protocol !== 'file:') window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));

  // 禁止页面缩放：阻止双指捏合、双击缩放、Ctrl/Cmd+滚轮缩放
  document.addEventListener('gesturestart', e => e.preventDefault());
  document.addEventListener('gesturechange', e => e.preventDefault());
  document.addEventListener('gestureend', e => e.preventDefault());
  document.addEventListener('dblclick', e => { if (e.target.closest && !e.target.closest('input,textarea,select')) e.preventDefault(); }, { passive: false });
  let lastTouchEnd = 0;
  document.addEventListener('touchend', e => {
    const now = Date.now();
    if (now - lastTouchEnd <= 300) e.preventDefault();
    lastTouchEnd = now;
  }, { passive: false });
  document.addEventListener('wheel', e => { if (e.ctrlKey || e.metaKey) e.preventDefault(); }, { passive: false });
  window.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && ['+','-','=','0'].includes(e.key)) e.preventDefault();
  });

  // 初始化
  render();
  requestAnimationFrame(() => { applyRingRotation(angleForValue(state.bombs), false); });
})();
