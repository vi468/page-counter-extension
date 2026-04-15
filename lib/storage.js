// Обёртка над chrome.storage.local + доменная логика счётчиков.
// Хранятся два ключа: "counters" (массив) и "settings" (объект).

const STORAGE_KEYS = { counters: 'counters', settings: 'settings' };

export const DEFAULT_SETTINGS = {
  defaultScope: 'domain',      // 'tab' | 'domain' | 'url' | 'global'
  iconClickAction: 'increment', // 'increment' | 'openPopup'
  iconClickStep: 1,
};

export async function getAll() {
  const data = await chrome.storage.local.get([STORAGE_KEYS.counters, STORAGE_KEYS.settings]);
  return {
    counters: data.counters ?? [],
    settings: { ...DEFAULT_SETTINGS, ...(data.settings ?? {}) },
  };
}

export async function getCounters() {
  const { counters } = await chrome.storage.local.get(STORAGE_KEYS.counters);
  return counters ?? [];
}

export async function saveCounters(counters) {
  await chrome.storage.local.set({ [STORAGE_KEYS.counters]: counters });
}

export async function getSettings() {
  const { settings } = await chrome.storage.local.get(STORAGE_KEYS.settings);
  return { ...DEFAULT_SETTINGS, ...(settings ?? {}) };
}

export async function saveSettings(settings) {
  await chrome.storage.local.set({ [STORAGE_KEYS.settings]: settings });
}

// Утилиты для scope
export function getDomainFromUrl(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

export function getNormalizedUrl(url) {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}${u.search}`;
  } catch {
    return null;
  }
}

// Проверка: релевантен ли счётчик текущему контексту (табу/странице)
export function isCounterRelevant(counter, ctx) {
  const { tabId, url } = ctx;
  const scope = counter.scope;
  switch (scope.type) {
    case 'global':
      return true;
    case 'tab':
      return scope.tabId === tabId;
    case 'domain':
      return scope.domain === getDomainFromUrl(url);
    case 'url':
      return scope.url === getNormalizedUrl(url);
    default:
      return false;
  }
}

export function buildScope(type, ctx) {
  switch (type) {
    case 'global':
      return { type: 'global' };
    case 'tab':
      return { type: 'tab', tabId: ctx.tabId };
    case 'domain':
      return { type: 'domain', domain: getDomainFromUrl(ctx.url) };
    case 'url':
      return { type: 'url', url: getNormalizedUrl(ctx.url) };
    default:
      throw new Error(`Unknown scope type: ${type}`);
  }
}

export function createCounter({ name, scope, initialValue = 0, step = 1, isPrimary = false }) {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    name: name || 'Counter',
    value: initialValue,
    initialValue,
    step,
    scope,
    isPrimary,
    createdAt: now,
    updatedAt: now,
  };
}

// Главный счётчик для контекста: primary среди релевантных, иначе первый релевантный.
export function getPrimaryCounter(counters, ctx) {
  const relevant = counters.filter((c) => isCounterRelevant(c, ctx));
  return relevant.find((c) => c.isPrimary) ?? relevant[0] ?? null;
}

// Удалить все tab-scoped счётчики для закрытого таба.
export async function pruneTabCounters(tabId) {
  const counters = await getCounters();
  const filtered = counters.filter((c) => !(c.scope.type === 'tab' && c.scope.tabId === tabId));
  if (filtered.length !== counters.length) {
    await saveCounters(filtered);
  }
}
