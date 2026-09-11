/** Read the allocated content width alongside the surface's controller measurement. */
export function measureSurfaceWidth(element: HTMLElement | undefined): number | undefined {
  if (!element || element.clientWidth <= 0) return undefined;
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  const padding = style
    ? (Number.parseFloat(style.paddingLeft) || 0) + (Number.parseFloat(style.paddingRight) || 0)
    : 0;
  return Math.max(1, element.clientWidth - padding);
}
