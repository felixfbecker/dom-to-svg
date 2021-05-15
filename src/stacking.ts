import { isInFlow, isInline, isPositioned } from './css.js'
import { svgNamespace } from './dom.js'

declare global {
	interface CSSStyleDeclaration {
		// @font-face
		src: string

		mixBlendMode: string
		maskBorder: string
		isolation: string
		webkitOverflowScrolling: string
		contain: string
		displayOutside: string
		displayInside: string
	}
}

const stackingContextEstablishingProperties = new Set<string>([
	'clipPath',
	'contain',
	'filter',
	'isolation',
	'mask',
	'maskBorder',
	'maskImage',
	'mixBlendMode',
	'opacity',
	'perspective',
	'position',
	'transform',
	'webkitOverflowScrolling',
	'zIndex',
])

export function establishesStackingContext(
	styles: CSSStyleDeclaration,
	parentStyles: CSSStyleDeclaration | null
): boolean {
	// https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_Positioning/Understanding_z_index/The_stacking_context
	return !!(
		((styles.position === 'absolute' || styles.position === 'relative') && styles.zIndex !== 'auto') ||
		styles.position === 'fixed' ||
		styles.position === 'sticky' ||
		(parentStyles &&
			(parentStyles.display === 'flex' || parentStyles.display === 'grid') &&
			styles.zIndex !== 'auto') ||
		parseFloat(styles.opacity) !== 1 ||
		styles.mixBlendMode !== 'normal' ||
		styles.transform !== 'none' ||
		styles.filter !== 'none' ||
		styles.perspective !== 'none' ||
		styles.clipPath !== 'none' ||
		styles.mask !== 'none' ||
		styles.maskImage !== 'none' ||
		styles.maskBorder !== 'none' ||
		styles.isolation === 'isolate' ||
		styles.webkitOverflowScrolling === 'touch' ||
		styles.contain === 'layout' ||
		styles.contain === 'paint' ||
		styles.contain === 'strict' ||
		styles.contain === 'content' ||
		styles.willChange.split(',').some(property => stackingContextEstablishingProperties.has(property.trim()))
	)
}

export interface StackingLayers {
	/** 1. The background and borders of the element forming the stacking context. */
	readonly rootBackgroundAndBorders: SVGGElement

	/** 2. The child stacking contexts with negative stack levels (most negative first). */
	readonly childStackingContextsWithNegativeStackLevels: SVGGElement

	/** 3. The in-flow, non-inline-level, non-positioned descendants. */
	readonly inFlowNonInlineNonPositionedDescendants: SVGGElement

	/** 4. The non-positioned floats. */
	readonly nonPositionedFloats: SVGGElement

	/** 5. The in-flow, inline-level, non-positioned descendants, including inline tables and inline blocks. */
	readonly inFlowInlineLevelNonPositionedDescendants: SVGGElement

	/** 6. The child stacking contexts with stack level 0 and the positioned descendants with stack level 0. */
	readonly childStackingContextsWithStackLevelZeroAndPositionedDescendantsWithStackLevelZero: SVGGElement

	/** 7. The child stacking contexts with positive stack levels (least positive first). */
	readonly childStackingContextsWithPositiveStackLevels: SVGGElement
}

const STACKING_LAYER_NAMES: readonly (keyof StackingLayers)[] = [
	'rootBackgroundAndBorders',
	'childStackingContextsWithNegativeStackLevels',
	'inFlowNonInlineNonPositionedDescendants',
	'nonPositionedFloats',
	'inFlowInlineLevelNonPositionedDescendants',
	'childStackingContextsWithStackLevelZeroAndPositionedDescendantsWithStackLevelZero',
	'childStackingContextsWithPositiveStackLevels',
]

function createStackingLayer(parent: SVGElement, layerName: keyof StackingLayers): SVGGElement {
	const layer = parent.ownerDocument.createElementNS(svgNamespace, 'g')
	layer.dataset.stackingLayer = layerName
	parent.append(layer)
	return layer
}

export function createStackingLayers(container: SVGElement): StackingLayers {
	container.dataset.stackingContext = 'true'
	return {
		rootBackgroundAndBorders: createStackingLayer(container, 'rootBackgroundAndBorders'),
		childStackingContextsWithNegativeStackLevels: createStackingLayer(
			container,
			'childStackingContextsWithNegativeStackLevels'
		),
		inFlowNonInlineNonPositionedDescendants: createStackingLayer(
			container,
			'inFlowNonInlineNonPositionedDescendants'
		),
		nonPositionedFloats: createStackingLayer(container, 'nonPositionedFloats'),
		inFlowInlineLevelNonPositionedDescendants: createStackingLayer(
			container,
			'inFlowInlineLevelNonPositionedDescendants'
		),
		childStackingContextsWithStackLevelZeroAndPositionedDescendantsWithStackLevelZero: createStackingLayer(
			container,
			'childStackingContextsWithStackLevelZeroAndPositionedDescendantsWithStackLevelZero'
		),
		childStackingContextsWithPositiveStackLevels: createStackingLayer(
			container,
			'childStackingContextsWithPositiveStackLevels'
		),
	}
}

export function determineStackingLayer(
	styles: CSSStyleDeclaration,
	parentStyles: CSSStyleDeclaration | null
): keyof StackingLayers | undefined {
	// https://www.w3.org/TR/CSS22/visuren.html#layers
	// https://www.w3.org/TR/CSS22/zindex.html

	// Note: the root element is not handled here, but in handleElement().
	const zIndex = styles.zIndex !== 'auto' ? parseInt(styles.zIndex, 10) : undefined
	if (zIndex !== undefined && zIndex < 0 && establishesStackingContext(styles, parentStyles)) {
		return 'childStackingContextsWithNegativeStackLevels'
	}
	if (isInFlow(styles) && !isInline(styles) && !isPositioned(styles)) {
		return 'inFlowNonInlineNonPositionedDescendants'
	}
	if (!isPositioned(styles) && styles.float !== 'none') {
		return 'nonPositionedFloats'
	}
	if (isInFlow(styles) && isInline(styles) && !isPositioned(styles)) {
		return 'inFlowInlineLevelNonPositionedDescendants'
	}
	if (zIndex === 0 && (isPositioned(styles) || establishesStackingContext(styles, parentStyles))) {
		return 'childStackingContextsWithStackLevelZeroAndPositionedDescendantsWithStackLevelZero'
	}
	if (zIndex !== undefined && zIndex > 0 && establishesStackingContext(styles, parentStyles)) {
		return 'childStackingContextsWithPositiveStackLevels'
	}
	return undefined
}

export function sortChildrenByZIndex(parent: SVGElement): void {
	const sorted = [...parent.children].sort((a, b) => {
		const zIndexA = (a as SVGElement).dataset.zIndex
		const zIndexB = (b as SVGElement).dataset.zIndex
		if (!zIndexA || !zIndexB) {
			// E.g. a <clipPath>
			return 0
		}
		return parseInt(zIndexA, 10) - parseInt(zIndexB, 10)
	})
	for (const child of sorted) {
		parent.append(child)
	}
}

export function sortStackingLayerChildren(stackingLayers: StackingLayers): void {
	sortChildrenByZIndex(stackingLayers.childStackingContextsWithNegativeStackLevels)
	sortChildrenByZIndex(stackingLayers.childStackingContextsWithPositiveStackLevels)
}

/**
 * Removes all stacking layers that are empty.
 */
export function cleanupStackingLayerChildren(stackingLayers: StackingLayers): void {
	for (const name of STACKING_LAYER_NAMES) {
		const layer = stackingLayers[name]
		if (!layer.hasChildNodes()) {
			layer.remove()
		}
	}
}
