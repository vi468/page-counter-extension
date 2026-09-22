import test from 'node:test';
import assert from 'node:assert/strict';
import { installChromeMock } from './_chrome-mock.js';
import {
  installDomMock,
  getElement,
  clickEl,
  fireOn,
  findAll,
  findAllByClass,
  findAllByTag,
} from './_dom-mock.js';

// Менеджер — единственное место, где обнуление спрашивает подтверждение: здесь
// ноль легко получить случайно (значение правится руками), да и своя кнопка
// удаления рядом. Проверяем, что вопрос появляется, что до ответа «да» в
// хранилище ничего не пишется и что обычная убавка вопрос не показывает.

// Страница настроек открывается встроенной в chrome://extensions, где Chrome
// глушит confirm/prompt/alert: любой диалог здесь — уже баг.
function forbiddenDialog() {
  throw new Error('диалоги на этой странице запрещены');
}

let caseId = 0;
const flush = () => new Promise((resolve) => setImmediate(resolve));

function counter(patch = {}) {
  return {
    id: 'c1',
    name: 'Помидоры',
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

async function setup(counters) {
  installDomMock();
  globalThis.confirm = forbiddenDialog;
  globalThis.prompt = forbiddenDialog;
  globalThis.alert = forbiddenDialog;

  const mock = installChromeMock({ counters });
  await import(`../options/options.js?zero-confirm=${++caseId}`);
  await flush();
  return mock;
}

function managerItem() {
  return findAllByClass(getElement('counters-manager'), 'manager-item')[0] ?? null;
}

// Вопрос об обнулении живёт внутри строки, по которой кликнули.
function question() {
  const item = managerItem();
  return item ? findAllByClass(item, 'zero-question')[0] ?? null : null;
}

function questionButton(label) {
  const box = question();
  if (!box) return null;
  return findAll(box, (el) => el.textContent === label)[0] ?? null;
}

async function clickAndSettle(el) {
  await Promise.all(clickEl(el));
  await flush();
}

// Клик по значению открывает инлайн-инпут; возвращаем его.
async function openValueInput(item) {
  await clickAndSettle(findAllByClass(item, 'value')[0]);
  return findAllByTag(item, 'input')[0];
}

async function typeZero(item) {
  const input = await openValueInput(item);
  assert.ok(input, 'значение правится инлайн-инпутом');
  input.value = '0';
  await Promise.all(fireOn(input, 'keydown', { key: 'Enter' }));
  await flush();
}

test('ноль, введённый руками, не удаляет счётчик сразу — сначала вопрос', async () => {
  const { storage } = await setup([counter({ value: 5 })]);

  await typeZero(managerItem());

  assert.equal(storage.counters.length, 1, 'без подтверждения счётчик остаётся');
  assert.equal(storage.counters[0].value, 5, 'и значение не меняется');
  const box = question();
  assert.ok(box, 'вопрос об обнулении показан в самой строке');
  assert.match(findAllByClass(box, 'zero-text')[0].textContent, /Помидоры/, 'в вопросе имя счётчика');
  assert.ok(managerItem(), 'строка счётчика на месте');
});

test('ответ «Обнулить и удалить» удаляет счётчик', async () => {
  const { storage } = await setup([counter({ value: 5 })]);

  await typeZero(managerItem());
  await clickAndSettle(questionButton('Обнулить и удалить'));

  assert.equal(storage.counters.length, 0, 'после ответа счётчик удалён');
  assert.equal(question(), null, 'вопрос убран');
  assert.equal(managerItem(), null, 'и строка исчезла из списка');
});

test('«Отмена» оставляет счётчик как был', async () => {
  const { storage } = await setup([counter({ value: 5 })]);

  await typeZero(managerItem());
  await clickAndSettle(questionButton('Отмена'));

  assert.equal(storage.counters.length, 1, 'счётчик на месте');
  assert.equal(storage.counters[0].value, 5, 'значение не тронуто');
  assert.equal(question(), null, 'вопрос снят');
});

test('«↺» при нулевом начальном значении спрашивает, а не удаляет молча', async () => {
  const { storage } = await setup([counter({ value: 9, initialValue: 0 })]);

  const reset = findAll(managerItem(), (el) => el.textContent === '↺')[0];
  assert.ok(reset, 'кнопка сброса найдена');
  assert.equal(reset.title, 'Обнулить и удалить', 'подпись честно обещает удаление');

  await clickAndSettle(reset);

  assert.equal(storage.counters.length, 1, 'первый клик ничего не удаляет');
  assert.ok(question(), 'показан вопрос');

  await clickAndSettle(questionButton('Обнулить и удалить'));
  assert.equal(storage.counters.length, 0, 'после ответа удалён');
});

test('«−» при уходе в ноль спрашивает, а выше нуля убавляет сразу', async () => {
  const { storage } = await setup([counter({ value: 12, step: 5 })]);

  const minus = () => findAll(managerItem(), (el) => el.textContent === '−')[0];

  // 12 − 5 = 7: ноль не получается, вопрос не нужен.
  await clickAndSettle(minus());
  assert.equal(storage.counters[0].value, 7);
  assert.equal(question(), null, 'обычная убавка вопрос не показывает');

  // 7 − 5 = 2, потом 2 − 5 уже ноль — здесь спрашиваем.
  await clickAndSettle(minus());
  assert.equal(storage.counters[0].value, 2);

  await clickAndSettle(minus());
  assert.equal(storage.counters[0].value, 2, 'в ноль не ушло без подтверждения');
  assert.ok(question(), 'показан вопрос об обнулении');
});

test('ненулевое значение сохраняется сразу, без вопроса', async () => {
  const { storage } = await setup([counter({ value: 5 })]);

  const input = await openValueInput(managerItem());
  input.value = '42';
  await Promise.all(fireOn(input, 'keydown', { key: 'Enter' }));
  await flush();

  assert.equal(storage.counters[0].value, 42);
  assert.equal(question(), null, 'вопрос не появлялся');
});

test('сброс к ненулевому начальному значению идёт без вопроса', async () => {
  const { storage } = await setup([counter({ value: 9, initialValue: 3 })]);

  const reset = findAll(managerItem(), (el) => el.textContent === '↺')[0];
  assert.equal(reset.title, 'Сбросить к 3', 'подпись говорит о сбросе, а не об удалении');

  await clickAndSettle(reset);

  assert.equal(storage.counters[0].value, 3);
  assert.equal(storage.counters.length, 1);
  assert.equal(question(), null, 'вопрос не нужен: счёт есть');
});