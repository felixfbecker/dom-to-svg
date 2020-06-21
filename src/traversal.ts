import { isElement, isTextNode } from './dom'
import { handleElement } from './element'
import { handleTextNode } from './text'
import { StackingLayers } from './stacking'

export interface TraversalContext {
	readonly currentSvgParent: SVGElement
	readonly parentStackingLayer: SVGElement
	readonly stackingLayers: StackingLayers
	readonly labels: Map<HTMLLabelElement, string>
	readonly getUniqueId: () => number
}

export function walkNode(node: Node, context: TraversalContext): void {
	if (isElement(node)) {
		handleElement(node, context)
	} else if (isTextNode(node)) {
		handleTextNode(node, context)
	}
}
