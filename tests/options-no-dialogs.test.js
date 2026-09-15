import test from 'node:test';
import assert from 'node:assert/strict';
import { installChromeMock } from './_chrome-mock.js';
import {
  installDomMock,
  getElement,
  fireOn,
  clickEl,
  findAll,
  findAllByClass,
  findAllByTag,
} from './_dom-mock.js';

// Страница настроек открывается встроенной в chrome://extensions, где Chrome
// глушит confirm/prompt/alert. Любой вызов диалога — уже баг, поэтому здесь
// все три функции бросают: тест падает на первом же диалоге.
function forbiddenDialog() {
  throw new Error('диалоги на этой странице запрещены');
}

let caseId = 0;

function counter(patch = {}) {
  return {
    id: 'c1',
    name: 'Счётчик',
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

const flush = () => new Promise((resolve) => setImmediate(resolve));

async function setup(counters) {
  installDomMock();
  globalThis.confirm = forbiddenDialog;
  globalThis.prompt = forbiddenDialog;
  globalThis.alert = forbiddenDialog;

  const mock = installChromeMock({ counters });
  await import(`../options/options.js?no-dialogs=${++caseId}`);
  await flush();
  return mock;
}

function managerItem() {
  return findAllByClass(getElement('counters-manager'), 'manager-item')[0] ?? null;
}

async function clickAndSettle(el) {
  await Promise.all(clickEl(el));
  await flush();
}

async function keyAndSettle(el, key) {
  await Promise.all(fireOn(el, 'keydown', { key }));
  await flush();
}

test('удаление двумя кликами по «×» не вызывает confirm', async () => {
  const { storage } = await setup([counter()]);
  const item = managerItem();
  assert.ok(item, 'счётчик должен отрисоваться');

  const del = findAll(item, (el) => el.textContent === '×')[0];
  assert.ok(del, 'кнопка удаления найдена');

  // Первый клик только вооружает кнопку и ничего не удаляет.
  await clickAndSettle(del);
  assert.equal(del.textContent, 'удалить?', 'кнопка перешла в состояние подтверждения');
  assert.equal(storage.counters.length, 1, 'первый клик не удаляет');
  assert.ok(del.classList.contains('danger'), 'подтверждение идёт с классом danger');

  // Второй клик удаляет.
  await clickAndSettle(del);
  assert.equal(storage.counters.length, 0, 'счётчик удалён из хранилища');
  assert.equal(managerItem(), null, 'счётчик исчез из отрисованного списка');
});

test('переименование идёт через инлайн-инпут, без prompt', async () => {
  const { storage } = await setup([counter()]);
  const item = managerItem();

  const name = findAllByClass(item, 'name')[0];
  assert.ok(name, 'имя найдено');
  await clickAndSettle(name);

  const input = findAllByTag(item, 'input')[0];
  assert.ok(input, 'клик по имени превращает его в input');
  assert.equal(input.value, 'Счётчик', 'в инпуте текущее имя');

  input.value = 'Помидоры';
  await keyAndSettle(input, 'Enter');

  assert.equal(storage.counters[0].name, 'Помидоры', 'имя сохранено');
  assert.equal(findAllByClass(managerItem(), 'name')[0].textContent, 'Помидоры');
});

test('пустое имя не сохраняется, поле возвращается к прежнему', async () => {
  const { storage } = await setup([counter()]);
  const item = managerItem();

  await clickAndSettle(findAllByClass(item, 'name')[0]);
  const input = findAllByTag(item, 'input')[0];
  input.value = '   ';
  await keyAndSettle(input, 'Enter');

  assert.equal(storage.counters[0].name, 'Счётчик', 'пустое имя не сохранилось');
  assert.equal(findAllByClass(managerItem(), 'name')[0].textContent, 'Счётчик');
});

test('шаг задаётся инлайн-инпутом и сохраняется как 5', async () => {
  const { storage } = await setup([counter()]);
  const item = managerItem();

  const step = findAllByClass(item, 'step')[0];
  assert.ok(step, 'шаг виден в строке менеджера');
  assert.equal(step.textContent, 'шаг 1');
  await clickAndSettle(step);

  const input = findAllByTag(item, 'input')[0];
  assert.ok(input, 'клик по шагу превращает его в input');
  input.value = '5';
  await keyAndSettle(input, 'Enter');

  assert.equal(storage.counters[0].step, 5, 'шаг сохранён');
  assert.equal(findAllByClass(managerItem(), 'step')[0].textContent, 'шаг 5');
});

test('некорректный шаг не сохраняется, возвращается прежний', async () => {
  const { storage } = await setup([counter({ step: 2 })]);
  const item = managerItem();

  await clickAndSettle(findAllByClass(item, 'step')[0]);
  const input = findAllByTag(item, 'input')[0];
  input.value = '0';
  await keyAndSettle(input, 'Enter');

  assert.equal(storage.counters[0].step, 2, 'нулевой шаг не принят');
  assert.equal(findAllByClass(managerItem(), 'step')[0].textContent, 'шаг 2');
});
