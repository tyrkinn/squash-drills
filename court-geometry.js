// Court geometry: координатная система, именованные позиции и путевая математика.
// Система координат: 200×305 (передняя стена сверху, y=0; задняя снизу, y=305).
// x=25 — левая стена, x=175 — правая, центр x=100. См. docs/adr/0002-svg-court-renderer.md.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SquashCourtGeo = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const COURT = { W: 200, H: 305, SHORT_LINE_Y: 133, SERVICE_BOX_SIZE: 50, MID_X: 100 };

  const POS = {
    FL: [25, 18], FR: [175, 18], BL: [25, 285], BR: [175, 285],
    FW_L: [55, 8], FW_C: [100, 8], FW_R: [145, 8],
    T: [100, 133], T_L: [70, 133], T_R: [130, 133], T_BACK: [100, 160], T_FRONT: [100, 110],
    SB_L: [25, 158], SB_R: [175, 158],
    MID_BL: [50, 230], MID_BR: [150, 230],
    SW_L_BACK: [5, 210], SW_R_BACK: [195, 210], SW_L_FRONT: [5, 70], SW_R_FRONT: [195, 70],
    SW_L: [5, 140], SW_R: [195, 140],
  };

  function resolvePos(p) {
    return typeof p === 'string' ? (POS[p] || [100, 150]) : p;
  }

  // Point at fraction u∈[0,1] along a polyline of resolved [x,y] points,
  // parameterised by arc length.
  function pointAtT(points, u) {
    if (points.length === 1) return points[0].slice();
    const segs = [];
    let total = 0;
    for (let i = 1; i < points.length; i++) {
      const len = Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
      segs.push(len);
      total += len;
    }
    if (total === 0) return points[0].slice();
    let dist = Math.max(0, Math.min(1, u)) * total;
    for (let i = 0; i < segs.length; i++) {
      if (dist <= segs[i] || i === segs.length - 1) {
        const t = segs[i] ? dist / segs[i] : 0;
        const a = points[i], b = points[i + 1];
        return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      }
      dist -= segs[i];
    }
    return points[points.length - 1].slice();
  }

  // Cubic ease-in-out for u∈[0,1]: медленный старт (контакт) и торможение в конце.
  function easeInOut(u) {
    u = Math.max(0, Math.min(1, u));
    return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
  }

  // Cubic ease-out: резкий старт, торможение к концу — профиль мяча с ракетки.
  function easeOut(u) {
    u = Math.max(0, Math.min(1, u));
    return 1 - Math.pow(1 - u, 3);
  }

  return { COURT, POS, resolvePos, pointAtT, easeInOut, easeOut };
});
