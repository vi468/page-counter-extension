import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeCounter, sanitizeCounters } from '../lib/storage.js';

const VALID = {
  id: 'a',
  name: 'Клики',
  value: 3,
  initialValue: 1,
  step: 2,
  scope: { type: 'domain', domain: 'example.com' },
  isPrimary: true,
  createdAt: 100,
  updatedAt: 200,
};

test('корректный счётчик проходит без изменений', () => {
  assert.deepEqual(sanitizeCounter(VALID), VALID);
});

test('запись без scope или с незнакомым scope отбрасывается', () => {
  assert.equal(sanitizeCounter({ ...VALID, scope: undefined }), null);
  assert.equal(sanitizeCounter({ ...VALID, scope: null }), null);
  assert.equal(sanitizeCounter({ ...VALID, scope: { type: 'nonsense' } }), null);
  assert.equal(sanitizeCounter({ ...VALID, scope: { type: 'tab' } }), null);
  assert.equal(sanitizeCounter({ ...VALID, scope: { type: 'domain', domain: '' } }), null);
  assert.equal(sanitizeCounter(null), null);
  assert.equal(sanitizeCounter('строка'), null);
});

test('числа и имя приводятся, id и даты подставляются', () => {
  const c = sanitizeCounter({
    value: -5.7,
    initialValue: 'abc',
    step: 0,
    name: '   ',
    scope: { type: 'global' },
  });

  assert.equal(c.value, 0);
  assert.equal(c.initialValue, 0);
  assert.equal(c.step, 1);
  assert.equal(c.name, 'Counter');
  assert.equal(typeof c.id, 'string');
  assert.ok(c.id.length > 0);
  assert.equal(c.isPrimary, false);
  assert.ok(Number.isFinite(c.createdAt) && Number.isFinite(c.updatedAt));
});

test('sanitizeCounters отбрасывает битые записи и дубли id', () => {
  const { counters, dropped } = sanitizeCounters([
    VALID,
    { ...VALID, id: 'b', scope: null },
    { ...VALID, id: 'a' },
    { ...VALID, id: 'c', scope: { type: 'global' } },
    null,
  ]);

  assert.deepEqual(counters.map((c) => c.id), ['a', 'c']);
  assert.equal(dropped, 3);
});

test('sanitizeCounters терпит не массив', () => {
  assert.deepEqual(sanitizeCounters(undefined), { counters: [], dropped: 0 });
  assert.deepEqual(sanitizeCounters({ counters: [] }), { counters: [], dropped: 0 });
});
