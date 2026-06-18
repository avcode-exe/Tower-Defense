import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';

function makeElement(tagName) {
  const element = {
    tagName,
    className: '',
    children: [],
    parentNode: null,
    eventListeners: new Map(),
    text: '',
  };

  element.classList = {
    add: vi.fn((name) => {
      if (!classNameParts.has(element)) classNameParts.set(element, new Set());
      classNameParts.get(element).add(name);
      element.className = [...classNameParts.get(element)].join(' ');
    }),
  };
  element.appendChild = vi.fn((child) => {
    child.parentNode = element;
    element.children.push(child);
    return child;
  });
  element.removeChild = vi.fn((child) => {
    const index = element.children.indexOf(child);
    if (index >= 0) element.children.splice(index, 1);
    child.parentNode = null;
    return child;
  });
  element.addEventListener = vi.fn((name, handler, options) => {
    element.eventListeners.set(name, { handler, options });
  });

  return element;
}

const classNameParts = new WeakMap();

function makeDocument(container) {
  const documentStub = {
    container,
    getElementById: vi.fn((id) => (id === 'toast-container' ? documentStub.container : null)),
    createElement: vi.fn((tagName) => makeElement(tagName)),
    createTextNode: vi.fn((text) => ({ nodeType: 3, text })),
  };

  return documentStub;
}

describe('showToast', () => {
  let documentStub;
  let container;

  beforeEach(() => {
    vi.useFakeTimers();
    container = makeElement('div');
    documentStub = makeDocument(container);
    vi.stubGlobal('document', documentStub);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  async function loadToast() {
    vi.resetModules();
    return (await import('../src/ui/toast.js')).showToast;
  }

  it('does nothing when the toast container is missing', async () => {
    documentStub.container = null;
    const showToast = await loadToast();

    showToast('missing');

    expect(documentStub.getElementById).toHaveBeenCalledWith('toast-container');
    expect(documentStub.createElement).not.toHaveBeenCalled();
  });

  it('creates a toast with a dot and text node', async () => {
    const showToast = await loadToast();

    showToast('Saved', 'success');

    const toast = container.children[0];
    expect(toast.className).toBe('toast');
    expect(toast.children[0].className).toBe('toast-dot success');
    expect(toast.children[1].text).toBe('Saved');
  });

  it.each(['success', 'error', 'warning', 'info'])('uses %s dot class', async (type) => {
    const showToast = await loadToast();

    showToast('message', type);

    expect(container.children[0].children[0].className).toBe('toast-dot ' + type);
  });

  it('removes the toast after click fade timeout', async () => {
    const showToast = await loadToast();

    showToast('message', 'info');

    const toast = container.children[0];
    const clickHandler = toast.eventListeners.get('click').handler;
    clickHandler();

    expect(toast.classList.add).toHaveBeenCalledWith('toast-out');
    expect(container.children).toContain(toast);

    vi.advanceTimersByTime(400);

    expect(container.children).not.toContain(toast);
  });

  it('auto-removes the toast after the default duration', async () => {
    const showToast = await loadToast();

    showToast('message', 'info');

    const toast = container.children[0];
    vi.advanceTimersByTime(4000);
    expect(toast.classList.add).toHaveBeenCalledWith('toast-out');
    expect(container.children).toContain(toast);

    vi.advanceTimersByTime(400);
    expect(container.children).not.toContain(toast);
  });

  it('uses a custom duration when provided', async () => {
    const showToast = await loadToast();

    showToast('message', 'info', 1500);

    const toast = container.children[0];
    vi.advanceTimersByTime(1500);
    expect(toast.classList.add).toHaveBeenCalledWith('toast-out');
    expect(container.children).toContain(toast);

    vi.advanceTimersByTime(400);
    expect(container.children).not.toContain(toast);
  });
});
