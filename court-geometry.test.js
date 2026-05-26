const { test } = require('node:test');
const assert = require('node:assert/strict');
const { resolvePos, pointAtT, easeInOut, easeOut } = require('./court-geometry.js');

test('resolvePos: имя → координаты, массив → как есть, неизвестное → центр', () => {
  assert.deepEqual(resolvePos('T'), [100, 133]);
  assert.deepEqual(resolvePos([5, 7]), [5, 7]);
  assert.deepEqual(resolvePos('???'), [100, 150]);
});

test('easeInOut: концы и симметрия, медленный старт', () => {
  assert.equal(easeInOut(0), 0);
  assert.equal(easeInOut(1), 1);
  assert.equal(easeInOut(0.5), 0.5);
  assert.ok(easeInOut(0.25) < 0.25); // ease-in: медленнее в начале
});

test('easeOut: быстрый старт, торможение к концу (мяч с ракетки)', () => {
  assert.equal(easeOut(0), 0);
  assert.equal(easeOut(1), 1);
  assert.ok(easeOut(0.5) > 0.5);   // за половину времени пройдено больше половины пути
  assert.ok(easeOut(0.2) > 0.4);   // резкий старт
});

test('pointAtT: середина одного отрезка', () => {
  assert.deepEqual(pointAtT([[0, 0], [10, 0]], 0.5), [5, 0]);
});

test('pointAtT: многосегментный путь по длине дуги, концы зажаты', () => {
  const path = [[0, 0], [10, 0], [10, 10]]; // суммарная длина 20
  assert.deepEqual(pointAtT(path, 0), [0, 0]);
  assert.deepEqual(pointAtT(path, 1), [10, 10]);
  assert.deepEqual(pointAtT(path, 0.5), [10, 0]);   // 10 от 20 → конец 1-го сегмента
  assert.deepEqual(pointAtT(path, 0.75), [10, 5]);  // 15 от 20 → середина 2-го
});
