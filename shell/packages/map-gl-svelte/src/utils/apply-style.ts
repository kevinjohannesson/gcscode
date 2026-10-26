/** An object of inline CSS properties: camelCase keys, string or number values. */
export type CSSProperties = Record<string, string | number>;

// This is a simplified version of
// https://github.com/facebook/react/blob/4131af3e4bf52f3a003537ec95a1655147c81270/src/renderers/dom/shared/CSSPropertyOperations.js#L62
const unitlessNumber = /box|flex|grid|column|lineHeight|fontWeight|opacity|order|tabSize|zIndex/;

/**
 * Apply an object of CSS properties to an element's inline style, one property at a time.
 * Properties not named in `style` are left as they are (a marker's `transform`, for instance).
 * A finite number gets `px` appended unless the property is unitless.
 */
export function applyStyle(element: HTMLElement, style: CSSProperties | undefined): void {
  if (!element || !style) {
    return;
  }
  const elementStyle = element.style as unknown as Record<string, string>;

  for (const key in style) {
    const value = style[key];
    if (Number.isFinite(value) && !unitlessNumber.test(key)) {
      elementStyle[key] = `${value}px`;
    } else {
      elementStyle[key] = String(value);
    }
  }
}
