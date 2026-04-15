import { getSettings, saveSettings, getCounters, saveCounters, DEFAULT_SETTINGS } from '../lib/storage.js';

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

load();
