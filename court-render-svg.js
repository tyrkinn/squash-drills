// SVG renderer: (scene, t) → SVG-разметка. Чистая функция от сцены и playhead.
// Зависит только от court-geometry. См. docs/adr/0002-svg-court-renderer.md.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./court-geometry.js'));
  else root.SquashCourtRender = factory(root.SquashCourtGeo);
})(typeof self !== 'undefined' ? self : this, function (Geo) {
  const { COURT, resolvePos, pointAtT, easeInOut, easeOut } = Geo;
  const FADE = 0.28;   // сек: окно кроссфейда подсветки между шагами
  const HIT = 0.22;    // сек: длительность импульса-кольца в момент удара
  // Скорости в единицах корта/сек (≈31.25 ед = 1 м). Время полёта ∝ длине пути.
  // Осознанно замедлено относительно реальности (реальный драйв ~20–40 м/с — слишком
  // быстро, чтобы следить), но сохранена натуральная иерархия: мяч заметно быстрее
  // бегущего игрока, а дроп/лоб медленнее драйва. Темп воспроизведения крутит плеер.
  // Скорость мяча по типам (с учётом ease-out — это средняя; пиковая на старте в ~2–3× выше).
  // Умеренная, чтобы игрок успевал прийти к приземлению на реалистичных ~6–7 м/с.
  const SHOT_PACE = {            // ед/с
    drive: 280, cross: 280, kill: 340, serve: 270, volley: 290,
    boast: 250,                                                  // теряет на боковой стене
    lob: 200, drop: 210,                                         // медленные
  };
  const DEFAULT_SHOT_PACE = 270;
  const MOVE_PACE = 140;         // ~4.5 м/с — темп для чистых перемещений (шаг без удара)
  const MIN_SHOT = 0.3, MIN_MOVE = 0.4;

  const SHOT_STYLE = {
    drive:  { color: 'var(--shot-drive, #1A1A1A)', dash: '' },
    cross:  { color: 'var(--shot-cross, #4A6FA5)', dash: '' },
    boast:  { color: 'var(--shot-boast, #E07A1F)', dash: '' },
    drop:   { color: 'var(--shot-drop, #5B9279)', dash: '' },
    lob:    { color: 'var(--shot-lob, #9B6BD9)', dash: '' },
    volley: { color: 'var(--shot-volley, #1A1A1A)', dash: '4 3' },
    serve:  { color: 'var(--shot-serve, #1A1A1A)', dash: '6 3' },
  };

  // Quadratic arc between two points; curve in -1..1 bends perpendicular to direction.
  function arcPath(from, to, curve = 0) {
    const [x1, y1] = from, [x2, y2] = to;
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const cx = mx + (-dy / len) * curve * len * 0.35;
    const cy = my + (dx / len) * curve * len * 0.35;
    return { d: `M ${x1} ${y1} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${x2} ${y2}`, ctrl: [cx, cy] };
  }

  function pathLen(path) {
    const pts = path.map(resolvePos);
    let L = 0;
    for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    return L;
  }

  // Длительность действия: явная, иначе ∝ длине пути при постоянной скорости.
  function actionDuration(a) {
    if (a.duration != null) return a.duration;
    if (a.kind === 'shot') return Math.max(MIN_SHOT, pathLen(a.path) / (SHOT_PACE[a.type] || DEFAULT_SHOT_PACE));
    if (a.kind === 'move') return Math.max(MIN_MOVE, pathLen(a.path) / MOVE_PACE);
    return 0; // wait без duration = 0
  }

  // Длительность шага. Если есть удар — темп задаёт полёт мяча, и игрок обязан прийти
  // ровно к приземлению (его рывок вписывается в это время). Шаг без удара (чистое
  // перемещение / пауза) идёт в реальном темпе игрока.
  function stepDuration(step) {
    let shotDur = 0, otherDur = 0;
    for (const a of step.actions) {
      const d = actionDuration(a);
      if (a.kind === 'shot') shotDur = Math.max(shotDur, d);
      else otherDur = Math.max(otherDur, d);
    }
    return shotDur > 0 ? shotDur : otherDur;
  }

  // Конечная точка последнего удара в шагах ≤ uptoStep (где «лежит» мяч), или null.
  function lastShotEnd(scene, uptoStep) {
    for (let i = uptoStep; i >= 0; i--) {
      const ss = scene.steps[i].actions.filter((a) => a.kind === 'shot');
      if (ss.length) {
        const pts = ss[ss.length - 1].path.map(resolvePos);
        return pts[pts.length - 1];
      }
    }
    return null;
  }

  // Старты шагов и суммарная длительность (длительности вычисляются по геометрии).
  function timeline(scene) {
    let total = 0;
    const stepDur = [];
    const starts = scene.steps.map((s) => {
      const at = total; const d = stepDuration(s); stepDur.push(d); total += d; return at;
    });
    return { starts, total, stepDur };
  }

  // Entity position at time t: apply every `move` of this entity up to t.
  function entityPosAt(scene, entity, t, tl) {
    let pos = resolvePos(entity.at);
    scene.steps.forEach((step, i) => {
      const start = tl.starts[i];
      step.actions.forEach((a) => {
        if (a.kind !== 'move' || a.actor !== entity.id) return;
        const pts = a.path.map(resolvePos);
        const d = tl.stepDur[i]; // рывок вписан во весь шаг — игрок приходит к удару/концу шага
        if (t >= start + d) pos = pts[pts.length - 1];
        else if (t >= start) pos = pointAtT(pts, easeInOut((t - start) / (d || 1)));
      });
    });
    return pos;
  }

  // Which step index is active at time t (for highlighting), or -1.
  function activeStep(t, tl) {
    if (t == null) return -1;
    for (let i = tl.starts.length - 1; i >= 0; i--) if (t >= tl.starts[i]) return i;
    return -1;
  }

  function renderScene(scene, t = null) {
    const W = COURT.W, H = COURT.H, SL = COURT.SHORT_LINE_Y, SB = COURT.SERVICE_BOX_SIZE, MX = COURT.MID_X;
    const tl = timeline(scene);
    const animating = t != null;
    const cur = activeStep(t, tl);

    // Плавная подсветка: шаг разгорается/гаснет за окно FADE вокруг своего интервала.
    const stepOpacity = (si) => {
      if (!animating) return 1;
      const start = tl.starts[si];
      const end = start + tl.stepDur[si];
      if (t < start - FADE || t > end + FADE) return 0.16;
      let k = 1;
      if (t < start) k = (t - (start - FADE)) / FADE;
      else if (t > end) k = 1 - (t - end) / FADE;
      return 0.16 + 0.84 * Math.max(0, Math.min(1, k));
    };

    let svg = `<svg viewBox="-10 -24 ${W + 20} ${H + 34}" xmlns="http://www.w3.org/2000/svg" class="court-svg" role="img" aria-label="Схема корта">`;

    svg += `<defs>`;
    for (const [type, st] of Object.entries(SHOT_STYLE)) {
      svg += `<marker id="csarr-${type}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="${st.color}"/></marker>`;
    }
    svg += `</defs>`;

    // Court frame
    svg += `<text x="${MX}" y="-12" class="court-label-fw" text-anchor="middle">ПЕРЕДНЯЯ СТЕНА</text>`;
    svg += `<line x1="0" y1="-3" x2="${W}" y2="-3" stroke="var(--court-ink,#1A1A1A)" stroke-width="2.5" stroke-linecap="square"/>`;
    svg += `<rect x="0" y="0" width="${W}" height="${H}" rx="2" fill="var(--court-floor,#FFFFFF)" stroke="var(--court-ink,#1A1A1A)" stroke-width="1.5"/>`;
    svg += `<line x1="0" y1="${SL}" x2="${W}" y2="${SL}" stroke="var(--court-line,#1A1A1A)" stroke-width="1"/>`;
    svg += `<line x1="${MX}" y1="${SL}" x2="${MX}" y2="${H}" stroke="var(--court-line,#1A1A1A)" stroke-width="1"/>`;
    svg += `<rect x="0" y="${SL}" width="${SB}" height="${SB}" fill="none" stroke="var(--court-line,#1A1A1A)" stroke-width="1"/>`;
    svg += `<rect x="${W - SB}" y="${SL}" width="${SB}" height="${SB}" fill="none" stroke="var(--court-line,#1A1A1A)" stroke-width="1"/>`;
    svg += `<circle cx="${MX}" cy="${SL}" r="2.2" fill="var(--court-ink,#1A1A1A)"/>`;
    svg += `<text x="${MX}" y="${H + 15}" class="court-label-bw" text-anchor="middle">ЗАДНЯЯ СТЕНА</text>`;
    svg += `<text x="-6" y="${SL + 4}" class="court-label-side" text-anchor="middle" transform="rotate(-90 -6 ${SL})">ЛЕВ</text>`;
    svg += `<text x="${W + 6}" y="${SL + 4}" class="court-label-side" text-anchor="middle" transform="rotate(90 ${W + 6} ${SL})">ПРАВ</text>`;

    // Zones
    (scene.zones || []).forEach((z) => {
      const [x, y, w, h] = z.at;
      svg += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2" fill="var(--court-zone,#D9DB2A)" fill-opacity="0.32" stroke="var(--court-zone-edge,#B8BA1A)" stroke-width="0.8" stroke-dasharray="3 2"/>`;
      if (z.label) svg += `<text x="${x + w / 2}" y="${y + h / 2 + 3}" class="court-zone-label" text-anchor="middle">${z.label}</text>`;
    });

    // Shots (flattened with their step index for ordering / highlight)
    const shots = [];
    scene.steps.forEach((step, si) => step.actions.forEach((a) => { if (a.kind === 'shot') shots.push({ a, si }); }));
    shots.forEach(({ a, si }, idx) => {
      const st = SHOT_STYLE[a.type] || SHOT_STYLE.drive;
      const pts = a.path.map(resolvePos);
      const op = animating ? stepOpacity(si) : 1;
      let d = '';
      for (let i = 1; i < pts.length; i++) d += arcPath(pts[i - 1], pts[i], (a.curve || 0)).d + ' ';
      svg += `<path d="${d.trim()}" fill="none" stroke="${st.color}" stroke-width="1.7" stroke-linecap="round" stroke-dasharray="${st.dash}" opacity="${op}" marker-end="url(#csarr-${a.type})"/>`;
      const [lx, ly] = pts[0];
      const label = a.label != null ? a.label : String(idx + 1);
      svg += `<g opacity="${op}"><circle cx="${lx}" cy="${ly}" r="6.5" fill="var(--court-floor,#FFF)" stroke="${st.color}" stroke-width="1.4"/><text x="${lx}" y="${ly + 2.3}" class="court-step-label" text-anchor="middle" fill="${st.color}">${label}</text></g>`;
    });

    // Мяч: в шаге с ударами летит (eased) + импульс удара; в шагах без удара — лежит.
    const ball = (bx, by, r, op) =>
      `<circle class="court-ball" cx="${bx.toFixed(1)}" cy="${by.toFixed(1)}" r="${r.toFixed(1)}" fill="var(--court-ball,#D9DB2A)" stroke="var(--court-ink,#1A1A1A)" stroke-width="1" opacity="${op.toFixed(2)}"/>`;
    if (animating && cur >= 0) {
      const start = tl.starts[cur];
      const since = t - start;
      const curShots = scene.steps[cur].actions.filter((a) => a.kind === 'shot');
      if (curShots.length) {
        curShots.forEach((shot) => {
          const st = SHOT_STYLE[shot.type] || SHOT_STYLE.drive;
          const pts = shot.path.map(resolvePos);
          const raw = Math.max(0, Math.min(1, since / (actionDuration(shot) || 1)));
          const [bx, by] = pointAtT(pts, easeOut(raw)); // мяч: быстрый вылет → торможение
          const op = Math.max(0, Math.min(1, raw / 0.06)); // только проявление; в конце остаётся
          const r = 3.4 + 1.8 * Math.max(0, 1 - raw / 0.12); // «поп» при контакте
          if (since >= 0 && since < HIT) { // кольцо-импульс в точке удара
            const p = since / HIT;
            const [sx, sy] = pts[0];
            svg += `<circle cx="${sx}" cy="${sy}" r="${(6 + 13 * p).toFixed(1)}" fill="none" stroke="${st.color}" stroke-width="1.5" opacity="${(0.6 * (1 - p)).toFixed(2)}"/>`;
          }
          svg += ball(bx, by, r, op);
        });
      } else {
        // шаг без удара (move/wait) — мяч покоится в точке приземления последнего удара
        const rest = lastShotEnd(scene, cur);
        if (rest) svg += ball(rest[0], rest[1], 3.4, 1);
      }
    }

    // Players (at their position for time t, or initial)
    (scene.entities || []).forEach((e) => {
      const [px, py] = animating ? entityPosAt(scene, e, t, tl) : resolvePos(e.at);
      const isB = e.role === 'B';
      svg += `<g><circle cx="${px.toFixed ? px.toFixed(1) : px}" cy="${py.toFixed ? py.toFixed(1) : py}" r="9" fill="${isB ? 'var(--court-floor,#FFF)' : 'var(--court-ink,#1A1A1A)'}" stroke="var(--court-ink,#1A1A1A)" stroke-width="1.5"/><text x="${px.toFixed ? px.toFixed(1) : px}" y="${(py + 3.2).toFixed ? (py + 3.2).toFixed(1) : py + 3.2}" class="court-player-label" text-anchor="middle" fill="${isB ? 'var(--court-ink,#1A1A1A)' : 'var(--court-floor,#FFF)'}">${e.id}</text></g>`;
    });

    svg += `</svg>`;
    return svg;
  }

  return { renderScene, timeline, SHOT_STYLE };
});
