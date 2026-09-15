// Обёртка над chrome.storage.local + доменная логика счётчиков.
// Хранятся два ключа: "counters" (массив) и "settings" (объект).

const STORAGE_KEYS = { counters: 'counters', settings: 'settings' };

export const DEFAULT_SETTINGS = {
  defaultScope: 'domain',      // 'tab' | 'domain' | 'url' | 'global'
  iconClickAction: 'increment', // 'increment' | 'openPopup'
  iconClickStep: 1,
};

// Счётчики считают целые действия: дробных значений и шагов не бывает.
// Значение не уходит ниже нуля — отрицательное число действий смысла не имеет.
export function toInteger(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

// Значение счётчика: целое, не меньше нуля.
export function normalizeValue(value) {
  return Math.max(0, toInteger(value, 0));
}

// Шаг: целое, строго больше нуля. Нулевой или отрицательный шаг — это не шаг.
export function normalizeStep(value, fallback = 1) {
  const n = toInteger(value, fallback);
  return n > 0 ? n : fallback;
}

// Настройки из хранилища с приведением чисел к правилам счётчика.
export function normalizeSettings(settings) {
  const merged = { ...DEFAULT_SETTINGS, ...(settings ?? {}) };
  return { ...merged, iconClickStep: normalizeStep(merged.iconClickStep) };
}

// Числовые поля счётчика по правилам: целые, значение не ниже нуля.
export function normalizeCounterNumbers(counter) {
  return {
    ...counter,
    value: normalizeValue(counter.value),
    initialValue: normalizeValue(counter.initialValue),
    step: normalizeStep(counter.step),
  };
}

export async function getAll() {
  const data = await chrome.storage.local.get([STORAGE_KEYS.counters, STORAGE_KEYS.settings]);
  return {
    counters: data.counters ?? [],
    settings: normalizeSettings(data.settings),
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
  return normalizeSettings(settings);
}

export async function saveSettings(settings) {
  await chrome.storage.local.set({ [STORAGE_KEYS.settings]: normalizeSettings(settings) });
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

// Форма scope: известный тип и поле, без которого scope бессмыслен.
// Нужна и рантайму, и импорту: счётчик без scope ронял рендер попапа,
// а в воркере ошибка съедалась общим catch и бейдж просто гас.
export function isValidScope(scope) {
  if (!scope || typeof scope !== 'object') return false;
  switch (scope.type) {
    case 'global':
      return true;
    case 'tab':
      return Number.isInteger(scope.tabId);
    case 'domain':
      return typeof scope.domain === 'string' && scope.domain.length > 0;
    case 'url':
      return typeof scope.url === 'string' && scope.url.length > 0;
    default:
      return false;
  }
}

// Проверка: релевантен ли счётчик текущему контексту (табу/странице)
export function isCounterRelevant(counter, ctx) {
  if (!isValidScope(counter?.scope)) return false;
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
  const safeInitial = normalizeValue(initialValue);
  const safeStep = normalizeStep(step);
  return {
    id: crypto.randomUUID(),
    name: name || 'Counter',
    value: safeInitial,
    initialValue: safeInitial,
    step: safeStep,
    scope,
    isPrimary,
    createdAt: now,
    updatedAt: now,
  };
}

// Привести счётчик из чужого JSON к модели. null — если запись не спасти.
export function sanitizeCounter(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (!isValidScope(raw.scope)) return null;

  const numbers = normalizeCounterNumbers(raw);
  const now = Date.now();
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : crypto.randomUUID(),
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : 'Counter',
    value: numbers.value,
    initialValue: numbers.initialValue,
    step: numbers.step,
    scope: raw.scope,
    isPrimary: raw.isPrimary === true,
    createdAt: Number.isFinite(raw.createdAt) ? raw.createdAt : now,
    updatedAt: Number.isFinite(raw.updatedAt) ? raw.updatedAt : now,
  };
}

// Разобрать массив из импортируемого файла: что можно спасти — спасаем,
// остальное считаем и возвращаем числом, чтобы человек видел, что потерял.
export function sanitizeCounters(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const counters = [];
  const seen = new Set();
  let dropped = 0;

  for (const item of list) {
    const counter = sanitizeCounter(item);
    // Дубли id ломают правку: изменение уходило бы сразу в оба счётчика.
    if (!counter || seen.has(counter.id)) {
      dropped += 1;
      continue;
    }
    seen.add(counter.id);
    counters.push(counter);
  }

  return { counters, dropped };
}

// Главный счётчик для контекста: primary среди релевантных, иначе первый релевантный.
export function getPrimaryCounter(counters, ctx) {
  const relevant = counters.filter((c) => isCounterRelevant(c, ctx));
  return relevant.find((c) => c.isPrimary) ?? relevant[0] ?? null;
}

// Удалить все tab-scoped счётчики для закрытого таба.
export async function pruneTabCounters(tabId) {
  const counters = await getCounters();
  const filtered = counters.filter((c) => !(c.scope?.type === 'tab' && c.scope.tabId === tabId));
  if (filtered.length !== counters.length) {
    await saveCounters(filtered);
  }
}
