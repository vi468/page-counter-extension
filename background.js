// Service worker: бейдж на иконке, хоткеи, клик по иконке, очистка tab-счётчиков.

import {
  getAll,
  getCounters,
  saveCounters,
  getSettings,
  getPrimaryCounter,
  pruneTabCounters,
  buildScope,
  createCounter,
  isCounterRelevant,
} from './lib/storage.js';

// ---------- Badge ----------

async function updateBadgeForTab(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab?.url) {
      await chrome.action.setBadgeText({ tabId, text: '' });
      return;
    }
    const { counters } = await getAll();
    const primary = getPrimaryCounter(counters, { tabId, url: tab.url });
    const text = primary ? String(primary.value) : '';
    await chrome.action.setBadgeText({ tabId, text });
    await chrome.action.setBadgeBackgroundColor({ tabId, color: '#2d7ff9' });
    await chrome.action.setBadgeTextColor({ tabId, color: '#ffffff' });
  } catch {
    // Таб мог быть закрыт — игнорируем.
  }
}

async function updateAllBadges() {
  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs.map((t) => (t.id ? updateBadgeForTab(t.id) : null)));
}

// ---------- Counter mutations ----------

async function mutatePrimary(ctx, delta) {
  const counters = await getCounters();
  const primary = getPrimaryCounter(counters, ctx);
  if (!primary) return null;
  const updated = counters.map((c) =>
    c.id === primary.id ? { ...c, value: c.value + delta, updatedAt: Date.now() } : c,
  );
  await saveCounters(updated);
  return updated.find((c) => c.id === primary.id);
}

async function resetPrimary(ctx) {
  const counters = await getCounters();
  const primary = getPrimaryCounter(counters, ctx);
  if (!primary) return null;
  const updated = counters.map((c) =>
    c.id === primary.id ? { ...c, value: c.initialValue, updatedAt: Date.now() } : c,
  );
  await saveCounters(updated);
  return updated.find((c) => c.id === primary.id);
}

async function getActiveCtx() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id || !tab.url) return null;
  return { tabId: tab.id, url: tab.url };
}

// ---------- Events ----------

// Обновление бейджа при смене таба/URL.
chrome.tabs.onActivated.addListener(({ tabId }) => updateBadgeForTab(tabId));
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url || changeInfo.status === 'complete') {
    updateBadgeForTab(tabId);
  }
});

// Чистим tab-scoped счётчики при закрытии таба.
chrome.tabs.onRemoved.addListener(async (tabId) => {
  await pruneTabCounters(tabId);
});

// Реакция на изменения хранилища — перерисовать бейджи.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.counters || changes.settings)) {
    updateAllBadges();
  }
});

// Хоткеи.
chrome.commands.onCommand.addListener(async (command) => {
  const ctx = await getActiveCtx();
  if (!ctx) return;
  if (command === 'increment-primary') await mutatePrimary(ctx, +1);
  else if (command === 'decrement-primary') await mutatePrimary(ctx, -1);
  else if (command === 'reset-primary') await resetPrimary(ctx);
});

// Клик по иконке — только если в настройках стоит "increment".
// Если popup установлен — этот обработчик НЕ сработает. Поэтому popup снимается/ставится динамически.
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !tab.url) return;
  const settings = await getSettings();
  if (settings.iconClickAction !== 'increment') return;
  const ctx = { tabId: tab.id, url: tab.url };
  const step = settings.iconClickStep ?? 1;
  const existing = await mutatePrimary(ctx, step);
  if (!existing) {
    // Нет главного счётчика — создаём на лету и сразу применяем шаг.
    await autoCreatePrimary(ctx, settings.defaultScope, step);
  }
});

// Создаёт счётчик для текущего контекста со значением = step (после первого клика).
// Если на этой странице уже есть релевантные счётчики — новый делаем primary,
// старые primary снимает.
async function autoCreatePrimary(ctx, scopeType, step) {
  const scope = buildScope(scopeType, ctx);
  if (!scope) return null;
  const counters = await getCounters();
  // Снимаем primary-флаг у всех релевантных.
  const cleared = counters.map((c) =>
    isCounterRelevant(c, ctx) && c.isPrimary ? { ...c, isPrimary: false, updatedAt: Date.now() } : c,
  );
  const counter = createCounter({
    name: 'Counter',
    scope,
    initialValue: 0,
    step: 1,
    isPrimary: true,
  });
  counter.value = step;
  cleared.push(counter);
  await saveCounters(cleared);
  return counter;
}

// Применить поведение клика по иконке согласно настройкам.
async function applyIconClickBehavior() {
  const settings = await getSettings();
  if (settings.iconClickAction === 'increment') {
    await chrome.action.setPopup({ popup: '' });
  } else {
    await chrome.action.setPopup({ popup: 'popup/popup.html' });
  }
}

chrome.runtime.onInstalled.addListener(() => {
  applyIconClickBehavior();
  updateAllBadges();
});
chrome.runtime.onStartup.addListener(() => {
  applyIconClickBehavior();
  updateAllBadges();
});

// При смене настроек — переключаем popup.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.settings) {
    applyIconClickBehavior();
  }
});

// Сообщения из попапа — например "открой меня" вручную.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'refresh-badges') {
    updateAllBadges().then(() => sendResponse({ ok: true }));
    return true; // async
  }
});
