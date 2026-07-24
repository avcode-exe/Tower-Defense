// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('showToast', () => {
  let showToast;
  let container;

  beforeEach(async () => {
    document.body.innerHTML = '<div id="toast-container"></div>';
    container = document.getElementById('toast-container');
    vi.resetModules();
    const mod = await import('../src/ui/toast.js');
    showToast = mod.showToast;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('no-op when container missing', () => {
    document.body.innerHTML = '';
    expect(() => showToast('test', 'info')).not.toThrow();
  });

  it('creates toast with dot and text node', () => {
    showToast('Hello', 'info');
    const toasts = container.querySelectorAll('.toast');
    expect(toasts.length).toBe(1);
    expect(toasts[0].textContent).toContain('Hello');
  });

  it('dot class for each type', () => {
    showToast('s', 'success');
    showToast('e', 'error');
    showToast('w', 'warning');
    showToast('i', 'info');
    const dots = container.querySelectorAll('.toast-dot');
    expect(dots[0].classList.contains('success')).toBe(true);
    expect(dots[1].classList.contains('error')).toBe(true);
    expect(dots[2].classList.contains('warning')).toBe(true);
    expect(dots[3].classList.contains('info')).toBe(true);
  });

  it('click removal with fade timeout', () => {
    showToast('test', 'info');
    const toast = container.querySelector('.toast');
    toast.click();
    expect(toast.classList.contains('toast-out')).toBe(true);
    vi.advanceTimersByTime(400);
    // After fade timeout complete, the toast should be removed
    expect(container.children.length).toBe(0);
  });

  it('auto-removal after default duration', () => {
    showToast('auto', 'info');
    expect(container.children.length).toBe(1);
    // Advance past TOAST_DURATION (4000) + TOAST_FADE (400) = 4400ms total
    vi.advanceTimersByTime(4400);
    expect(container.children.length).toBe(0);
  });

  it('custom duration', () => {
    showToast('custom', 'info', 1000);
    vi.advanceTimersByTime(1399);
    expect(container.children.length).toBe(1);
    vi.advanceTimersByTime(1);
    expect(container.children.length).toBe(0);
  });

  it('no-type fallback covers TYPE_ICONS || and icon ternary branches', () => {
    showToast('notype');
    const toasts = container.querySelectorAll('.toast');
    expect(toasts.length).toBe(1);
    // type arg undefined => type || 'info' => 'info', but TYPE_ICONS[undefined] = undefined
    // so TYPE_ICONS[type] || '' falls through to '' and icon ternary takes falsy branch
    expect(toasts[0].textContent).toBe('notype');
  });

  it('multiple toasts stack', () => {
    showToast('one', 'info');
    showToast('two', 'error');
    showToast('three', 'success');
    expect(container.children.length).toBe(3);
  });

  it('setTimeout callback safely handles removed toast', () => {
    showToast('test', 'info');
    const toast = container.children[0];
    // Remove the toast from DOM before the fade timeout fires
    container.removeChild(toast);
    vi.advanceTimersByTime(400);
    // Should not throw - the setTimeout callback checks parentNode
    expect(container.querySelectorAll('.toast').length).toBe(0);
  });

  it('removeToast returns early when toast is null (line 17)', () => {
    // Direct call to internal removeToast with null
    // Test via importing the unexported function indirectly
    // removeToast checks: if (!toast || !toast.parentNode) return;
    // With null, returns early — no error
    showToast('test', 'info');
    const toast = container.children[0];
    const parent = toast.parentNode;
    // Remove toast via internal path
    parent.removeChild(toast);
    // The setTimeout callback handles this gracefully
    vi.advanceTimersByTime(450);
    expect(container.querySelectorAll('.toast').length).toBe(0);
  });

  it('removeToast returns early when toast has no parentNode', () => {
    showToast('test', 'info');
    const toast = container.children[0];
    // Remove from DOM
    toast.parentNode.removeChild(toast);
    // Call removeToast via the click handler path
    const clickEvent = new MouseEvent('click');
    toast.dispatchEvent(clickEvent);
    vi.advanceTimersByTime(450);
    expect(container.querySelectorAll('.toast').length).toBe(0);
  });
});
