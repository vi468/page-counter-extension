// Минимальный мок DOM, чтобы popup.js и options.js можно было импортировать в Node.
// Ставится в globalThis до `await import('../popup/popup.js')`: попап на импорте
// сразу дергает document.getElementById и в конце вызывает init().

const elements = new Map();
let activeElement = null;

function createElement(tagName = 'div') {
  const listeners = new Map();
  let innerHTML = '';

  const el = {
    tagName: String(tagName).toUpperCase(),
    children: [],
    listeners,
    textContent: '',
    value: '',
    type: '',
    hidden: false,
    className: '',
    title: '',
    disabled: false,
    files: undefined,
    offsetWidth: 0,
    parentNode: null,
    style: {},
    dataset: {},
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    removeEventListener(type, fn) {
      const arr = listeners.get(type);
      if (arr) listeners.set(type, arr.filter((f) => f !== fn));
    },
    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      return child;
    },
    replaceChild(newChild, oldChild) {
      const index = this.children.indexOf(oldChild);
      if (index !== -1) {
        this.children[index] = newChild;
        newChild.parentNode = this;
        oldChild.parentNode = null;
      }
      return oldChild;
    },
    remove() {
      if (!this.parentNode) return;
      const index = this.parentNode.children.indexOf(this);
      if (index !== -1) this.parentNode.children.splice(index, 1);
      this.parentNode = null;
    },
    reset() {},
    focus() {
      activeElement = this;
    },
    blur() {
      fireOn(this, 'blur');
      if (activeElement === this) activeElement = null;
    },
    getBoundingClientRect() {
      return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 };
    },
  };

  const classList = {
    names: () => el.className.split(/\s+/).filter(Boolean),
    contains(name) {
      return classList.names().includes(name);
    },
    add(...names) {
      const set = new Set(classList.names());
      for (const name of names) set.add(name);
      el.className = [...set].join(' ');
    },
    remove(...names) {
      const drop = new Set(names);
      el.className = classList.names().filter((name) => !drop.has(name)).join(' ');
    },
    toggle(name, force) {
      const on = force === undefined ? !classList.contains(name) : Boolean(force);
      if (on) classList.add(name);
      else classList.remove(name);
      return on;
    },
  };
  el.classList = classList;

  // innerHTML = '' в реальном DOM сносит детей; без этого повторный рендер
  // оставлял бы в моке старые элементы и тесты видели бы дубли.
  Object.defineProperty(el, 'innerHTML', {
    enumerable: true,
    get: () => innerHTML,
    set: (value) => {
      innerHTML = String(value);
      if (innerHTML === '') el.children.length = 0;
    },
  });

  return el;
}

// Стабильный элемент на каждый id: повторный вызов возвращает тот же объект.
export function getElement(id) {
  if (!elements.has(id)) elements.set(id, createElement('div'));
  return elements.get(id);
}

// Вызвать вручную обработчики, зарегистрированные на элементе.
// Возвращает массив результатов: у async-обработчиков это промисы.
export function fireOn(el, type, event = {}) {
  const base = {
    target: el,
    preventDefault() {},
    stopPropagation() {},
  };
  const results = [];
  for (const fn of el.listeners.get(type) ?? []) {
    results.push(fn({ ...base, ...event }));
  }
  return results;
}

export function fire(id, type, event = {}) {
  return fireOn(getElement(id), type, event);
}

export function click(id, event) {
  return fire(id, 'click', event);
}

export function submit(id, event) {
  return fire(id, 'submit', event);
}

// Обход дерева: элементы, созданные кодом страницы, ищутся по классу/тегу.
export function findAll(root, predicate) {
  const out = [];
  const walk = (node) => {
    for (const child of node.children ?? []) {
      if (predicate(child)) out.push(child);
      walk(child);
    }
  };
  walk(root);
  return out;
}

export function findByClass(root, className) {
  return findAll(root, (el) => el.classList.contains(className))[0] ?? null;
}

export function findAllByClass(root, className) {
  return findAll(root, (el) => el.classList.contains(className));
}

export function findAllByTag(root, tag) {
  const wanted = String(tag).toUpperCase();
  return findAll(root, (el) => el.tagName === wanted);
}

export function clickEl(el, event) {
  return fireOn(el, 'click', event);
}

export function blurEl(el, event) {
  return fireOn(el, 'blur', event);
}

export function installDomMock() {
  elements.clear();
  activeElement = null;

  globalThis.document = {
    getElementById: (id) => getElement(id),
    createElement: (tag) => createElement(tag),
    body: createElement('body'),
    activeElement: null,
    addEventListener() {},
    removeEventListener() {},
  };

  globalThis.alert = () => {};
  globalThis.confirm = () => true;
  globalThis.prompt = () => null;

  return {
    getElement,
    fire,
    click,
    submit,
    fireOn,
    clickEl,
    blurEl,
    findAll,
    findByClass,
    findAllByClass,
    findAllByTag,
  };
}
