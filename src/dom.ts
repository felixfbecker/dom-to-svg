// Namespaces
export const svgNamespace = 'http://www.w3.org/2000/svg'
export const xlinkNamespace = 'http://www.w3.org/1999/xlink'
export const xhtmlNamespace = 'http://www.w3.org/1999/xhtml'

// DOM
export const isElement = (node: Node): node is Element => node.nodeType === Node.ELEMENT_NODE
export const isTextNode = (node: Node): node is Text => node.nodeType === Node.TEXT_NODE
export const isCommentNode = (node: Node): node is Comment => node.nodeType === Node.COMMENT_NODE

// SVG
export const isSVGElement = (element: Element): element is SVGElement => element.namespaceURI === svgNamespace
export const isSVGSVGElement = (element: Element): element is SVGSVGElement =>
	isSVGElement(element) && element.tagName === 'svg'
export const isSVGGraphicsElement = (element: Element): element is SVGGraphicsElement =>
	isSVGElement(element) && 'getCTM' in element && 'getScreenCTM' in element
export const isSVGGroupElement = (element: Element): element is SVGGElement =>
	isSVGElement(element) && element.tagName === 'g'
export const isSVGAnchorElement = (element: Element): element is SVGAElement =>
	isSVGElement(element) && element.tagName === 'a'
export const isSVGTextContentElement = (element: Element): element is SVGTextContentElement =>
	isSVGElement(element) && 'textLength' in element
export const isSVGImageElement = (element: Element): element is SVGImageElement =>
	element.tagName === 'image' && isSVGElement(element)
export const isSVGStyleElement = (element: Element): element is SVGStyleElement =>
	element.tagName === 'style' && isSVGElement(element)

// HTML
export const isHTMLElement = (element: Element): element is HTMLElement => element.namespaceURI === xhtmlNamespace
export const isHTMLAnchorElement = (element: Element): element is HTMLAnchorElement =>
	element.tagName === 'A' && isHTMLElement(element)
export const isHTMLLabelElement = (element: Element): element is HTMLLabelElement =>
	element.tagName === 'LABEL' && isHTMLElement(element)
export const isHTMLImageElement = (element: Element): element is HTMLImageElement =>
	element.tagName === 'IMG' && isHTMLElement(element)
export const isHTMLInputElement = (element: Element): element is HTMLInputElement =>
	element.tagName === 'INPUT' && isHTMLElement(element)
export const isHTMLSlotElement = (element: Element): element is HTMLSlotElement =>
	element.tagName === 'SLOT' && isHTMLElement(element)
export const hasLabels = (element: HTMLElement): element is HTMLElement & Pick<HTMLInputElement, 'labels'> =>
	'labels' in element
export const hasOpenShadowRoot = (
	element: Element
): element is Omit<Element, 'shadowRoot'> & { shadowRoot: NonNullable<Element['shadowRoot']> } =>
	element.shadowRoot !== null && element.shadowRoot.mode === 'open'

export const getRelativeChildNodes = (node: Node, useShadowRoot = true): NodeListOf<ChildNode> | Node[] => {
	if (useShadowRoot && isElement(node)) {
		if (isHTMLSlotElement(node)) {
			return node.assignedNodes()
		}

		if (hasOpenShadowRoot(node)) {
			return node.shadowRoot.childNodes
		}
	}
	return node.childNodes
}

export const getRelativeParent = (node: Node): HTMLElement | null => {
	if (node.parentElement !== null) {
		return node.parentElement
	}

	const parentNode = node.parentNode
	if (parentNode instanceof ShadowRoot) {
		if (isElement(parentNode.host) && isHTMLElement(parentNode.host)) {
			return parentNode.host
		}
	}

	return null
}

export function* traverseDOM(
	node: Node,
	shouldEnter: (node: Node) => boolean = () => true,
	useShadowRoot = false
): Iterable<Node> {
	yield node
	if (shouldEnter(node)) {
		for (const childNode of getRelativeChildNodes(node, useShadowRoot)) {
			yield* traverseDOM(childNode)
		}
	}
}
