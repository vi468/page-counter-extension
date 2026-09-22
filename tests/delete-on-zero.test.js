import test from 'node:test';
import assert from 'node:assert/strict';
import { installChromeMock } from './_chrome-mock.js';
import {
  installDomMock,
  getElement,
  findByClass,
  findAllByClass,
  findAllByTag,
  fireOn,
} from './_dom-mock.js';

// Граница правила: стереть счётчик обнулением умеет только клавиатура — Alt+0 и
// Alt+↓. У сочетания нет ни списка, ни кнопки удаления, убрать счётчик больше
// нечем. Мышью (попап, менеджер) ноль — обычное значение: рядом есть своя кнопка
// удаления, и сброс не должен ничего терять, иначе кнопка сброса бессмысленна.

// background.js вешает слушатели на верхнем уровне, поэтому на каждый тест его
// надо импортировать заново. Без уникального хвоста Node отдаст закешированный
// модуль, и слушатели не перевесятся на свежий мок.
let caseId = 0;
async function loadBackground(options) {
  const mock = installChromeMock(options);
  await import(`../background.js?zero=${++caseId}`);
  return mock;
}

function counter(patch = {}) {
  return {
    id: 'c1',
    name: 'Counter',
    value: 0,
    initialValue: 0,
    step: 1,
    scope: { type: 'domain', domain: 'example.com' },
    isPrimary: true,
    createdAt: 0,
    updatedAt: 0,
    ...patch,
  };
}

const TAB = { id: 7, url: 'https://example.com/page' };
const flush = () => new Promise((resolve) => setImmediate(resolve));

function findButton(node, text) {
  for (const child of node.children ?? []) {
    if (child.textContent === text) return child;
    const found = findButton(child, text);
    if (found) return found;
  }
  return null;
}

// ---------- Правило в хранилище ----------

test('setCounterValueIn без флага: ноль остаётся нулём', async () => {
  installChromeMock({});
  const { setCounterValueIn } = await import('../lib/storage.js');

  const next = setCounterValueIn([counter({ value: 3 })], 'c1', 0);
  assert.equal(next.length, 1, 'счётчик остаётся');
  assert.equal(next[0].value, 0);
});

test('setCounterValueIn с removeAtZero: ноль удаляет счётчик', async () => {
  installChromeMock({});
  const { setCounterValueIn } = await import('../lib/storage.js');

  assert.deepEqual(setCounterValueIn([counter({ value: 3 })], 'c1', 0, { removeAtZero: true }), []);
});

test('setCounterValueIn: ненулевое значение просто записывается', async () => {
  installChromeMock({});
  const { setCounterValueIn } = await import('../lib/storage.js');

  const next = setCounterValueIn([counter({ value: 3 })], 'c1', 7);
  assert.equal(next.length, 1);
  assert.equal(next[0].value, 7);
});

// ---------- Хоткеи: обнуление стирает ----------

test('Alt+↓ уводит счётчик в ноль — он удаляется, а не остаётся на нуле', async () => {
  const { storage, chrome } = await loadBackground({ counters: [counter({ value: 1 })], tabs: [TAB] });

  await chrome.commands.onCommand.listeners[0]('decrement-primary');

  assert.deepEqual(storage.counters, [], 'обнулённый счётчик должен исчезнуть из памяти');
});

test('Alt+↓ при шаге больше значения удаляет счётчик, а не уводит в минус', async () => {
  const { storage, chrome } = await loadBackground({
    counters: [counter({ value: 2, step: 5 })],
    tabs: [TAB],
  });

  await chrome.commands.onCommand.listeners[0]('decrement-primary');

  assert.deepEqual(storage.counters, []);
});

test('Alt+↓ выше нуля оставляет счётчик со снятым шагом', async () => {
  const { storage, chrome } = await loadBackground({
    counters: [counter({ value: 12, step: 5 })],
    tabs: [TAB],
  });

  await chrome.commands.onCommand.listeners[0]('decrement-primary');

  assert.equal(storage.counters.length, 1);
  assert.equal(storage.counters[0].value, 7);
});

test('Alt+0 удаляет счётчик, у которого начальное значение 0', async () => {
  const { storage, chrome } = await loadBackground({ counters: [counter({ value: 9 })], tabs: [TAB] });

  await chrome.commands.onCommand.listeners[0]('reset-primary');

  assert.deepEqual(storage.counters, []);
});

test('Alt+0 со счётчиком на ненулевом начальном значении остаётся сбросом', async () => {
  const { storage, chrome } = await loadBackground({
    counters: [counter({ value: 9, initialValue: 3 })],
    tabs: [TAB],
  });

  await chrome.commands.onCommand.listeners[0]('reset-primary');

  assert.equal(storage.counters.length, 1, 'счётчик не должен удаляться: счёт есть');
  assert.equal(storage.counters[0].value, 3);
});

test('после удаления Alt+↑ заводит счётчик заново со значением 1', async () => {
  const { storage, chrome } = await loadBackground({ counters: [counter({ value: 1 })], tabs: [TAB] });
  const onCommand = chrome.commands.onCommand.listeners[0];

  await onCommand('decrement-primary');
  assert.deepEqual(storage.counters, []);

  await onCommand('increment-primary');
  assert.equal(storage.counters.length, 1);
  assert.equal(storage.counters[0].value, 1);
});

test('удаляется только обнулённый счётчик, соседние остаются', async () => {
  const { storage, chrome } = await loadBackground({
    counters: [
      counter({ id: 'c1', value: 1 }),
      counter({ id: 'c2', value: 4, isPrimary: false }),
    ],
    tabs: [TAB],
  });

  await chrome.commands.onCommand.listeners[0]('decrement-primary');

  assert.deepEqual(
    storage.counters.map((c) => c.id),
    ['c2'],
  );
  assert.equal(storage.counters[0].value, 4);
});

test('клик по иконке счётчик не стирает — он только прибавляет', async () => {
  const { storage, chrome } = await loadBackground({ counters: [counter({ value: 0 })], tabs: [TAB] });

  await chrome.action.onClicked.listeners[0](TAB);

  assert.equal(storage.counters.length, 1);
  assert.equal(storage.counters[0].value, 1);
});

// ---------- Мышь: ноль — обычное значение ----------

test('кнопка «−» в попапе доводит счётчик до нуля и оставляет его', async () => {
  installDomMock();
  const { storage } = installChromeMock({ counters: [counter({ value: 1 })], tabs: [TAB] });
  await import('../popup/popup.js?zero-popup=1');

  const minus = findButton(getElement('counter-list'), '−');
  assert.ok(minus, 'кнопка «−» должна отрисоваться');

  await minus.listeners.get('click')[0]();

  assert.equal(storage.counters.length, 1, 'попап ничего не стирает: у него есть кнопка удаления');
  assert.equal(storage.counters[0].value, 0);
});

test('пункт сброса в попапе ставит ноль и не удаляет счётчик', async () => {
  installDomMock();
  const { storage } = installChromeMock({ counters: [counter({ value: 5 })], tabs: [TAB] });
  await import('../popup/popup.js?zero-popup=2');

  const menuBtn = findByClass(getElement('counter-list'), 'menu-btn');
  assert.ok(menuBtn, 'кнопка меню должна отрисоваться');
  await menuBtn.listeners.get('click')[0]({ stopPropagation() {}, target: menuBtn });

  const item = findButton(document.body, 'Сбросить к 0');
  assert.ok(item, 'пункт меню остаётся сбросом, а не удалением');

  await item.listeners.get('click')[0]();
  await flush();

  assert.equal(storage.counters.length, 1, 'сброс не стирает счётчик');
  assert.equal(storage.counters[0].value, 0);
});

test('ноль, введённый руками в менеджере, остаётся нулём', async () => {
  installDomMock();
  const { storage } = installChromeMock({ counters: [counter({ value: 5, scope: { type: 'global' } })] });
  await import('../options/options.js?zero-manager=1');
  await flush();

  const item = findAllByClass(getElement('counters-manager'), 'manager-item')[0];
  assert.ok(item, 'строка менеджера отрисована');
  await item.children.find((el) => el.classList.contains('value')).listeners.get('click')[0]();

  const input = findAllByTag(item, 'input')[0];
  assert.ok(input, 'значение правится инлайн-инпутом');
  input.value = '0';
  await Promise.all(fireOn(input, 'keydown', { key: 'Enter' }));
  await flush();

  assert.equal(storage.counters.length, 1, 'менеджер ничего не стирает: кнопка удаления рядом');
  assert.equal(storage.counters[0].value, 0);
});