import test from 'node:test';
import assert from 'node:assert/strict';
import { installChromeMock } from './_chrome-mock.js';

// background.js вешает слушатели на верхнем уровне, поэтому на каждый тест его
// надо импортировать заново. Без уникального хвоста Node отдаст закешированный
// модуль, и слушатели не перевесятся на свежий мок.
let caseId = 0;
async function loadBackground(options) {
  const mock = installChromeMock(options);
  await import(`../background.js?case=${++caseId}`);
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

test('убавление с нуля не уводит счётчик в минус: он удаляется', async () => {
  const { storage, chrome } = await loadBackground({ counters: [counter({ value: 0 })], tabs: [TAB] });

  await chrome.commands.onCommand.listeners[0]('decrement-primary');

  assert.deepEqual(storage.counters, [], 'отрицательного значения не бывает, а ноль удаляет счётчик');
});

test('дробное значение в хранилище становится целым при изменении', async () => {
  const { storage, chrome } = await loadBackground({ counters: [counter({ value: 2.7 })], tabs: [TAB] });

  await chrome.commands.onCommand.listeners[0]('increment-primary');

  assert.equal(storage.counters[0].value, 3);
});

test('дробный шаг счётчика не делает значение дробным', async () => {
  const { storage, chrome } = await loadBackground({
    counters: [counter({ value: 0, step: 2.5 })],
    tabs: [TAB],
  });

  await chrome.action.onClicked.listeners[0](TAB);

  assert.equal(storage.counters[0].value, 2);
});

test('сброс к отрицательному initial не оставляет счётчик в минусе', async () => {
  const { storage, chrome } = await loadBackground({
    counters: [counter({ value: 5, initialValue: -3 })],
    tabs: [TAB],
  });

  await chrome.commands.onCommand.listeners[0]('reset-primary');

  assert.deepEqual(storage.counters, [], 'сброс к нулю и ниже означает обнуление, а ноль удаляет');
});
