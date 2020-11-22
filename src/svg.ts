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
	// 'color-profile',
	'color-rendering',
	'cursor',
	'direction',
	// 'display',
	// 'enable-background',
	'fill',
	'fill-opacity',
	'fill-rule',
	'filter',
	'flood-color',
	'flood-opacity',
	'image-rendering',
	'lighting-color',
	'marker-end',
	'marker-mid',
	'marker-start',
	'mask',
	'opacity',
	// 'overflow',
	'pointer-events',
	'shape-rendering',
	// 'solid-color',
	// 'solid-opacity',
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

const defaults: Record<typeof graphicalPresentationAttributes[number], string> = {
	'alignment-baseline': 'auto',
	'baseline-shift': '0px',
	'clip-path': 'none',
	'clip-rule': 'non-zero',
	'color-interpolation-filters': 'linearrgb',
	'color-interpolation': 'srgb',
	'color-rendering': 'auto',
	'fill-opacity': '1',
	'fill-rule': 'non-zero',
	'flood-color': 'rgb(0, 0, 0)',
	'flood-opacity': '1',
	'image-rendering': 'auto',
	'lighting-color': 'rgb(255, 255, 255)',
	'marker-end': 'none',
	'marker-mid': 'none',
	'marker-start': 'none',
	'pointer-events': 'auto',
	'shape-rendering': 'auto',
	'stop-color': 'rgb(0, 0, 0)',
	'stop-opacity': '1',
	'stroke-dasharray': 'none',
	'stroke-dashoffset': '0px',
	'stroke-linecap': 'butt',
	'stroke-linejoin': 'miter',
	'stroke-miterlimit': '4',
	'stroke-opacity': '1',
	'stroke-width': '1px',
	'vector-effect': 'none',
	color: '',
	cursor: 'default',
	direction: 'ltr',
	fill: '',
	filter: 'none',
	mask: 'none',
	opacity: '1',
	stroke: '',
	transform: 'none',
	visibility: 'visible',
}

function copyGraphicalPresentationAttributes(
	styles: CSSStyleDeclaration,
	target: SVGElement,
	viewBox: DOMRectReadOnly
): void {
	for (const attribute of graphicalPresentationAttributes) {
		let value: string | number = styles.getPropertyValue(attribute)
		if (value && value !== defaults[attribute]) {
			if (value.endsWith('%')) {
				// E.g. https://svgwg.org/svg2-draft/painting.html#StrokeWidth
				// Percentages:	refer to the normalized diagonal of the current SVG viewport (see Units)
				value = parseCSSLength(value, diagonale(viewBox)) ?? 0
			}
			target.setAttribute(attribute, value.toString())
		}
	}
}
