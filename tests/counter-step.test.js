import test from 'node:test';
import assert from 'node:assert/strict';
import { installChromeMock } from './_chrome-mock.js';

// background.js вешает слушатели на верхнем уровне, поэтому на каждый тест его
// надо импортировать заново. Без уникального хвоста Node отдаст закешированный
// модуль, и слушатели не перевесятся на свежий мок.
let caseId = 0;
async function loadBackground(options) {
  const mock = installChromeMock(options);
  await import(`../background.js?step=${++caseId}`);
  return mock;
}

function counter(patch = {}) {
  return {
    id: 'c1',
    name: 'Counter',
    value: 0,
    initialValue: 0,
    step: 1,
    scope: { type: 'global' },
    isPrimary: true,
    createdAt: 0,
    updatedAt: 0,
    ...patch,
  };
}

const TAB = { id: 7, url: 'https://example.com/page' };

test('хоткей «увеличить» прибавляет шаг счётчика', async () => {
  const { storage, chrome } = await loadBackground({ counters: [counter({ step: 5 })], tabs: [TAB] });

  await chrome.commands.onCommand.listeners[0]('increment-primary');

  assert.equal(storage.counters[0].value, 5);
});

test('клик по иконке прибавляет шаг счётчика', async () => {
  const { storage, chrome } = await loadBackground({ counters: [counter({ step: 5 })], tabs: [TAB] });

  await chrome.action.onClicked.listeners[0](TAB);

  assert.equal(storage.counters[0].value, 5);
});

test('хоткей «уменьшить» убавляет на шаг счётчика', async () => {
  const { storage, chrome } = await loadBackground({
    counters: [counter({ value: 5, step: 5 })],
    tabs: [TAB],
  });

  await chrome.commands.onCommand.listeners[0]('decrement-primary');

  assert.equal(storage.counters[0].value, 0);
});

test('первый клик по иконке создаёт счётчик со шагом 1 и значением 1', async () => {
  const { storage, chrome } = await loadBackground({ counters: [], tabs: [TAB] });

  await chrome.action.onClicked.listeners[0](TAB);

  assert.equal(storage.counters.length, 1);
  assert.equal(storage.counters[0].step, 1);
  assert.equal(storage.counters[0].value, 1);
});
