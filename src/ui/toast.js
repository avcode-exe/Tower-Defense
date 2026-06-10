// Toast notification system — shared module.
// Provides transient on-screen messages (bottom-right, newest on top).

const TOAST_DURATION = 4000;
const TOAST_FADE_MS = 400;

let _container = null;

function _getContainer() {
  if (!_container) {
    _container = document.getElementById('toast-container');
  }
  return _container;
}

function removeToast(toast) {
  if (!toast || !toast.parentNode) return;
  toast.classList.add('toast-out');
  setTimeout(() => {
    if (toast.parentNode) toast.parentNode.removeChild(toast);
  }, TOAST_FADE_MS);
}

export function showToast(text, type, duration) {
  const container = _getContainer();
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'toast';
  const dotClass =
    type === 'success' ? 'success' : type === 'error' ? 'error' : type === 'warning' ? 'warning' : 'info';
  const dot = document.createElement('span');
  dot.className = 'toast-dot ' + dotClass;
  toast.appendChild(dot);
  toast.appendChild(document.createTextNode(text));
  toast.addEventListener(
    'click',
    () => {
      removeToast(toast);
    },
    { once: true }
  );
  container.appendChild(toast);
  setTimeout(() => removeToast(toast), duration || TOAST_DURATION);
}
