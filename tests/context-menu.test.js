import test from 'node:test';
import assert from 'node:assert/strict';
import { installChromeMock } from './_chrome-mock.js';

const { chrome, calls } = installChromeMock({ counters: [] });
await import('../background.js');

// ---------- Тест ----------

test('onInstalled + onStartup в одном жизненном цикле создают ровно два пункта меню', () => {
  const { onInstalled, onStartup } = chrome.runtime;
  assert.equal(onInstalled.listeners.length, 1, 'onInstalled должен иметь обработчик');
  assert.equal(onStartup.listeners.length, 1, 'onStartup должен иметь обработчик');

  onInstalled.listeners[0]();
  onStartup.listeners[0]();

  assert.equal(calls.create.length, 2, 'contextMenus.create должен быть вызван ровно 2 раза');
  assert.deepEqual([...calls.create].sort(), ['open-manager', 'reset-primary']);

  const firstRemoveAll = calls.events.indexOf('removeAll');
  assert.ok(firstRemoveAll !== -1, 'removeAll должен вызываться');
  for (const id of calls.create) {
    const createIndex = calls.events.indexOf(`create:${id}`);
    assert.ok(
      createIndex > firstRemoveAll,
      `create:${id} должен идти после колбэка removeAll`,
    );
  }
});
