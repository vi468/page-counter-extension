// Минимальный мок DOM, чтобы popup.js можно было импортировать в Node.
// Ставится в globalThis до `await import('../popup/popup.js')`: попап на импорте
// сразу дергает document.getElementById и в конце вызывает init().

const elements = new Map();

function createElement(tagName = 'div') {
  const listeners = new Map();

  const el = {
    tagName: String(tagName).toUpperCase(),
    children: [],
    listeners,
    textContent: '',
    value: '',
    hidden: false,
    className: '',
    title: '',
    innerHTML: '',
    disabled: false,
    offsetWidth: 0,
    style: {},
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    removeEventListener(type, fn) {
      const arr = listeners.get(type);
      if (arr) listeners.set(type, arr.filter((f) => f !== fn));
    },
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    remove() {},
    reset() {},
    focus() {},
    getBoundingClientRect() {
      return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 };
    },
  };

  return el;
}

// Стабильный элемент на каждый id: повторный вызов возвращает тот же объект.
export function getElement(id) {
  if (!elements.has(id)) elements.set(id, createElement('div'));
  return elements.get(id);
}

// Вызвать вручную обработчики, зарегистрированные на элементе.
export function fire(id, type, event = {}) {
  const el = getElement(id);
  const base = {
    target: el,
    preventDefault() {},
    stopPropagation() {},
  };
  for (const fn of el.listeners.get(type) ?? []) {
    fn({ ...base, ...event });
  }
}

export function click(id, event) {
  fire(id, 'click', event);
}

export function submit(id, event) {
  fire(id, 'submit', event);
}

export function installDomMock() {
  elements.clear();

  globalThis.document = {
    getElementById: (id) => getElement(id),
    createElement: (tag) => createElement(tag),
    body: createElement('body'),
    addEventListener() {},
    removeEventListener() {},
  };

  globalThis.alert = () => {};
  globalThis.confirm = () => true;
  globalThis.prompt = () => null;

  return { getElement, fire, click, submit };
}