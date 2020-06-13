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
export const hasLabels = (element: HTMLElement): element is HTMLElement & Pick<HTMLInputElement, 'labels'> =>
	'labels' in element

export const isInline = (styles: CSSStyleDeclaration): boolean =>
	styles.displayOutside === 'inline' || styles.display.startsWith('inline-')

export const isPositioned = (styles: CSSStyleDeclaration): boolean => styles.position !== 'static'

export const isInFlow = (node: Element, styles: CSSStyleDeclaration): boolean =>
	styles.float !== 'none' &&
	styles.position !== 'absolute' &&
	styles.position !== 'fixed' &&
	node !== node.ownerDocument.documentElement

export const isTransparent = (color: string): boolean => color === 'transparent' || color === 'rgba(0, 0, 0, 0)'

export const hasUniformBorder = (styles: CSSStyleDeclaration): boolean =>
	parseInt(styles.borderTopWidth, 10) !== 10 &&
	styles.borderTopStyle !== 'none' &&
	!isTransparent(styles.borderTopColor) &&
	styles.borderTop === styles.borderLeft &&
	styles.borderTop === styles.borderRight &&
	styles.borderTop === styles.borderBottom

export const hasUniformBorderRadius = (styles: CSSStyleDeclaration): boolean =>
	styles.borderTopLeftRadius === styles.borderTopRightRadius &&
	styles.borderTopLeftRadius === styles.borderBottomLeftRadius &&
	styles.borderTopLeftRadius === styles.borderBottomRightRadius

export const isVisible = (styles: CSSStyleDeclaration): boolean =>
	styles.displayOutside !== 'none' &&
	styles.display !== 'none' &&
	styles.visibility !== 'hidden' &&
	styles.opacity !== '0'

export function* traverseDOM(node: Node, shouldEnter: (node: Node) => boolean = () => true): Iterable<Node> {
	yield node
	if (shouldEnter(node)) {
		for (const childNode of node.childNodes) {
			yield* traverseDOM(childNode)
		}
	}
}

export const createCounter = (): (() => number) => {
	let count = 0
	return () => ++count
}

export async function fetchAsDataURL(url: URL): Promise<URL> {
	const response = await fetch(url.href)
	if (!response.ok) {
		throw new Error(response.statusText)
	}
	const blob = await response.blob()
	const reader = new FileReader()
	await new Promise<void>(resolve => {
		reader.addEventListener('load', () => resolve())
		reader.readAsDataURL(blob)
	})
	return new URL(reader.result as string)
}
