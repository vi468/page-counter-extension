import test from 'node:test';
import assert from 'node:assert/strict';
import { toInteger, normalizeValue, normalizeStep, normalizeCounterNumbers } from '../lib/storage.js';

test('toInteger режет дробь и терпит мусор', () => {
  assert.equal(toInteger('2.9'), 2);
  assert.equal(toInteger(-2.9), -2);
  assert.equal(toInteger('abc', 5), 5);
  assert.equal(toInteger(undefined, 5), 5);
});

test('normalizeValue не пускает счётчик в минус', () => {
  assert.equal(normalizeValue(-4), 0);
  assert.equal(normalizeValue(3.7), 3);
  assert.equal(normalizeValue('7'), 7);
  assert.equal(normalizeValue('abc'), 0);
});

test('normalizeStep не пускает нулевой и отрицательный шаг', () => {
  assert.equal(normalizeStep(0), 1);
  assert.equal(normalizeStep(-2), 1);
  assert.equal(normalizeStep(2.5), 2);
  assert.equal(normalizeStep('3'), 3);
});

test('импорт приводит числовые поля счётчика к правилам, остальные не трогает', () => {
  const c = normalizeCounterNumbers({
    id: 'x',
    name: 'Имя',
    value: 2.9,
    initialValue: -1,
    step: 0,
    scope: { type: 'domain', domain: 'example.com' },
  });

  assert.equal(c.value, 2);
  assert.equal(c.initialValue, 0);
  assert.equal(c.step, 1);
  assert.equal(c.id, 'x');
  assert.equal(c.name, 'Имя');
  assert.deepEqual(c.scope, { type: 'domain', domain: 'example.com' });
});
