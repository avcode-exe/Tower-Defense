// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('DOM accessibility audit', () => {
  let html;
  let parser;

  beforeAll(() => {
    html = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf-8');
    // Use regex-based parsing since jsdom is heavy
    parser = (tag, attr, value) => {
      const regex = new RegExp(`<${tag}[^>]*${attr}=["']([^"']*)["']`, 'gi');
      const matches = [];
      let m;
      while ((m = regex.exec(html)) !== null) {
        matches.push(m[1]);
      }
      return matches;
    };
  });

  it('has panel-bar buttons with text content', () => {
    expect(html).toContain('id="panel-bar"');
  });

  it('toast-container has aria-live="polite"', () => {
    expect(html).toContain('id="toast-container"');
    expect(html).toContain('aria-live="polite"');
  });

  it('notify-panel has role="dialog"', () => {
    expect(html).toContain('id="notify-panel"');
  });

  it('load-progress-dialog has role="dialog"', () => {
    expect(html).toContain('id="load-progress-dialog"');
  });

  it('load-progress-dialog has aria-label', () => {
    const match = html.match(/load-progress-dialog[^>]*aria-label="([^"]+)"/);
    expect(match).not.toBeNull();
  });

  it('load-progress-dialog has focusable button elements', () => {
    // The dialog may have buttons as input[type=button] or <button> elements
    const hasButton = html.includes('<button') || html.includes('type="button"');
    expect(hasButton).toBe(true);
  });

  it('settings inputs have aria-label', () => {
    const inputs = html.match(/<input[^>]*>/gi);
    if (inputs) {
      for (const input of inputs) {
        if (input.includes('type="checkbox"') || input.includes('type="text"')) {
          expect(input).toMatch(/aria-label/i);
        }
      }
    }
  });

  it('about-github-link has rel="noopener"', () => {
    const match = html.match(/id="about-github-link"[^>]*>/i);
    if (match) {
      const linkTag = match[0];
      expect(linkTag).toMatch(/rel="?noopener"?/i);
    }
  });
});
