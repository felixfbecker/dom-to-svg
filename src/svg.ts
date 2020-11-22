import { isSVGGraphicsElement, isSVGSVGElement, isSVGTextContentElement, svgNamespace } from './dom'
import { TraversalContext } from './traversal'
import { assert, diagonale } from './util'
import { parseCSSLength } from './css'
import { copyTextStyles } from './text'

const ignoredElements = new Set(['script', 'style', 'foreignElement'])

/**
 * Recursively clone an `<svg>` element, inlining it into the output SVG document with the necessary transforms.
 */
export function handleSvgElement(element: SVGElement, context: TraversalContext): void {
	if (ignoredElements.has(element.tagName)) {
		return
	}
	let elementToAppend: SVGElement | undefined
	if (isSVGSVGElement(element)) {
		elementToAppend = context.svgDocument.createElementNS(svgNamespace, 'g')
		elementToAppend.classList.add('svg-content')
		elementToAppend.classList.add(...element.classList)
		elementToAppend.dataset.viewBox = element.getAttribute('viewBox')!
		elementToAppend.dataset.width = element.getAttribute('width')!
		elementToAppend.dataset.height = element.getAttribute('height')!

		// Apply a transform that simulates the scaling defined by the viewBox, width, height and preserveAspectRatio
		const transformMatrix = DOMMatrixReadOnly.fromMatrix(element.getScreenCTM()!)
		elementToAppend.setAttribute('transform', DOMMatrix.fromMatrix(transformMatrix).toString())
	} else {
		// Clone element
		elementToAppend = element.cloneNode(false) as SVGElement

		// Prevent ID conflicts
		if (element.id) {
			elementToAppend.id = element.id
		}

		const window = element.ownerDocument.defaultView
		assert(window, "Element's ownerDocument has no defaultView")

		const svgViewportElement = element.ownerSVGElement
		assert(svgViewportElement, 'Expected element to have ownerSVGElement')

		const styles = window.getComputedStyle(element)

		if (isSVGGraphicsElement(element)) {
			copyGraphicalPresentationAttributes(styles, elementToAppend, svgViewportElement.viewBox.animVal)
		} else if (isSVGTextContentElement(element)) {
			copyTextStyles(styles, elementToAppend)
		}
	}

	if (elementToAppend) {
		context.currentSvgParent.append(elementToAppend)
		for (const child of element.children) {
			handleSvgElement(child as SVGElement, { ...context, currentSvgParent: elementToAppend })
		}
	}
}

const graphicalPresentationAttributes = [
	'alignment-baseline',
	'baseline-shift',
	// 'clip',
	'clip-path',
	'clip-rule',
	'color',
	'color-interpolation',
	'color-interpolation-filters',
	'color-profile',
	'color-rendering',
	'cursor',
	'direction',
	// 'display',
	'enable-background',
	'fill',
	'fill-opacity',
	'fill-rule',
	'filter',
	'flood-color',
	'flood-opacity',
	'glyph-orientation-horizontal',
	'glyph-orientation-vertical',
	'image-rendering',
	'kerning',
	'lighting-color',
	'marker-end',
	'marker-mid',
	'marker-start',
	'mask',
	'opacity',
	// 'overflow',
	'pointer-events',
	'shape-rendering',
	'solid-color',
	'solid-opacity',
	'stop-color',
	'stop-opacity',
	'stroke',
	'stroke-dasharray',
	'stroke-dashoffset',
	'stroke-linecap',
	'stroke-linejoin',
	'stroke-miterlimit',
	'stroke-opacity',
	'stroke-width',
	'transform',
	'vector-effect',
	'visibility',
] as const

function copyGraphicalPresentationAttributes(
	styles: CSSStyleDeclaration,
	target: SVGElement,
	viewBox: DOMRectReadOnly
): void {
	for (const attribute of graphicalPresentationAttributes) {
		let value: string | number = styles.getPropertyValue(attribute)
		if (value && value !== 'none') {
			if (value.endsWith('%')) {
				// E.g. https://svgwg.org/svg2-draft/painting.html#StrokeWidth
				// Percentages:	refer to the normalized diagonal of the current SVG viewport (see Units)
				value = parseCSSLength(value, diagonale(viewBox)) ?? 0
			}
			target.setAttribute(attribute, value.toString())
		}
	}
}
