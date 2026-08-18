type RealmConstructorName =
  | "Element"
  | "HTMLDialogElement"
  | "HTMLElement"
  | "HTMLImageElement"
  | "HTMLInputElement"
  | "SVGElement";

function constructorFor<TConstructor extends abstract new (...args: never[]) => object>(
  value: unknown,
  name: RealmConstructorName,
): TConstructor | undefined {
  if (typeof value !== "object" || value === null || !("ownerDocument" in value)) return undefined;
  const view = (value as Node).ownerDocument?.defaultView;
  const constructor = (
    view as unknown as Partial<Record<RealmConstructorName, unknown>> | undefined
  )?.[name];
  return typeof constructor === "function" ? (constructor as TConstructor) : undefined;
}

function isElementNode(value: unknown): value is Element {
  return (
    typeof value === "object" &&
    value !== null &&
    "nodeType" in value &&
    value.nodeType === 1 &&
    "ownerDocument" in value &&
    "localName" in value &&
    typeof value.localName === "string"
  );
}

function isHtmlElementName(value: unknown, localName?: string): value is HTMLElement {
  return (
    isElementNode(value) &&
    value.namespaceURI === "http://www.w3.org/1999/xhtml" &&
    (localName === undefined || value.localName === localName)
  );
}

/** Realm-aware DOM predicates for nodes created in iframes or adopted documents. */
export function isElement(value: unknown): value is Element {
  const ElementConstructor = constructorFor<typeof Element>(value, "Element");
  return (
    (ElementConstructor !== undefined && value instanceof ElementConstructor) ||
    isElementNode(value)
  );
}

export function isHTMLElement(value: unknown): value is HTMLElement {
  const HTMLElementConstructor = constructorFor<typeof HTMLElement>(value, "HTMLElement");
  return (
    (HTMLElementConstructor !== undefined && value instanceof HTMLElementConstructor) ||
    isHtmlElementName(value)
  );
}

export function isHTMLDialogElement(value: unknown): value is HTMLDialogElement {
  const DialogConstructor = constructorFor<typeof HTMLDialogElement>(value, "HTMLDialogElement");
  return (
    (DialogConstructor !== undefined && value instanceof DialogConstructor) ||
    isHtmlElementName(value, "dialog")
  );
}

export function isHTMLImageElement(value: unknown): value is HTMLImageElement {
  const ImageConstructor = constructorFor<typeof HTMLImageElement>(value, "HTMLImageElement");
  return (
    (ImageConstructor !== undefined && value instanceof ImageConstructor) ||
    isHtmlElementName(value, "img")
  );
}

export function isHTMLInputElement(value: unknown): value is HTMLInputElement {
  const InputConstructor = constructorFor<typeof HTMLInputElement>(value, "HTMLInputElement");
  return (
    (InputConstructor !== undefined && value instanceof InputConstructor) ||
    isHtmlElementName(value, "input")
  );
}

export function isSVGElement(value: unknown): value is SVGElement {
  const SVGConstructor = constructorFor<typeof SVGElement>(value, "SVGElement");
  return (
    (SVGConstructor !== undefined && value instanceof SVGConstructor) ||
    (isElementNode(value) && value.namespaceURI === "http://www.w3.org/2000/svg")
  );
}
