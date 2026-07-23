// Popup manager — handles bar popup show/hide/toggle and collapse state
// persistence. Extracted from main.js to reduce its size.

const POPUP_ANIM_MS = 300;

export const BAR_BTN_MAP = {
  help: 'bar-controls-btn',
  monsterInfo: 'bar-monster-btn',
  settings: 'bar-settings-btn',
  about: 'bar-about-btn',
  dev: 'bar-dev-btn',
  save: 'bar-save-btn',
};

export const POPUP_MAP = {
  help: 'controls-popup',
  monsterInfo: 'monster-popup',
  settings: 'settings-popup',
  about: 'about-popup',
  dev: 'dev-popup',
  save: 'save-popup',
};

export function showPopup(key, UI_LAYOUT) {
  const popup = document.getElementById(POPUP_MAP[key]);
  const btn = document.getElementById(BAR_BTN_MAP[key]);
  if (!popup) return;
  const openKey = Object.keys(POPUP_MAP).find((k) => k !== key && !UI_LAYOUT.collapsed[k]);
  if (openKey) {
    hidePopup(openKey, UI_LAYOUT);
    const openPopup = document.getElementById(POPUP_MAP[openKey]);
    if (!openPopup) {
      openTarget(popup, btn, key, UI_LAYOUT);
      return;
    }
    let fallbackTimer = null;
    const onDone = () => {
      openPopup.removeEventListener('transitionend', onDone);
      clearTimeout(fallbackTimer);
      openTarget(popup, btn, key, UI_LAYOUT);
    };
    openPopup.addEventListener('transitionend', onDone);
    fallbackTimer = setTimeout(() => openTarget(popup, btn, key, UI_LAYOUT), POPUP_ANIM_MS + 50);
    return;
  }
  openTarget(popup, btn, key, UI_LAYOUT);
}

function openTarget(popup, btn, key, UI_LAYOUT) {
  popup.classList.remove('bar-popup--closed');
  if (btn) btn.classList.add('active');
  UI_LAYOUT.collapsed[key] = false;
}

export function hidePopup(key, UI_LAYOUT) {
  const popup = document.getElementById(POPUP_MAP[key]);
  const btn = document.getElementById(BAR_BTN_MAP[key]);
  if (popup) popup.classList.add('bar-popup--closed');
  if (btn) btn.classList.remove('active');
  UI_LAYOUT.collapsed[key] = true;
}

export function togglePopup(key, UI_LAYOUT) {
  UI_LAYOUT.collapsed[key] = !UI_LAYOUT.collapsed[key];
  if (UI_LAYOUT.collapsed[key]) {
    hidePopup(key, UI_LAYOUT);
  } else {
    showPopup(key, UI_LAYOUT);
  }
}

export async function persistCollapsed(UI_LAYOUT) {
  if (window.electron && window.electron.saveSettings) {
    try {
      const settings = (await window.electron.getSettings()) || {};
      if (!settings.collapsed) settings.collapsed = {};
      Object.assign(settings.collapsed, UI_LAYOUT.collapsed);
      window.electron.saveSettings(settings);
    } catch (_) {
      /* ignore */
    }
  }
}

// Wire up all bar-popup toggle buttons.
export function initPopupButtons(UI_LAYOUT) {
  Object.keys(BAR_BTN_MAP).forEach((key) => {
    const btn = document.getElementById(BAR_BTN_MAP[key]);
    if (btn) {
      btn.addEventListener('click', () => {
        togglePopup(key, UI_LAYOUT);
        persistCollapsed(UI_LAYOUT);
      });
    }
  });
  // Close all popups on launch
  Object.keys(BAR_BTN_MAP).forEach((key) => hidePopup(key, UI_LAYOUT));
}
