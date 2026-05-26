// Court player: монтирует сцену в контейнер, рисует кадры через requestAnimationFrame,
// даёт контролы (play/pause, шаг ±, перемотка, скорость). Встраивание: mountCourt() и
// кастомный элемент <squash-court>. См. docs/adr/0003-court-engine-architecture.md.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./court-dsl.js'), require('./court-render-svg.js'));
  } else {
    root.SquashCourtPlayer = factory(root.SquashCourtDSL, root.SquashCourtRender);
  }
})(typeof self !== 'undefined' ? self : this, function (DSL, Render) {
  const { parseScene } = DSL;
  const { renderScene, timeline } = Render;

  // --- Pure step navigation (unit-tested) ---
  const EPS = 1e-4;
  function nextStepStart(starts, t) {
    for (let i = 0; i < starts.length; i++) if (starts[i] > t + EPS) return starts[i];
    return null;
  }
  function prevStepStart(starts, t) {
    let r = 0;
    for (let i = 0; i < starts.length; i++) if (starts[i] < t - EPS) r = starts[i];
    return r;
  }
  function stepIndexAt(starts, t) {
    let idx = -1;
    for (let i = 0; i < starts.length; i++) if (t >= starts[i] - EPS) idx = i;
    return idx;
  }

  // --- DOM controller (browser only) ---
  function mountCourt(container, source, opts = {}) {
    const scene = typeof source === 'string' ? parseScene(source) : source;
    const tl = timeline(scene);
    const showControls = opts.controls !== false && tl.total > 0;

    container.classList.add('court-player');
    container.innerHTML = `
      <div class="court-stage"></div>
      ${showControls ? `
      <div class="court-controls">
        <button class="court-btn court-play" type="button" aria-label="Воспроизвести">▶</button>
        <button class="court-btn court-prev" type="button" aria-label="Шаг назад">⏮</button>
        <button class="court-btn court-next" type="button" aria-label="Шаг вперёд">⏭</button>
        <input class="court-scrub" type="range" min="0" max="${tl.total}" step="0.01" value="0" aria-label="Перемотка"/>
        <span class="court-steplabel" aria-live="polite"></span>
      </div>` : ''}
    `;

    const $stage = container.querySelector('.court-stage');
    const $play = container.querySelector('.court-play');
    const $prev = container.querySelector('.court-prev');
    const $next = container.querySelector('.court-next');
    const $scrub = container.querySelector('.court-scrub');
    const $label = container.querySelector('.court-steplabel');

    let t = 0;
    let playing = false;
    let started = false; // до первого play показываем статичный «постер» (все удары)
    let speed = opts.speed || 1;
    let rafId = null;
    let lastTs = 0;

    function draw() {
      $stage.innerHTML = renderScene(scene, started ? t : null);
      if ($scrub) $scrub.value = String(t);
      if ($label) {
        const i = stepIndexAt(tl.starts, t);
        const step = scene.steps[i];
        $label.textContent = step ? (step.label || `Шаг ${i + 1}`) : '';
      }
      if ($play) $play.textContent = playing ? '❚❚' : '▶';
    }

    function frame(ts) {
      if (!playing) return;
      if (!lastTs) lastTs = ts;
      t += ((ts - lastTs) / 1000) * speed;
      lastTs = ts;
      if (t >= tl.total) { t = tl.total; playing = false; }
      draw();
      if (playing) rafId = requestAnimationFrame(frame);
    }

    const api = {
      play() {
        if (playing || tl.total <= 0) return;
        if (t >= tl.total) t = 0;          // повтор с начала
        started = true; playing = true; lastTs = 0;
        rafId = requestAnimationFrame(frame);
        draw();
      },
      pause() { playing = false; if (rafId) cancelAnimationFrame(rafId); draw(); },
      toggle() { playing ? api.pause() : api.play(); },
      seek(v) { t = Math.max(0, Math.min(tl.total, v)); started = t > 0; draw(); },
      next() { const s = nextStepStart(tl.starts, t); api.pause(); api.seek(s == null ? tl.total : s); },
      prev() { api.pause(); api.seek(prevStepStart(tl.starts, t)); },
      restart() { api.pause(); t = 0; started = false; draw(); },
      destroy() { api.pause(); container.innerHTML = ''; },
      get state() { return { t, playing, total: tl.total, speed }; },
    };

    if ($play) $play.addEventListener('click', () => api.toggle());
    if ($next) $next.addEventListener('click', () => api.next());
    if ($prev) $prev.addEventListener('click', () => api.prev());
    if ($scrub) $scrub.addEventListener('input', () => { api.pause(); api.seek(parseFloat($scrub.value)); });

    draw();
    return api;
  }

  // --- Custom element <squash-court dsl="…" [controls]> ---
  function defineElement() {
    if (typeof customElements === 'undefined' || customElements.get('squash-court')) return;
    customElements.define('squash-court', class extends HTMLElement {
      connectedCallback() {
        const src = this.getAttribute('dsl') || this.textContent.trim();
        this._api = mountCourt(this, src, { controls: this.hasAttribute('controls') });
      }
      disconnectedCallback() { if (this._api) this._api.destroy(); }
    });
  }
  if (typeof customElements !== 'undefined') defineElement();

  return { mountCourt, defineElement, nextStepStart, prevStepStart, stepIndexAt };
});
