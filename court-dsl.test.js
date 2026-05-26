const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseScene } = require('./court-dsl.js');

test('один игрок: player A at BR → Scene с дефолтным кортом', () => {
  const scene = parseScene('player A at BR');
  assert.equal(scene.court.type, 'full');
  assert.deepEqual(scene.entities, [{ id: 'A', role: 'A', at: 'BR' }]);
  assert.deepEqual(scene.steps, []);
  assert.deepEqual(scene.zones, []);
});

test('step создаёт шаг: с меткой в кавычках и без метки', () => {
  const scene = parseScene('step "Прямой драйв"\nstep');
  assert.deepEqual(scene.steps, [
    { label: 'Прямой драйв', actions: [] },
    { label: null, actions: [] },
  ]);
});

test('удар без явного времени: длительность не задаётся (auto в геом. слое)', () => {
  const scene = parseScene('step\n  A drive BR -> FW_R');
  assert.deepEqual(scene.steps[0].actions, [
    { kind: 'shot', actor: 'A', type: 'drive', path: ['BR', 'FW_R'] },
  ]);
});

test('многосегментный путь + явные over/curve: модификаторы не попадают в путь', () => {
  const scene = parseScene('step\n  A boast BR -> SW_R -> FW_L over 1.5s curve 0.3');
  const a = scene.steps[0].actions[0];
  assert.deepEqual(a.path, ['BR', 'SW_R', 'FW_L']);
  assert.equal(a.duration, 1.5);
  assert.equal(a.curve, 0.3);
});

test('move без явного времени: длительность auto', () => {
  const scene = parseScene('step\n  A move BR -> T');
  assert.deepEqual(scene.steps[0].actions, [
    { kind: 'move', actor: 'A', path: ['BR', 'T'] },
  ]);
});

test('wait создаёт отдельный шаг-паузу с явной длительностью', () => {
  const scene = parseScene('wait 0.4s');
  assert.deepEqual(scene.steps, [
    { label: null, actions: [{ kind: 'wait', duration: 0.4 }] },
  ]);
});

test('zone: с меткой и без, координаты [x,y,w,h]', () => {
  const scene = parseScene('zone "зачёт" [0,240,50,65]\nzone [10,20,30,40]');
  assert.deepEqual(scene.zones, [
    { label: 'зачёт', at: [0, 240, 50, 65] },
    { label: null, at: [10, 20, 30, 40] },
  ]);
});

test('комментарии # игнорируются (целая строка и хвост)', () => {
  const scene = parseScene('# заголовок\nstep "x"\n  A drive BR -> FW_R   # прямой удар');
  assert.equal(scene.steps.length, 1);
  assert.equal(scene.steps[0].label, 'x');
  assert.deepEqual(scene.steps[0].actions[0].path, ['BR', 'FW_R']);
});

test('координатные узлы пути парсятся в [x,y]', () => {
  const scene = parseScene('step\n  A drive [175,250] -> FW_R');
  assert.deepEqual(scene.steps[0].actions[0].path, [[175, 250], 'FW_R']);
});

test('player at с координатой парсится в [x,y]', () => {
  const scene = parseScene('player A at [175,250]\nplayer B at BL');
  assert.deepEqual(scene.entities[0].at, [175, 250]);
  assert.equal(scene.entities[1].at, 'BL');
});

test('директива court задаёт тип; партнёр B получает role B', () => {
  const scene = parseScene('court right-half\nplayer A at BR\nplayer B at BL');
  assert.equal(scene.court.type, 'right-half');
  assert.deepEqual(scene.entities, [
    { id: 'A', role: 'A', at: 'BR' },
    { id: 'B', role: 'B', at: 'BL' },
  ]);
});
