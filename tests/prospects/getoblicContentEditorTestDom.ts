/**
 * Install a DOM before react-dom evaluates.
 * React binds text-input events only when window exists at module init.
 */
import { JSDOM } from "jsdom";

const dom = new JSDOM(
  "<!doctype html><html><body><div id='getoblic-content-editor-root'></div></body></html>",
  { url: "http://localhost/", pretendToBeVisual: true },
);
const { window } = dom;

Object.defineProperty(globalThis, "window", {
  configurable: true,
  writable: true,
  value: window,
});
Object.defineProperty(globalThis, "document", {
  configurable: true,
  writable: true,
  value: window.document,
});
Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  writable: true,
  value: window.navigator,
});
globalThis.HTMLElement = window.HTMLElement;
globalThis.HTMLTextAreaElement = window.HTMLTextAreaElement;
globalThis.Node = window.Node;
globalThis.Event = window.Event;
globalThis.MouseEvent = window.MouseEvent;
globalThis.InputEvent = window.InputEvent;
globalThis.MutationObserver = window.MutationObserver;
globalThis.getComputedStyle = window.getComputedStyle.bind(window);
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
