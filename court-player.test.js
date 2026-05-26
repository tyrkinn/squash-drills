const { test } = require('node:test');
const assert = require('node:assert/strict');
const { nextStepStart, prevStepStart, stepIndexAt } = require('./court-player.js');

const starts = [0, 1, 2.4];

test('nextStepStart: следующий старт строго больше t, иначе null', () => {
  assert.equal(nextStepStart(starts, 0), 1);
  assert.equal(nextStepStart(starts, 1.5), 2.4);
  assert.equal(nextStepStart(starts, 2.4), null);
});

test('prevStepStart: предыдущий старт строго меньше t, иначе 0', () => {
  assert.equal(prevStepStart(starts, 2.4), 1);
  assert.equal(prevStepStart(starts, 0.5), 0);
  assert.equal(prevStepStart(starts, 0), 0);
});

test('stepIndexAt: индекс активного шага по времени', () => {
  assert.equal(stepIndexAt(starts, 0), 0);
  assert.equal(stepIndexAt(starts, 1.9), 1);
  assert.equal(stepIndexAt(starts, 5), 2);
});
