// Мок chrome для тестов: реестр событий + хранилище в памяти.
// Ставится в globalThis до импорта background.js.

export function createEvent() {
  const listeners = [];
  return { addListener: (fn) => listeners.push(fn), listeners };
}

const DEFAULT_TAB = { id: 7, url: 'https://example.com/page' };

export function installChromeMock({ counters = [], settings, tabs = [DEFAULT_TAB] } = {}) {
  const storage = { counters };
  if (settings) storage.settings = settings;

  const calls = { removeAll: 0, create: [], events: [] };

  const chromeMock = {
    tabs: {
      onActivated: createEvent(),
      onUpdated: createEvent(),
      onRemoved: createEvent(),
      query: async () => tabs,
      get: async (id) => tabs.find((t) => t.id === id) ?? {},
    },
    storage: {
      onChanged: createEvent(),
      local: {
        get: async (keys) => {
          const list = Array.isArray(keys) ? keys : [keys];
          const out = {};
          for (const k of list) if (k in storage) out[k] = storage[k];
          return out;
        },
        set: async (patch) => {
          Object.assign(storage, patch);
        },
      },
    },
    commands: { onCommand: createEvent() },
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

  globalThis.chrome = chromeMock;
  return { chrome: chromeMock, storage, calls };
}
