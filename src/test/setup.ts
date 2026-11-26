import '@testing-library/jest-dom';

HTMLMediaElement.prototype.play = () => Promise.resolve();
HTMLMediaElement.prototype.pause = () => {};
HTMLMediaElement.prototype.load = () => {};

if (typeof globalThis.PointerEvent === 'undefined') {
  class MockPointerEvent extends MouseEvent {
    readonly pointerId: number;
    readonly pointerType: string;

    constructor(type: string, params: PointerEventInit = {}) {
      super(type, params);
      this.pointerId = params.pointerId ?? 0;
      this.pointerType = params.pointerType ?? 'mouse';
    }
  }
  globalThis.PointerEvent = MockPointerEvent as unknown as typeof PointerEvent;
}
