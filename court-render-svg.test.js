const { test } = require('node:test');
const assert = require('node:assert/strict');
const { renderScene, timeline } = require('./court-render-svg.js');
const { parseScene } = require('./court-dsl.js');

test('timeline: явные длительности дают детерминированные старты/тотал', () => {
  const scene = parseScene('step\n A drive BR -> FW_R over 1s\nstep\n A move BR -> T over 0.7s');
  const tl = timeline(scene);
  assert.deepEqual(tl.starts, [0, 1]);
  assert.equal(tl.total, 1.7);
});

test('шаг «удар + догоняющий рывок»: длительность задаёт мяч, а не длинный рывок', () => {
  // короткий быстрый удар + длинный рывок через весь корт
  const scene = parseScene('step\n A drive [100,30] -> [100,15]\n A move [175,285] -> [25,285]');
  const tl = timeline(scene);
  // шаг ограничен ~полётом мяча + отскок (мяч не лежит мёртвым весь долгий рывок)
  assert.ok(tl.total < 0.7, `ожидали < 0.7с, получили ${tl.total}`);
});

test('timeline: авто-длительность ∝ длине пути (постоянная скорость)', () => {
  const long = timeline(parseScene('step\n A drive [100,290] -> [100,10]'));  // 280 ед.
  const short = timeline(parseScene('step\n A drive [100,200] -> [100,80]')); // 120 ед.
  assert.ok(long.total > short.total, 'длинный удар должен лететь дольше');
  // 280/120 ≈ 2.33 — отношение длительностей близко к отношению длин
  assert.ok(long.total / short.total > 1.8 && long.total / short.total < 2.9);
});

test('renderScene статика: рисует игроков и удары, без мяча', () => {
  const scene = parseScene('player A at BR\nplayer B at BL\nstep\n A drive BR -> FW_R');
  const svg = renderScene(scene);
  assert.match(svg, /^<svg/);
  assert.equal((svg.match(/court-player-label/g) || []).length, 2);
  assert.ok(!svg.includes('court-ball'));
});

test('renderScene(scene, t): при анимации появляется мяч', () => {
  const scene = parseScene('player A at BR\nstep\n A drive BR -> FW_R');
  assert.ok(renderScene(scene, 0.5).includes('court-ball'));
});

test('мяч не исчезает в шаге-перемещении: покоится после удара', () => {
  const scene = parseScene('player A at BR\nstep\n A drive [100,260] -> [100,20]\nstep\n A move [100,260] -> [100,20]');
  const tl = timeline(scene);
  const svg = renderScene(scene, tl.starts[1] + 0.05); // внутри шага move
  assert.ok(svg.includes('court-ball'), 'мяч должен лежать в точке конца удара, пока игрок бежит');
});
