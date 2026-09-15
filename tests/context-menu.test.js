import test from 'node:test';
import assert from 'node:assert/strict';

// ---------- Глобальный мок chrome ----------

function createEvent() {
  const listeners = [];
  return {
    addListener: (fn) => listeners.push(fn),
    listeners,
  };
}

const calls = {
  removeAll: 0,
  create: [],
  events: [],
};

globalThis.chrome = {
  tabs: {
    onActivated: createEvent(),
    onUpdated: createEvent(),
    onRemoved: createEvent(),
    query: async () => [],
    get: async () => ({}),
  },
  storage: {
    onChanged: createEvent(),
    local: {
      get: async () => ({}),
      set: async () => {},
    },
  },
  commands: {
    onCommand: createEvent(),
  },
  action: {
    onClicked: createEvent(),
    setBadgeText: async () => {},
    setBadgeBackgroundColor: async () => {},
    setBadgeTextColor: async () => {},
    setPopup: async () => {},
  },
  runtime: {
    onInstalled: createEvent(),
    onStartup: createEvent(),
    onMessage: createEvent(),
    lastError: undefined,
    openOptionsPage: () => {},
  },
  contextMenus: {
    onClicked: createEvent(),
    removeAll: (cb) => {
      calls.removeAll += 1;
      calls.events.push('removeAll');
      if (typeof cb === 'function') cb();
    },
    create: (props, cb) => {
      calls.events.push(`create:${props.id}`);
      calls.create.push(props.id);
      if (typeof cb === 'function') cb();
    },
  },
};

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

  const firstCreate = calls.events.indexOf('create:reset-primary');
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
