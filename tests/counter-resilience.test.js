import test from 'node:test';
import assert from 'node:assert/strict';
import { installChromeMock } from './_chrome-mock.js';
import { isCounterRelevant, pruneTabCounters } from '../lib/storage.js';

const CTX = { tabId: 7, url: 'https://example.com/page' };

test('isCounterRelevant не падает на счётчике без scope', () => {
  assert.equal(isCounterRelevant({ id: 'bad' }, CTX), false);
  assert.equal(isCounterRelevant({ id: 'bad', scope: null }, CTX), false);
  assert.equal(isCounterRelevant({ id: 'bad', scope: { type: 'nonsense' } }, CTX), false);
  assert.equal(isCounterRelevant({ id: 'bad', scope: 'global' }, CTX), false);
  assert.equal(isCounterRelevant(null, CTX), false);
});

test('isCounterRelevant не падает на scope с пустыми полями', () => {
  assert.equal(isCounterRelevant({ scope: { type: 'domain', domain: '' } }, CTX), false);
  assert.equal(isCounterRelevant({ scope: { type: 'tab' } }, CTX), false);
  assert.equal(isCounterRelevant({ scope: { type: 'url', url: null } }, CTX), false);
});

test('isCounterRelevant не падает без контекста', () => {
  assert.equal(isCounterRelevant({ scope: { type: 'global' } }, null), false);
  assert.equal(isCounterRelevant({ scope: { type: 'global' } }, undefined), false);
});

test('корректные счётчики по-прежнему релевантны', () => {
  assert.equal(isCounterRelevant({ scope: { type: 'global' } }, CTX), true);
  assert.equal(isCounterRelevant({ scope: { type: 'tab', tabId: 7 } }, CTX), true);
  assert.equal(isCounterRelevant({ scope: { type: 'tab', tabId: 8 } }, CTX), false);
  assert.equal(isCounterRelevant({ scope: { type: 'domain', domain: 'example.com' } }, CTX), true);
  assert.equal(isCounterRelevant({ scope: { type: 'domain', domain: 'other.com' } }, CTX), false);
  assert.equal(
    isCounterRelevant({ scope: { type: 'url', url: 'https://example.com/page' } }, CTX),
    true,
  );
});

test('pruneTabCounters переживает битый счётчик и не трогает чужие', async () => {
  const { storage } = installChromeMock({
    counters: [
      { id: 'bad', name: 'Bad', value: 1, initialValue: 0, step: 1, scope: null },
      { id: 't1', name: 'T1', value: 3, initialValue: 0, step: 1, scope: { type: 'tab', tabId: 5 } },
      { id: 't2', name: 'T2', value: 4, initialValue: 0, step: 1, scope: { type: 'tab', tabId: 6 } },
      { id: 'g', name: 'G', value: 9, initialValue: 0, step: 1, scope: { type: 'global' } },
    ],
  });

  await pruneTabCounters(5);

  assert.deepEqual(storage.counters.map((c) => c.id), ['bad', 't2', 'g']);
});
