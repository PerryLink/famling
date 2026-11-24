/* Famling public demo — no dependencies, no network requests. */
(() => {
  const canvas = document.getElementById('stage');
  const ctx = canvas.getContext('2d');
  const buttons = [...document.querySelectorAll('#charButtons button')];
  const hint = document.getElementById('hint');
  const SCALE = 4, SIZE = 96;
  const ACTIONS = ['pat_head', 'run', 'attack'];
  let data = null, char = 'human';
  let action = null, actionIndex = 0, actionClock = 0;
  let idleIndex = 0, idleClock = 0, last = performance.now();
  const images = new Map();
  function loadImage(src) {
    if (images.has(src)) return images.get(src);
    const img = new Image(); img.src = src; images.set(src, img); return img;
  }
  function frames(clip) { return data.characters[char].clips[clip].frames; }
  function clipFps(clip) { return data.characters[char].clips[clip].fps || 8; }
  function preload() {
    for (const c of Object.keys(data.characters)) {
      for (const clip of Object.keys(data.characters[c].clips)) {
        for (const src of data.characters[c].clips[clip].frames) loadImage(src);
      }
    }
  }
  function setChar(next) {
    char = next; idleIndex = 0; idleClock = 0; action = null;
    for (const b of buttons) b.classList.toggle('active', b.dataset.char === char);
    hint.textContent = data.characters[char].label + ' · 待机呼吸中 · 点击宠物看一个动作';
  }
  function startAction() {
    if (action) return;
    action = ACTIONS[Math.floor(Math.random() * ACTIONS.length)];
    actionIndex = 0; actionClock = 0;
    hint.textContent = data.characters[char].label + ' · ' + action;
  }
  function drawFrame(src) {
    const img = loadImage(src);
    if (!img.complete) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0, SIZE, SIZE, 0, 0, SIZE * SCALE, SIZE * SCALE);
  }
  function tick(now) {
    const dt = now - last; last = now;
    if (!data) { requestAnimationFrame(tick); return; }
    if (action) {
      actionClock += dt;
      const step = 1000 / clipFps(action);
      if (actionClock >= step) { actionClock = 0; actionIndex += 1; }
      const list = frames(action);
      if (actionIndex >= list.length) { action = null; hint.textContent = data.characters[char].label + ' · 待机呼吸中 · 点击宠物看一个动作'; }
      else drawFrame(list[actionIndex]);
    } else {
      idleClock += dt;
      const step = 1000 / clipFps('idle');
      if (idleClock >= step) { idleClock = 0; idleIndex = (idleIndex + 1) % frames('idle').length; }
      drawFrame(frames('idle')[idleIndex]);
    }
    requestAnimationFrame(tick);
  }
  async function boot() {
    data = await (await fetch('frames.json')).json();
    preload();
    for (const b of buttons) b.addEventListener('click', () => setChar(b.dataset.char));
    canvas.addEventListener('click', startAction);
    canvas.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') startAction(); });
    canvas.tabIndex = 0;
    window.addEventListener('keydown', (e) => {
      if (e.key === '1') setChar('human');
      if (e.key === '2') setChar('cat');
      if (e.key === '3') setChar('dog');
    });
    setChar('human');
    requestAnimationFrame(tick);
  }
  boot().catch((err) => { hint.textContent = '演示加载失败：' + err.message; });
})();