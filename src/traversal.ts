import { isElement, isHTMLElement, isSVGElement, isTextNode } from './dom'
import { handleHTMLElement } from './element'
import { handleTextNode } from './text'
import { StackingLayers } from './stacking'
import { handleSvgElement } from './svg'

export interface DomToSvgOptions {
	/**
	 * To visual area to contrain the SVG too.
	 * Elements that do not intersect the capture area are not included in the SVG.
	 */
	captureArea?: DOMRectReadOnly

	/**
	 * Whether to include `<a>` tags in the SVG so links are still interactive.
	 *
	 * @default true
	 */
	keepLinks?: boolean
}

export interface TraversalContext {
	readonly svgDocument: XMLDocument
	readonly currentSvgParent: SVGElement
	readonly parentStackingLayer: SVGGElement
	readonly stackingLayers: StackingLayers
	readonly labels: Map<HTMLLabelElement, string>
	readonly getUniqueId: (prefix: string) => string
	readonly options: Required<DomToSvgOptions>
}

export function walkNode(node: Node, context: TraversalContext): void {
	if (isElement(node)) {
		if (isHTMLElement(node)) {
			handleHTMLElement(node, context)
		} else if (isSVGElement(node)) {
			handleSvgElement(node, context)
		}
	} else if (isTextNode(node)) {
		handleTextNode(node, context)
	}
}
