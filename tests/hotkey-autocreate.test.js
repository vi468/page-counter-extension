import test from 'node:test';
import assert from 'node:assert/strict';
import { installChromeMock } from './_chrome-mock.js';

// background.js вешает слушатели на верхнем уровне, поэтому на каждый тест его
// надо импортировать заново. Без уникального хвоста Node отдаст закешированный
// модуль, и слушатели не перевесятся на свежий мок.
let caseId = 0;
async function loadBackground(options) {
  const mock = installChromeMock(options);
  await import(`../background.js?hotkey=${++caseId}`);
  return mock;
}

function counter(patch = {}) {
  return {
    id: 'c1',
    name: 'Counter',
    value: 0,
    initialValue: 0,
    step: 1,
    scope: { type: 'domain', domain: 'example.com' },
    isPrimary: true,
    createdAt: 0,
    updatedAt: 0,
    ...patch,
  };
}

const TAB = { id: 7, url: 'https://example.com/page' };

test('Alt+↑ на странице без счётчика заводит его и ставит 1', async () => {
  const { storage, chrome } = await loadBackground({ counters: [], tabs: [TAB] });

  await chrome.commands.onCommand.listeners[0]('increment-primary');

  assert.equal(storage.counters.length, 1, 'счётчик должен появиться');
  assert.equal(storage.counters[0].value, 1);
});

test('Alt+↑ на странице со счётчиком просто прибавляет его шаг', async () => {
  const { storage, chrome } = await loadBackground({
    counters: [counter({ value: 4, step: 5 })],
    tabs: [TAB],
  });

  await chrome.commands.onCommand.listeners[0]('increment-primary');

  assert.equal(storage.counters.length, 1, 'второй счётчик появляться не должен');
  assert.equal(storage.counters[0].value, 9);
});

test('Alt+↓ на странице без счётчика ничего не создаёт', async () => {
  const { storage, chrome } = await loadBackground({ counters: [], tabs: [TAB] });

  await chrome.commands.onCommand.listeners[0]('decrement-primary');

  assert.deepEqual(storage.counters, []);
});

test('Alt+0 на странице без счётчика ничего не создаёт', async () => {
  const { storage, chrome } = await loadBackground({ counters: [], tabs: [TAB] });

  await chrome.commands.onCommand.listeners[0]('reset-primary');

  assert.deepEqual(storage.counters, []);
});

test('заведённый хоткеем счётчик использует scope из настроек', async () => {
  const { storage, chrome } = await loadBackground({
    counters: [],
    settings: { defaultScope: 'global' },
    tabs: [TAB],
  });

  await chrome.commands.onCommand.listeners[0]('increment-primary');

  assert.deepEqual(storage.counters[0].scope, { type: 'global' });
});

test('клик по иконке по-прежнему заводит счётчик со значением 1', async () => {
  const { storage, chrome } = await loadBackground({ counters: [], tabs: [TAB] });

  await chrome.action.onClicked.listeners[0](TAB);

  assert.equal(storage.counters.length, 1);
  assert.equal(storage.counters[0].value, 1);
});
