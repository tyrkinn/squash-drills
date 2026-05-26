// Squash court DSL parser: текст → Scene-модель (IR).
// Грамматика построчная. См. docs/adr/0003-court-engine-architecture.md и CONTEXT.md.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SquashCourtDSL = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const SHOT_TYPES = new Set(['drive', 'cross', 'boast', 'drop', 'lob', 'volley', 'serve']);

  // Parse "<pos> -> <pos> [-> ...] [over <d>s | @<d>] [curve <c>]" into a path + modifiers.
  // duration остаётся undefined, если не задана явно — её вычислит геометрический слой (∝ длине).
  function parsePathAndMods(rest) {
    let duration, curve;
    const over = rest.match(/\b(?:over\s+([\d.]+)s?|@([\d.]+))/);
    if (over) { duration = parseFloat(over[1] != null ? over[1] : over[2]); rest = rest.replace(over[0], ''); }
    const cv = rest.match(/\bcurve\s+(-?[\d.]+)/);
    if (cv) { curve = parseFloat(cv[1]); rest = rest.replace(cv[0], ''); }
    const path = rest.split('->').map((s) => parseNode(s.trim())).filter((n) => n !== '');
    return { path, duration, curve };
  }

  // A path node is either a named position ("BR") or a coordinate "[x,y]".
  function parseNode(s) {
    const m = s.match(/^\[\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\]$/);
    return m ? [parseFloat(m[1]), parseFloat(m[2])] : s;
  }

  function parseScene(src) {
    const scene = { court: { type: 'full' }, entities: [], steps: [], zones: [] };
    const lines = String(src).split('\n');

    const lastStep = () => {
      if (!scene.steps.length) scene.steps.push({ label: null, actions: [] });
      return scene.steps[scene.steps.length - 1];
    };
    const addAction = (action) => { lastStep().actions.push(action); };
    for (const raw of lines) {
      const line = raw.replace(/#.*$/, '').trim();
      if (!line) continue;
      const tok = line.split(/\s+/);
      if (tok[0] === 'court') {
        scene.court.type = tok[1];
      } else if (tok[0] === 'player') {
        // player <id> at <pos>  (pos: имя или [x,y])
        const pm = line.match(/^player\s+(\S+)\s+at\s+(.+)$/);
        scene.entities.push({ id: pm[1], role: pm[1] === 'B' ? 'B' : 'A', at: parseNode(pm[2].trim()) });
      } else if (tok[0] === 'step') {
        // step ["label"]
        const m = line.match(/^step\b\s*(?:"([^"]*)")?/);
        scene.steps.push({ label: m[1] != null ? m[1] : null, actions: [] });
      } else if (tok[0] === 'zone') {
        // zone ["label"] [x,y,w,h]
        const zm = line.match(/^zone\b\s*(?:"([^"]*)")?\s*\[([^\]]*)\]/);
        scene.zones.push({
          label: zm[1] != null ? zm[1] : null,
          at: zm[2].split(',').map((s) => parseFloat(s.trim())),
        });
      } else if (tok[0] === 'wait') {
        // wait <d>s — отдельный шаг-пауза
        const d = parseFloat(tok[1]);
        scene.steps.push({ label: null, actions: [{ kind: 'wait', duration: d }] });
      } else if (tok[1] === 'move') {
        // <actor> move <pos> -> <pos> [over <d>s | @<d>]
        const m = line.match(/^(\S+)\s+move\s+(.*)$/);
        const { path, duration } = parsePathAndMods(m[2]);
        const action = { kind: 'move', actor: m[1], path };
        if (duration != null) action.duration = duration;
        addAction(action);
      } else if (SHOT_TYPES.has(tok[1])) {
        // <actor> <type> <pos> -> <pos> [-> ...] [over <d>s | @<d>] [curve <c>]
        const m = line.match(/^(\S+)\s+(\S+)\s+(.*)$/);
        const { path, duration, curve } = parsePathAndMods(m[3]);
        const action = { kind: 'shot', actor: m[1], type: m[2], path };
        if (duration != null) action.duration = duration;
        if (curve != null) action.curve = curve;
        addAction(action);
      }
    }
    return scene;
  }

  return { parseScene };
});
