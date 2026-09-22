import {
  getSettings,
  saveSettings,
  getCounters,
  mutateCounters,
  updateCounterIn,
  normalizeStep,
  sanitizeCounters,
  setCounterValueIn,
  incrementCounterIn,
  decrementCounterIn,
} from '../lib/storage.js';

// Внимание: страница настроек открывается встроенной в chrome://extensions, в
// кросс-доменном iframe. Chrome глушит там confirm/prompt/alert — они молча
// возвращают false/null. Поэтому на этой странице модальных окон нет: любое
// действие делается инлайн, а результат показывается текстом на странице.

const form = document.getElementById('settings-form');
const defaultScopeEl = document.getElementById('defaultScope');
const iconClickActionEl = document.getElementById('iconClickAction');
const savedMsg = document.getElementById('saved-msg');

async function load() {
  const settings = await getSettings();
  defaultScopeEl.value = settings.defaultScope;
  iconClickActionEl.value = settings.iconClickAction;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const settings = {
    defaultScope: defaultScopeEl.value,
    iconClickAction: iconClickActionEl.value,
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
const importConfirmEl = document.getElementById('import-confirm');
const importConfirmText = document.getElementById('import-confirm-text');
const importApplyBtn = document.getElementById('import-apply');
const importCancelBtn = document.getElementById('import-cancel');
const importResultEl = document.getElementById('import-result');

importBtn.addEventListener('click', () => importFile.click());

// Разобранный файл ждёт подтверждения. Диалог заменён обычной строкой в вёрстке.
let pendingImport = null; // { counters, settings, note }

function importNote(dropped) {
  return dropped ? ` Некорректных записей пропущено: ${dropped}.` : '';
}

function showImportResult(text, isError = false) {
  importResultEl.textContent = text;
  importResultEl.classList.toggle('error', isError);
  importResultEl.hidden = false;
}

importFile.addEventListener('change', async () => {
  const file = importFile.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!Array.isArray(data.counters)) throw new Error('Некорректный формат');

    const { counters, dropped } = sanitizeCounters(data.counters);
    if (counters.length === 0) throw new Error('в файле нет ни одного корректного счётчика');

    pendingImport = { counters, settings: data.settings, note: importNote(dropped) };
    importConfirmText.textContent =
      `Импортировать ${counters.length} счётчик(ов)? Текущие будут заменены.${pendingImport.note}`;
    importResultEl.hidden = true;
    importConfirmEl.hidden = false;
  } catch (err) {
    pendingImport = null;
    importConfirmEl.hidden = true;
    showImportResult('Ошибка импорта: ' + err.message, true);
  } finally {
    importFile.value = '';
  }
});

importApplyBtn.addEventListener('click', async () => {
  if (!pendingImport) return;
  const { counters, settings, note } = pendingImport;
  const loaded = counters.length;
  pendingImport = null;
  importConfirmEl.hidden = true;
  try {
    await mutateCounters(() => counters);
    if (settings) await saveSettings(settings);
    await load();
    await renderManager();
    showImportResult(`Импорт завершён. Загружено счётчиков: ${loaded}.${note}`);
  } catch (err) {
    showImportResult('Ошибка импорта: ' + err.message, true);
  }
});

importCancelBtn.addEventListener('click', () => {
  pendingImport = null;
  importConfirmEl.hidden = true;
  importResultEl.hidden = true;
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

// Значения счётчиков целые, приводить нечего.
function formatValue(v) {
  return String(v);
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

// Инлайн-правка вместо prompt: элемент превращается в input. Enter и потеря
// фокуса сохраняют, Esc отменяет. После любого исхода список перерисовывается,
// поэтому невалидный ввод возвращает прежний вид.
function startInlineEdit(li, target, { type, className, value, onCommit }) {
  const input = document.createElement('input');
  input.type = type;
  input.className = className;
  input.value = value;
  li.replaceChild(input, target);
  input.focus();

  let finished = false;
  const finish = async (save) => {
    if (finished) return;
    finished = true;
    if (save) await onCommit(input.value);
    await renderManager();
  };

  input.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      await finish(true);
    } else if (e.key === 'Escape') {
      await finish(false);
    }
  });
  input.addEventListener('blur', () => finish(true));
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
  name.addEventListener('click', () => {
    startInlineEdit(li, name, {
      type: 'text',
      className: 'inline-input',
      value: c.name,
      onCommit: async (raw) => {
        const trimmed = raw.trim();
        if (!trimmed || trimmed === c.name) return;
        await mutateCounters((all) => updateCounterIn(all, c.id, () => ({ name: trimmed })));
      },
    });
  });
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
  value.addEventListener('click', () => {
    startInlineEdit(li, value, {
      type: 'number',
      className: 'inline-input value-input',
      value: String(c.value),
      onCommit: async (raw) => {
        const v = Number(raw);
        if (!Number.isInteger(v) || v < 0) return;
        await mutateCounters((all) => setCounterValueIn(all, c.id, v));
      },
    });
  });
  li.appendChild(value);

  const step = document.createElement('span');
  step.className = 'step';
  step.textContent = `шаг ${formatValue(c.step)}`;
  step.title = 'Изменить шаг';
  step.addEventListener('click', () => {
    startInlineEdit(li, step, {
      type: 'number',
      className: 'inline-input step-input',
      value: String(c.step),
      onCommit: async (raw) => {
        const v = Number(raw);
        if (!Number.isInteger(v) || v <= 0) return;
        await mutateCounters((all) =>
          updateCounterIn(all, c.id, () => ({ step: normalizeStep(v) })),
        );
      },
    });
  });
  li.appendChild(step);

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

  li.appendChild(renderDeleteButton(c));

  return li;
}

// Удаление без confirm: первый клик переводит кнопку в режим подтверждения,
// второй удаляет. Если подтверждения нет 3 секунды — кнопка возвращается назад.
function renderDeleteButton(c) {
  const del = document.createElement('button');
  del.className = 'mini-btn danger';
  del.textContent = '×';
  del.title = 'Удалить';

  let armed = false;
  let timer = null;

  const disarm = () => {
    armed = false;
    timer = null;
    del.textContent = '×';
    del.title = 'Удалить';
    del.classList.remove('confirm');
  };

  del.addEventListener('click', async () => {
    if (!armed) {
      armed = true;
      del.textContent = 'удалить?';
      del.title = 'Нажмите ещё раз, чтобы удалить';
      del.classList.add('confirm');
      timer = setTimeout(disarm, 3000);
      return;
    }
    clearTimeout(timer);
    await deleteCounter(c.id);
  });

  return del;
}

async function applyDelta(id, delta) {
  await mutateCounters((all) =>
    delta < 0 ? decrementCounterIn(all, id, delta) : incrementCounterIn(all, id, delta),
  );
  await renderManager();
}

async function resetCounter(id) {
  await mutateCounters((all) => {
    const current = all.find((c) => c.id === id);
    if (!current) return all;
    return setCounterValueIn(all, id, current.initialValue);
  });
  await renderManager();
}

async function deleteCounter(id) {
  await mutateCounters((all) => {
    if (!all.some((c) => c.id === id)) return all;
    return all.filter((c) => c.id !== id);
  });
  await renderManager();
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.counters) {
    renderManager();
  }
});

await renderManager();

await load();
