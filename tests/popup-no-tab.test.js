import test from 'node:test';
import assert from 'node:assert/strict';
import { installChromeMock } from './_chrome-mock.js';
import { installDomMock, getElement, click, submit } from './_dom-mock.js';

// Мок DOM и chrome ставим в globalThis до импорта попапа.
installDomMock();
const { chrome } = installChromeMock({ counters: [], tabs: [] });

// Попап на импорте сам вызывает init(); top-level await даёт дождаться её без гонок.
await import('../popup/popup.js');

test('без активной вкладки попап показывает заглушку и прячет создание', () => {
  assert.equal(getElement('scope-indicator').textContent, 'Нет активной страницы');
  assert.equal(getElement('toggle-new').hidden, true);
  assert.equal(getElement('new-form').hidden, true);
});

test('без активной вкладки обработчики не бросают', async () => {
  await assert.doesNotReject(async () => {
    click('cancel-new');
    submit('new-form');
  });
});

test('без активной вкладки обновление хранилища не роняет попап', () => {
  const onChanged = chrome.storage.onChanged.listeners[0];
  const counters = [
    {
      id: 'c1',
      name: 'Counter',
      value: 1,
      initialValue: 0,
      step: 1,
      scope: { type: 'global' },
      isPrimary: true,
      createdAt: 0,
      updatedAt: 0,
    },
  ];

  // Живое обновление из другого окна: попап перерисовывается, контекста при этом нет.
  assert.doesNotThrow(() => onChanged({ counters: { newValue: counters } }, 'local'));
});