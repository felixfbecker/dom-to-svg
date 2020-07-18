export const svgNamespace = 'http://www.w3.org/2000/svg'
export const xhtmlNamespace = 'http://www.w3.org/1999/xhtml'

export const isElement = (node: Node): node is Element => node.nodeType === Node.ELEMENT_NODE
export const isHTMLElement = (element: Element): element is HTMLElement => element.namespaceURI === xhtmlNamespace
export const isSVGElement = (element: Element): element is SVGElement => element.namespaceURI === svgNamespace
export const isTextNode = (node: Node): node is Text => node.nodeType === Node.TEXT_NODE
export const isCommentNode = (node: Node): node is Comment => node.nodeType === Node.COMMENT_NODE

export const isHTMLAnchorElement = (element: Element): element is HTMLAnchorElement =>
	element.tagName === 'A' && isHTMLElement(element)
export const isHTMLLabelElement = (element: Element): element is HTMLLabelElement =>
	element.tagName === 'LABEL' && isHTMLElement(element)
export const isHTMLImageElement = (element: Element): element is HTMLImageElement =>
	element.tagName === 'IMG' && isHTMLElement(element)
export const isSVGImageElement = (element: Element): element is SVGImageElement =>
	element.tagName === 'image' && isSVGElement(element)
export const isSVGStyleElement = (element: Element): element is SVGStyleElement =>
	element.tagName === 'style' && isSVGElement(element)
export const hasLabels = (element: HTMLElement): element is HTMLElement & Pick<HTMLInputElement, 'labels'> =>
	'labels' in element

export function* traverseDOM(node: Node, shouldEnter: (node: Node) => boolean = () => true): Iterable<Node> {
	yield node
	if (shouldEnter(node)) {
		for (const childNode of node.childNodes) {
			yield* traverseDOM(childNode)
		}
	}
}
