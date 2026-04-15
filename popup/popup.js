import {
  getAll,
  saveCounters,
  buildScope,
  createCounter,
  isCounterRelevant,
  getDomainFromUrl,
} from '../lib/storage.js';

const listEl = document.getElementById('counter-list');
const scopeIndicatorEl = document.getElementById('scope-indicator');
const toggleNewBtn = document.getElementById('toggle-new');
const newFormEl = document.getElementById('new-form');
const cancelNewBtn = document.getElementById('cancel-new');

let ctx = null;         // { tabId, url }
let counters = [];
let settings = null;
let openMenu = null;

// ---------- Init ----------

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id || !tab.url) {
    scopeIndicatorEl.textContent = 'Нет активной страницы';
    return;
  }
  ctx = { tabId: tab.id, url: tab.url };
  scopeIndicatorEl.textContent = getDomainFromUrl(tab.url) ?? tab.url;

  const data = await getAll();
  counters = data.counters;
  settings = data.settings;
  document.getElementById('new-scope').value = settings.defaultScope;

  render();
}

// ---------- Render ----------

function render() {
  const relevant = counters.filter((c) => isCounterRelevant(c, ctx));
  listEl.innerHTML = '';

  if (relevant.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'Нет счётчиков. Создайте новый ↓';
    listEl.appendChild(li);
    return;
  }

  // Primary сначала.
  relevant.sort((a, b) => (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0));

  for (const c of relevant) {
    listEl.appendChild(renderCounter(c));
  }
}

function renderCounter(c) {
  const li = document.createElement('li');
  li.className = 'counter-item' + (c.isPrimary ? ' primary' : '');

  // Звёздочка (primary toggle)
  const star = document.createElement('button');
  star.className = 'star-btn';
  star.textContent = c.isPrimary ? '★' : '☆';
  star.title = 'Сделать главным';
  star.addEventListener('click', () => setPrimary(c.id));
  li.appendChild(star);

  // Имя
  const name = document.createElement('span');
  name.className = 'counter-name';
  name.textContent = c.name;
  name.title = 'Переименовать';
  name.addEventListener('click', () => renameCounter(c.id));
  li.appendChild(name);

  // Минус
  const minus = document.createElement('button');
  minus.className = 'step-btn';
  minus.textContent = '−';
  minus.addEventListener('click', () => applyDelta(c.id, -c.step));
  li.appendChild(minus);

  // Значение
  const value = document.createElement('span');
  value.className = 'counter-value';
  value.textContent = formatValue(c.value);
  value.title = 'Задать значение';
  value.addEventListener('click', () => setValueManually(c.id));
  li.appendChild(value);

  // Плюс
  const plus = document.createElement('button');
  plus.className = 'step-btn';
  plus.textContent = '+';
  plus.addEventListener('click', () => applyDelta(c.id, +c.step));
  li.appendChild(plus);

  // Меню
  const menu = document.createElement('button');
  menu.className = 'menu-btn';
  menu.textContent = '⋯';
  menu.addEventListener('click', (e) => showContextMenu(e, c));
  li.appendChild(menu);

  // Scope badge
  const badge = document.createElement('span');
  badge.className = 'scope-badge';
  badge.textContent = c.scope.type;
  li.appendChild(badge);

  return li;
}

function formatValue(v) {
  return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/\.?0+$/, '');
}

// ---------- Mutations ----------

async function persist() {
  await saveCounters(counters);
  render();
}

async function applyDelta(id, delta) {
  counters = counters.map((c) =>
    c.id === id ? { ...c, value: c.value + delta, updatedAt: Date.now() } : c,
  );
  await persist();
}

async function setPrimary(id) {
  // Primary — уникален в рамках счётчиков, релевантных текущему контексту.
  const target = counters.find((c) => c.id === id);
  if (!target) return;
  counters = counters.map((c) => {
    if (!isCounterRelevant(c, ctx)) return c;
    return { ...c, isPrimary: c.id === id, updatedAt: Date.now() };
  });
  await persist();
}

async function renameCounter(id) {
  const current = counters.find((c) => c.id === id);
  if (!current) return;
  const name = prompt('Название:', current.name);
  if (name == null) return;
  const trimmed = name.trim();
  if (!trimmed) return;
  counters = counters.map((c) => (c.id === id ? { ...c, name: trimmed, updatedAt: Date.now() } : c));
  await persist();
}

async function setValueManually(id) {
  const current = counters.find((c) => c.id === id);
  if (!current) return;
  const raw = prompt('Значение:', String(current.value));
  if (raw == null) return;
  const v = Number(raw);
  if (Number.isNaN(v)) return;
  counters = counters.map((c) => (c.id === id ? { ...c, value: v, updatedAt: Date.now() } : c));
  await persist();
}

async function resetCounter(id) {
  counters = counters.map((c) =>
    c.id === id ? { ...c, value: c.initialValue, updatedAt: Date.now() } : c,
  );
  await persist();
}

async function setInitial(id) {
  const current = counters.find((c) => c.id === id);
  if (!current) return;
  const raw = prompt('Начальное значение:', String(current.initialValue));
  if (raw == null) return;
  const v = Number(raw);
  if (Number.isNaN(v)) return;
  counters = counters.map((c) => (c.id === id ? { ...c, initialValue: v, updatedAt: Date.now() } : c));
  await persist();
}

async function setStep(id) {
  const current = counters.find((c) => c.id === id);
  if (!current) return;
  const raw = prompt('Шаг:', String(current.step));
  if (raw == null) return;
  const v = Number(raw);
  if (Number.isNaN(v) || v === 0) return;
  counters = counters.map((c) => (c.id === id ? { ...c, step: v, updatedAt: Date.now() } : c));
  await persist();
}

async function deleteCounter(id) {
  if (!confirm('Удалить счётчик?')) return;
  counters = counters.filter((c) => c.id !== id);
  await persist();
}

// ---------- Context menu ----------

function showContextMenu(event, counter) {
  event.stopPropagation();
  closeContextMenu();

  const menu = document.createElement('div');
  menu.className = 'context-menu';

  const items = [
    { label: counter.isPrimary ? '★ Уже главный' : '★ Сделать главным', fn: () => setPrimary(counter.id), disabled: counter.isPrimary },
    { label: 'Переименовать', fn: () => renameCounter(counter.id) },
    { label: 'Задать значение', fn: () => setValueManually(counter.id) },
    { label: 'Начальное значение', fn: () => setInitial(counter.id) },
    { label: 'Шаг', fn: () => setStep(counter.id) },
    { label: 'Сбросить к ' + formatValue(counter.initialValue), fn: () => resetCounter(counter.id) },
    { separator: true },
    { label: 'Удалить', fn: () => deleteCounter(counter.id), danger: true },
  ];

  for (const item of items) {
    if (item.separator) {
      menu.appendChild(document.createElement('hr'));
      continue;
    }
    const btn = document.createElement('button');
    btn.textContent = item.label;
    if (item.danger) btn.className = 'danger';
    if (item.disabled) btn.disabled = true;
    btn.addEventListener('click', () => {
      closeContextMenu();
      item.fn();
    });
    menu.appendChild(btn);
  }

  document.body.appendChild(menu);
  const rect = event.target.getBoundingClientRect();
  menu.style.top = `${rect.bottom + 4}px`;
  menu.style.left = `${Math.max(4, rect.right - menu.offsetWidth)}px`;
  openMenu = menu;

  setTimeout(() => document.addEventListener('click', closeContextMenu, { once: true }), 0);
}

function closeContextMenu() {
  if (openMenu) {
    openMenu.remove();
    openMenu = null;
  }
}

// ---------- New counter form ----------

toggleNewBtn.addEventListener('click', () => {
  newFormEl.hidden = false;
  toggleNewBtn.hidden = true;
  document.getElementById('new-name').focus();
});

cancelNewBtn.addEventListener('click', () => {
  newFormEl.hidden = true;
  toggleNewBtn.hidden = false;
  newFormEl.reset();
  document.getElementById('new-scope').value = settings.defaultScope;
});

newFormEl.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('new-name').value.trim();
  const scopeType = document.getElementById('new-scope').value;
  const initialValue = Number(document.getElementById('new-initial').value) || 0;
  const step = Number(document.getElementById('new-step').value) || 1;

  if (!name) return;
  const scope = buildScope(scopeType, ctx);
  if (!scope) return;

  const relevantExist = counters.some((c) => isCounterRelevant(c, ctx));
  const counter = createCounter({
    name,
    scope,
    initialValue,
    step,
    isPrimary: !relevantExist, // первый — автоматически primary
  });
  counters.push(counter);
  await persist();

  newFormEl.reset();
  newFormEl.hidden = true;
  toggleNewBtn.hidden = false;
  document.getElementById('new-scope').value = settings.defaultScope;
});

// ---------- Options ----------

document.getElementById('open-options').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

// ---------- Live updates ----------

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.counters) {
    counters = changes.counters.newValue ?? [];
    render();
  }
  if (changes.settings) {
    settings = { ...settings, ...(changes.settings.newValue ?? {}) };
  }
});

init();
