import '@testing-library/jest-dom/vitest';

// dockview-core uses ResizeObserver for auto-resizing the host element.
// jsdom doesn't ship one — provide a no-op polyfill matching dockview-core's
// own test setup pattern.
class MockResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).ResizeObserver = MockResizeObserver;
