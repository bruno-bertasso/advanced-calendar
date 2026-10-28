import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => cleanup());

// jsdom lacks these browser APIs used by Base UI / our media queries.
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

// Base UI waits for exit animations via getAnimations(), which jsdom doesn't implement.
if (!Element.prototype.getAnimations) {
  Element.prototype.getAnimations = () => [];
}

// jsdom has no layout. Give elements a viewport-sized client box so @tanstack/react-virtual
// (which measures the scroll element's clientWidth/clientHeight) renders a realistic window.
Object.defineProperties(HTMLElement.prototype, {
  clientWidth: { configurable: true, get: () => 1200 },
  clientHeight: { configurable: true, get: () => 800 },
});
