// Service worker: бейдж на иконке, хоткеи, клик по иконке, очистка tab-счётчиков.

import {
  getAll,
  mutateCounters,
  updateCounterIn,
  getSettings,
  getPrimaryCounter,
  pruneTabCounters,
  buildScope,
  createCounter,
  isCounterRelevant,
  normalizeValue,
  normalizeStep,
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

// direction: +1 — прибавить, -1 — убавить. Величина шага берётся у самого
// счётчика в момент мутации, а не из настроек: шаг — свойство счётчика.
async function mutatePrimary(ctx, direction) {
  const next = await mutateCounters((counters) => {
    const primary = getPrimaryCounter(counters, ctx);
    if (!primary) return counters;
    return updateCounterIn(counters, primary.id, (c) => ({
      value: normalizeValue(c.value + direction * normalizeStep(c.step)),
    }));
  });
  return getPrimaryCounter(next, ctx);
}

async function resetPrimary(ctx) {
  const next = await mutateCounters((counters) => {
    const primary = getPrimaryCounter(counters, ctx);
    if (!primary) return counters;
    return updateCounterIn(counters, primary.id, (c) => ({
      value: normalizeValue(c.initialValue),
    }));
  });
  return getPrimaryCounter(next, ctx);
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

// Хоткеи. Alt+↑ ведёт себя как клик по иконке, включая заведение счётчика:
// первое отмеченное действие на странице должно давать единицу, чем бы его
// ни отметили — иконкой или клавиатурой.
chrome.commands.onCommand.addListener(async (command) => {
  const ctx = await getActiveCtx();
  if (!ctx) return;
  if (command === 'increment-primary') await incrementPrimary(ctx);
  else if (command === 'decrement-primary') await mutatePrimary(ctx, -1);
  else if (command === 'reset-primary') await resetPrimary(ctx);
});

// Клик по иконке — только если в настройках стоит "increment".
// Если popup установлен — этот обработчик НЕ сработает. Поэтому popup снимается/ставится динамически.
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !tab.url) return;
  const settings = await getSettings();
  if (settings.iconClickAction !== 'increment') return;
  await incrementPrimary({ tabId: tab.id, url: tab.url });
});

// Прибавить шаг главному счётчику, а если его нет — завести со значением 1.
// Счётчик создаёт только прибавление: убавлять и сбрасывать на пустой странице
// нечего, поэтому Alt+↓ и Alt+0 без счётчика просто ничего не делают.
async function incrementPrimary(ctx) {
  const existing = await mutatePrimary(ctx, +1);
  if (existing) return existing;
  const settings = await getSettings();
  return autoCreatePrimary(ctx, settings.defaultScope);
}

// Создаёт счётчик для текущего контекста со значением 1 (после первого клика).
// Если на этой странице уже есть релевантные счётчики — новый делаем primary,
// старые primary снимает.
async function autoCreatePrimary(ctx, scopeType) {
  const scope = buildScope(scopeType, ctx);
  if (!scope) return null;
  let created = null;
  await mutateCounters((counters) => {
    // Снимаем primary-флаг у всех релевантных.
    const cleared = counters.map((c) =>
      isCounterRelevant(c, ctx) && c.isPrimary ? { ...c, isPrimary: false, updatedAt: Date.now() } : c,
    );
    created = createCounter({
      name: 'Counter',
      scope,
      initialValue: 0,
      step: 1,
      isPrimary: true,
    });
    created.value = 1;
    cleared.push(created);
    return cleared;
  });
  return created;
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

// ---------- Context menu на иконке ----------

// Флаги на жизнь service worker'а: onInstalled и onStartup могут прийти оба,
// повторная настройка меню после успеха — no-op.
let contextMenuReady = false;
let contextMenuInProgress = false;

function setupContextMenu() {
  if (contextMenuReady || contextMenuInProgress) return;
  contextMenuInProgress = true;
  chrome.contextMenus.removeAll(() => {
    let failed = false;
    let pending = 2;
    const onCreated = () => {
      pending -= 1;
      if (pending > 0) return;
      contextMenuInProgress = false;
      // Если хотя бы один create упал — не помечаем готовым, чтобы можно было повторить.
      if (!failed) contextMenuReady = true;
    };
    const create = (options) => {
      chrome.contextMenus.create(options, () => {
        const err = chrome.runtime.lastError;
        if (err) {
          failed = true;
          console.warn('[page-counter] contextMenus.create:', err.message);
        }
        onCreated();
      });
    };
    create({
      id: 'reset-primary',
      title: 'Сбросить главный счётчик',
      contexts: ['action'],
    });
    create({
      id: 'open-manager',
      title: 'Открыть менеджер счётчиков',
      contexts: ['action'],
    });
  });
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'reset-primary') {
    if (!tab?.id || !tab.url) return;
    await resetPrimary({ tabId: tab.id, url: tab.url });
  } else if (info.menuItemId === 'open-manager') {
    chrome.runtime.openOptionsPage();
  }
});

chrome.runtime.onInstalled.addListener(() => {
  applyIconClickBehavior();
  setupContextMenu();
  updateAllBadges();
});
chrome.runtime.onStartup.addListener(() => {
  applyIconClickBehavior();
  setupContextMenu();
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
