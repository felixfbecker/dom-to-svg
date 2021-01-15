import { isElement, isTextNode } from './dom'
import { handleElement } from './element'
import { handleTextNode } from './text'
import { StackingLayers } from './stacking'

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

	/**
	 * Whether to use text selection to fill tspans or use textContent (different whitespace handling).
	 * textContent works in mobile iOS browsers
	 *
	 * @default false
	 */
	avoidTextSelection?: boolean
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
		handleElement(node, context)
	} else if (isTextNode(node)) {
		handleTextNode(node, context)
	}
}
