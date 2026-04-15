import {
  getSettings,
  saveSettings,
  getCounters,
  saveCounters,
  DEFAULT_SETTINGS,
} from '../lib/storage.js';

const form = document.getElementById('settings-form');
const defaultScopeEl = document.getElementById('defaultScope');
const iconClickActionEl = document.getElementById('iconClickAction');
const iconClickStepEl = document.getElementById('iconClickStep');
const stepFieldEl = document.getElementById('stepField');
const savedMsg = document.getElementById('saved-msg');

async function load() {
  const settings = await getSettings();
  defaultScopeEl.value = settings.defaultScope;
  iconClickActionEl.value = settings.iconClickAction;
  iconClickStepEl.value = settings.iconClickStep;
  updateStepVisibility();
}

function updateStepVisibility() {
  stepFieldEl.hidden = iconClickActionEl.value !== 'increment';
}

iconClickActionEl.addEventListener('change', updateStepVisibility);

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const settings = {
    ...DEFAULT_SETTINGS,
    defaultScope: defaultScopeEl.value,
    iconClickAction: iconClickActionEl.value,
    iconClickStep: Number(iconClickStepEl.value) || 1,
  };
  await saveSettings(settings);
  savedMsg.hidden = false;
  setTimeout(() => (savedMsg.hidden = true), 1500);
});

// ---------- Export / Import ----------

document.getElementById('export-btn').addEventListener('click', async () => {
  const [counters, settings] = await Promise.all([getCounters(), getSettings()]);
  const payload = { version: 1, exportedAt: new Date().toISOString(), counters, settings };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `page-counter-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

const importBtn = document.getElementById('import-btn');
const importFile = document.getElementById('import-file');
importBtn.addEventListener('click', () => importFile.click());

importFile.addEventListener('change', async () => {
  const file = importFile.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!Array.isArray(data.counters)) throw new Error('Некорректный формат');
    if (!confirm(`Импортировать ${data.counters.length} счётчик(ов)? Текущие будут заменены.`)) return;
    await saveCounters(data.counters);
    if (data.settings) await saveSettings({ ...DEFAULT_SETTINGS, ...data.settings });
    alert('Импорт завершён');
    await load();
  } catch (err) {
    alert('Ошибка импорта: ' + err.message);
  } finally {
    importFile.value = '';
  }
});

// ---------- Counters manager ----------

const managerEl = document.getElementById('counters-manager');

const SCOPE_ORDER = ['global', 'domain', 'url', 'tab'];
const SCOPE_LABEL = {
  global: 'GLOBAL',
  domain: 'DOMAIN',
  url: 'URL',
  tab: 'TAB',
};

function scopeDetail(scope) {
  switch (scope.type) {
    case 'global':
      return '(все страницы)';
    case 'domain':
      return scope.domain;
    case 'url':
      return scope.url;
    case 'tab':
      return `tab #${scope.tabId}`;
    default:
      return '';
  }
}

function formatValue(v) {
  return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/\.?0+$/, '');
}

async function renderManager() {
  const counters = await getCounters();
  managerEl.innerHTML = '';

  if (counters.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'manager-empty';
    empty.textContent = 'Счётчиков пока нет. Откройте попап на любой странице и создайте.';
    managerEl.appendChild(empty);
    return;
  }

  const grouped = {};
  for (const c of counters) {
    const type = c.scope.type;
    const key = scopeDetail(c.scope);
    const groupKey = `${type}:${key}`;
    grouped[groupKey] ??= { type, key, items: [] };
    grouped[groupKey].items.push(c);
  }

  const groupKeys = Object.keys(grouped).sort((a, b) => {
    const di = SCOPE_ORDER.indexOf(grouped[a].type) - SCOPE_ORDER.indexOf(grouped[b].type);
    if (di !== 0) return di;
    return grouped[a].key.localeCompare(grouped[b].key);
  });

  for (const k of groupKeys) {
    const group = grouped[k];
    const section = document.createElement('div');
    section.className = 'scope-group';

    const title = document.createElement('h3');
    title.textContent = `${SCOPE_LABEL[group.type]} · ${group.key}`;
    section.appendChild(title);

    const list = document.createElement('ul');
    list.className = 'scope-group-list';

    group.items.sort((a, b) => (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0));

    for (const c of group.items) {
      list.appendChild(renderManagerItem(c));
    }
    section.appendChild(list);
    managerEl.appendChild(section);
  }
}

function renderManagerItem(c) {
  const li = document.createElement('li');
  li.className = 'manager-item' + (c.isPrimary ? ' primary' : '');

  const star = document.createElement('span');
  star.className = 'star';
  star.textContent = c.isPrimary ? '★' : '☆';
  li.appendChild(star);

  const name = document.createElement('span');
  name.className = 'name';
  name.textContent = c.name;
  name.title = 'Переименовать';
  name.addEventListener('click', () => renameCounter(c.id));
  li.appendChild(name);

  const minus = document.createElement('button');
  minus.className = 'mini-btn';
  minus.textContent = '−';
  minus.title = `-${formatValue(c.step)}`;
  minus.addEventListener('click', () => applyDelta(c.id, -c.step));
  li.appendChild(minus);

  const value = document.createElement('span');
  value.className = 'value';
  value.textContent = formatValue(c.value);
  value.title = 'Задать значение';
  value.addEventListener('click', () => setValueManually(c.id));
  li.appendChild(value);

  const plus = document.createElement('button');
  plus.className = 'mini-btn';
  plus.textContent = '+';
  plus.title = `+${formatValue(c.step)}`;
  plus.addEventListener('click', () => applyDelta(c.id, +c.step));
  li.appendChild(plus);

  const reset = document.createElement('button');
  reset.className = 'mini-btn';
  reset.textContent = '↺';
  reset.title = `Сбросить к ${formatValue(c.initialValue)}`;
  reset.addEventListener('click', () => resetCounter(c.id));
  li.appendChild(reset);

  const del = document.createElement('button');
  del.className = 'mini-btn danger';
  del.textContent = '×';
  del.title = 'Удалить';
  del.addEventListener('click', () => deleteCounter(c.id));
  li.appendChild(del);

  return li;
}

async function updateCounter(id, patch) {
  const counters = await getCounters();
  const updated = counters.map((c) => (c.id === id ? { ...c, ...patch, updatedAt: Date.now() } : c));
  await saveCounters(updated);
}

async function applyDelta(id, delta) {
  const counters = await getCounters();
  const c = counters.find((x) => x.id === id);
  if (!c) return;
  await updateCounter(id, { value: c.value + delta });
}

async function renameCounter(id) {
  const counters = await getCounters();
  const c = counters.find((x) => x.id === id);
  if (!c) return;
  const name = prompt('Название:', c.name);
  if (name == null) return;
  const trimmed = name.trim();
  if (!trimmed) return;
  await updateCounter(id, { name: trimmed });
}

async function setValueManually(id) {
  const counters = await getCounters();
  const c = counters.find((x) => x.id === id);
  if (!c) return;
  const raw = prompt('Значение:', String(c.value));
  if (raw == null) return;
  const v = Number(raw);
  if (Number.isNaN(v)) return;
  await updateCounter(id, { value: v });
}

async function resetCounter(id) {
  const counters = await getCounters();
  const c = counters.find((x) => x.id === id);
  if (!c) return;
  await updateCounter(id, { value: c.initialValue });
}

async function deleteCounter(id) {
  if (!confirm('Удалить счётчик?')) return;
  const counters = await getCounters();
  await saveCounters(counters.filter((c) => c.id !== id));
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.counters) {
    renderManager();
  }
});

renderManager();

load();
