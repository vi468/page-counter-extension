import test from 'node:test';
import assert from 'node:assert/strict';
import { installChromeMock } from './_chrome-mock.js';
import { installDomMock, getElement } from './_dom-mock.js';

// Lost update: две мутации читают одно состояние и обе пишут «старое + 1».
// Тесты воспроизводят гонку на реальном коде воркера и попапа.

const TAB = { id: 7, url: 'https://example.com/page' };

function counter(patch = {}) {
  return {
    id: 'c1',
    name: 'Counter',
    value: 0,
    initialValue: 0,
    step: 1,
    scope: { type: 'global' },
    isPrimary: true,
    createdAt: 0,
    updatedAt: 0,
    ...patch,
  };
}

// Уникальный хвост: без него Node отдаст закешированный background.js,
// и слушатели не перевесятся на свежий мок.
let caseId = 0;
async function loadBackground(options) {
  const mock = installChromeMock(options);
  await import(`../background.js?concurrent=${++caseId}`);
  return mock;
}

// ---------- Воркер ----------

test('два одновременных хоткея увеличения не теряют инкремент', async () => {
  const { storage, chrome } = await loadBackground({ counters: [counter()], tabs: [TAB] });
  const onCommand = chrome.commands.onCommand.listeners[0];

  await Promise.all([onCommand('increment-primary'), onCommand('increment-primary')]);

  assert.equal(storage.counters[0].value, 2);
});

// ---------- Попап ----------

// Кнопка «+» отрисованного счётчика.
function findPlus(node) {
  for (const child of node.children ?? []) {
    if (child.textContent === '+') return child;
    const found = findPlus(child);
    if (found) return found;
  }
  return null;
}

test('клик в попапе не затирает внешнее изменение счётчика', async () => {
  installDomMock();
  const { storage } = installChromeMock({ counters: [counter()], tabs: [TAB] });
  await import('../popup/popup.js');

  const plus = findPlus(getElement('counter-list'));
  assert.ok(plus, 'кнопка «+» должна отрисоваться');

  // Внешнее изменение (воркер/другое окно) уже легло в хранилище, но
  // onChanged до попапа ещё не дошёл — его локальная копия устарела.
  storage.counters = [counter({ value: 5 })];

  await plus.listeners.get('click')[0]();

  assert.equal(storage.counters[0].value, 6);
});

// ---------- Устойчивость очереди ----------

test('падение мутации не залипает очередь', async () => {
  installChromeMock({ counters: [counter()] });
  const { mutateCounters, updateCounterIn } = await import('../lib/storage.js');

  await assert.rejects(
    mutateCounters(() => {
      throw new Error('boom');
    }),
  );

  const after = await mutateCounters((all) => updateCounterIn(all, 'c1', () => ({ value: 42 })));
  assert.equal(after[0].value, 42);
});
