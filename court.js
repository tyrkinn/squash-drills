// Squash court diagram renderer
// Top-down view, front wall at top.
// Coordinate system matches court dimensions in mm: 6400 x 9750
// We use a normalized 200x305 viewBox for clean math.

const COURT = {
  W: 200,
  H: 305,
  SHORT_LINE_Y: 133,        // 4.26m of 9.75m
  SERVICE_BOX_SIZE: 50,     // 1.6m of 6.4m
  MID_X: 100,
};

// Named positions on the court for easy authoring of drill diagrams.
const POS = {
  // Corners (slightly inset for visual clarity)
  FL: [25, 18],       // front-left
  FR: [175, 18],      // front-right
  BL: [25, 285],      // back-left
  BR: [175, 285],     // back-right
  // Front wall targets
  FW_L: [55, 8],
  FW_C: [100, 8],
  FW_R: [145, 8],
  // T-point and around it
  T: [100, 133],
  T_L: [70, 133],
  T_R: [130, 133],
  T_BACK: [100, 160],
  T_FRONT: [100, 110],
  // Service box centers
  SB_L: [25, 158],
  SB_R: [175, 158],
  // Mid back court
  MID_BL: [50, 230],
  MID_BR: [150, 230],
  // Side wall midpoints
  SW_L_BACK: [5, 210],
  SW_R_BACK: [195, 210],
  SW_L_FRONT: [5, 70],
  SW_R_FRONT: [195, 70],
};

function resolvePos(p) {
  if (typeof p === 'string') return POS[p] || [100, 150];
  return p;
}

// Build a curved path between two points with optional curvature.
// curve: -1..1 (negative bends left, positive bends right relative to direction)
function curvedPath(from, to, curve = 0) {
  const [x1, y1] = from;
  const [x2, y2] = to;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  // perpendicular vector
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const perpX = -dy / len;
  const perpY = dx / len;
  const offset = curve * len * 0.35;
  const cx = mx + perpX * offset;
  const cy = my + perpY * offset;
  return `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`;
}

// Stroke color by shot type
const SHOT_STYLE = {
  drive:  { color: '#1A1A1A', dash: '' },
  cross:  { color: '#4A6FA5', dash: '' },
  boast:  { color: '#E07A1F', dash: '' },
  drop:   { color: '#5B9279', dash: '' },
  lob:    { color: '#9B6BD9', dash: '' },
  volley: { color: '#1A1A1A', dash: '4 3' },
  serve:  { color: '#1A1A1A', dash: '6 3' },
};

/**
 * Render a court diagram as SVG markup.
 *
 * diagram = {
 *   shots:  [{ from, to, type, curve?, label? }],
 *   players:[{ at, label, role? }],   // role: 'A' (primary) | 'B' (secondary)
 *   zones:  [{ at: [x,y,w,h], label? }],
 *   note?:  string
 * }
 */
function renderCourt(diagram = {}) {
  const W = COURT.W, H = COURT.H;
  const SL = COURT.SHORT_LINE_Y;
  const SB = COURT.SERVICE_BOX_SIZE;
  const MX = COURT.MID_X;

  let svg = `<svg viewBox="-8 -22 ${W + 16} ${H + 30}" xmlns="http://www.w3.org/2000/svg" class="court-svg" role="img" aria-label="Схема корта">`;

  // Defs: arrow markers per shot type
  svg += `<defs>`;
  for (const [type, st] of Object.entries(SHOT_STYLE)) {
    svg += `<marker id="arr-${type}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M0 0 L10 5 L0 10 z" fill="${st.color}"/>
    </marker>`;
  }
  svg += `</defs>`;

  // Front wall label
  svg += `<text x="${MX}" y="-10" class="court-label-fw" text-anchor="middle">FRONT WALL</text>`;
  // Tick marks on the front wall (decorative — represent tin/cut line subtly)
  svg += `<line x1="0" y1="-3" x2="${W}" y2="-3" stroke="#1A1A1A" stroke-width="2.5" stroke-linecap="square"/>`;

  // Court outline
  svg += `<rect x="0" y="0" width="${W}" height="${H}" fill="#FFFFFF" stroke="#1A1A1A" stroke-width="1.5"/>`;

  // Short line
  svg += `<line x1="0" y1="${SL}" x2="${W}" y2="${SL}" stroke="#1A1A1A" stroke-width="1"/>`;
  // Half court line
  svg += `<line x1="${MX}" y1="${SL}" x2="${MX}" y2="${H}" stroke="#1A1A1A" stroke-width="1"/>`;
  // Service boxes
  svg += `<rect x="0" y="${SL}" width="${SB}" height="${SB}" fill="none" stroke="#1A1A1A" stroke-width="1"/>`;
  svg += `<rect x="${W - SB}" y="${SL}" width="${SB}" height="${SB}" fill="none" stroke="#1A1A1A" stroke-width="1"/>`;

  // T marker (subtle)
  svg += `<circle cx="${MX}" cy="${SL}" r="2" fill="#1A1A1A"/>`;

  // Target zones (highlighted areas)
  if (diagram.zones) {
    diagram.zones.forEach((z) => {
      const [x, y, w, h] = z.at;
      svg += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#D9DB2A" fill-opacity="0.35" stroke="#B8BA1A" stroke-width="0.8" stroke-dasharray="3 2"/>`;
      if (z.label) {
        svg += `<text x="${x + w / 2}" y="${y + h / 2 + 3}" class="court-zone-label" text-anchor="middle">${z.label}</text>`;
      }
    });
  }

  // Shots (drawn before players so players sit on top)
  if (diagram.shots) {
    diagram.shots.forEach((shot, i) => {
      const from = resolvePos(shot.from);
      const to = resolvePos(shot.to);
      const style = SHOT_STYLE[shot.type] || SHOT_STYLE.drive;
      const path = curvedPath(from, to, shot.curve ?? 0);
      svg += `<path d="${path}" fill="none" stroke="${style.color}" stroke-width="1.6" stroke-linecap="round" stroke-dasharray="${style.dash}" marker-end="url(#arr-${shot.type || 'drive'})"/>`;

      // Step number
      const label = shot.label ?? String(i + 1);
      if (label !== '') {
        const [lx, ly] = from;
        svg += `<g>
          <circle cx="${lx}" cy="${ly}" r="6.5" fill="#FFFFFF" stroke="${style.color}" stroke-width="1.4"/>
          <text x="${lx}" y="${ly + 2.3}" class="court-step-label" text-anchor="middle" fill="${style.color}">${label}</text>
        </g>`;
      }
    });
  }

  // Players
  if (diagram.players) {
    diagram.players.forEach((p) => {
      const [px, py] = resolvePos(p.at);
      const isB = p.role === 'B';
      const fill = isB ? '#FFFFFF' : '#1A1A1A';
      const stroke = '#1A1A1A';
      const textFill = isB ? '#1A1A1A' : '#FFFFFF';
      svg += `<g>
        <circle cx="${px}" cy="${py}" r="9" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>
        <text x="${px}" y="${py + 3.2}" class="court-player-label" text-anchor="middle" fill="${textFill}">${p.label || ''}</text>
      </g>`;
    });
  }

  // Back wall label
  svg += `<text x="${MX}" y="${H + 13}" class="court-label-bw" text-anchor="middle">BACK WALL</text>`;

  svg += `</svg>`;
  return svg;
}

// Tiny inline legend SVG for shot types used in a diagram
function renderLegend(types = []) {
  if (!types.length) return '';
  const labels = {
    drive: 'драйв',
    cross: 'кросс',
    boast: 'бэст',
    drop: 'дроп',
    lob: 'лоб',
    volley: 'волей',
    serve: 'подача',
  };
  return `<div class="court-legend">${types
    .map((t) => {
      const st = SHOT_STYLE[t] || SHOT_STYLE.drive;
      return `<span class="court-legend-item"><svg width="22" height="8" viewBox="0 0 22 8"><line x1="1" y1="4" x2="21" y2="4" stroke="${st.color}" stroke-width="1.6" stroke-dasharray="${st.dash}" stroke-linecap="round"/></svg>${labels[t] || t}</span>`;
    })
    .join('')}</div>`;
}

window.SquashCourt = { renderCourt, renderLegend, POS, COURT };
