import cssValueParser from 'postcss-value-parser'

import { parseCSSLength } from './css.js'
import {
	isElement,
	isSVGAnchorElement,
	isSVGElement,
	isSVGGraphicsElement,
	isSVGSVGElement,
	isSVGTextContentElement,
	isTextNode,
	svgNamespace,
} from './dom.js'
import { copyTextStyles } from './text.js'
import { TraversalContext } from './traversal.js'
import { assert, diagonale } from './util.js'

/**
 * Recursively clone an `<svg>` element, inlining it into the output SVG document with the necessary transforms.
 */
export function handleSvgNode(node: Node, context: SvgTraversalContext): void {
	if (isElement(node)) {
		if (!isSVGElement(node)) {
			return
		}
		handleSvgElement(node, context)
	} else if (isTextNode(node)) {
		const clonedTextNode = node.cloneNode(true) as Text
		context.currentSvgParent.append(clonedTextNode)
	}
}

const ignoredElements = new Set(['script', 'style', 'foreignElement'])

interface SvgTraversalContext extends Pick<TraversalContext, 'svgDocument' | 'currentSvgParent' | 'options'> {
	/**
	 * A prefix to use for all ID to make them unique inside the output SVG document.
	 */
	readonly idPrefix: string
}

const URL_ID_REFERENCE_REGEX = /\burl\(["']?#/
export function handleSvgElement(element: SVGElement, context: SvgTraversalContext): void {
	if (ignoredElements.has(element.tagName)) {
		return
	}

	let elementToAppend: SVGElement
	if (isSVGSVGElement(element)) {
		const contentContainer = context.svgDocument.createElementNS(svgNamespace, 'g')
		elementToAppend = contentContainer
		contentContainer.classList.add('svg-content', ...element.classList)
		contentContainer.dataset.viewBox = element.getAttribute('viewBox') ?? ''
		contentContainer.dataset.width = element.getAttribute('width') ?? ''
		contentContainer.dataset.height = element.getAttribute('height') ?? ''

		// Since the SVG is getting inlined into the output SVG, we need to transform its contents according to its
		// viewBox, width, height and preserveAspectRatio. We can use getScreenCTM() for this on one of its
		// SVGGraphicsElement children (in Chrome calling it on the <svg> works too, but not in Firefox:
		// https://bugzilla.mozilla.org/show_bug.cgi?id=873106).
		for (const child of element.children) {
			if (!isSVGGraphicsElement(child)) {
				continue
			}

			let viewBoxTransformMatrix =
				// When this function is called on an inline <svg> element in the original DOM, we want
				// getScreenCTM() to map it to the DOM coordinate system. When this function is called from
				// inlineResources() the <svg> is already embedded into the output <svg>. In that case the output
				// SVG already has a viewBox, and the coordinate system of the SVG is not equal to the coordinate
				// system of the screen, therefor we need to use getCTM() to map it into the output SVG's
				// coordinate system.
				child.ownerDocument !== context.svgDocument &&
				// When we inline an SVG, we put a transform on it for the getScreenCTM(). When that SVG also
				// contains another SVG, the inner SVG should just get transformed relative to the outer SVG, not
				// relative to the screen, because the transforms will stack in the output SVG.
				!element.parentElement?.closest('svg')
					? child.getScreenCTM()
					: child.getCTM()

			// This should only be null if the <svg> is `display: none`
			if (!viewBoxTransformMatrix) {
				break
			}

			// Make sure to handle a child that already has a transform. That transform should only apply to the
			// child, not to the entire SVG contents, so we need to calculate it out.
			if (child.transform.baseVal.numberOfItems > 0) {
				child.transform.baseVal.consolidate()
				const existingTransform = child.transform.baseVal.getItem(0).matrix
				viewBoxTransformMatrix = viewBoxTransformMatrix.multiply(existingTransform.inverse())
			}

			contentContainer.transform.baseVal.appendItem(
				contentContainer.transform.baseVal.createSVGTransformFromMatrix(viewBoxTransformMatrix)
			)
			break
		}
	} else {
		// Clone element
		if (isSVGAnchorElement(element) && !context.options.keepLinks) {
			elementToAppend = context.svgDocument.createElementNS(svgNamespace, 'g')
		} else {
			elementToAppend = element.cloneNode(false) as SVGElement
		}

		// Remove event handlers
		for (const attribute of elementToAppend.attributes) {
			if (attribute.localName.startsWith('on')) {
				elementToAppend.attributes.removeNamedItemNS(attribute.namespaceURI, attribute.localName)
			} else if (attribute.localName === 'href' && attribute.value.startsWith('javascript:')) {
				elementToAppend.attributes.removeNamedItemNS(attribute.namespaceURI, attribute.localName)
			}
		}

		const window = element.ownerDocument.defaultView
		assert(window, "Element's ownerDocument has no defaultView")

		const svgViewportElement = element.ownerSVGElement
		assert(svgViewportElement, 'Expected element to have ownerSVGElement')

		const styles = window.getComputedStyle(element)

		if (isSVGGraphicsElement(element)) {
			copyGraphicalPresentationAttributes(styles, elementToAppend, svgViewportElement.viewBox.animVal)

			if (isSVGTextContentElement(element)) {
				copyTextStyles(styles, elementToAppend)
			}
		}

		// Namespace ID references url(#...)
		for (const attribute of elementToAppend.attributes) {
			if (attribute.localName === 'href') {
				if (attribute.value.startsWith('#')) {
					attribute.value = attribute.value.replace('#', `#${context.idPrefix}`)
				}
			} else if (URL_ID_REFERENCE_REGEX.test(attribute.value)) {
				attribute.value = rewriteUrlIdReferences(attribute.value, context)
			}
		}
		for (const property of elementToAppend.style) {
			const value = elementToAppend.style.getPropertyValue(property)
			if (URL_ID_REFERENCE_REGEX.test(value)) {
				elementToAppend.style.setProperty(
					property,
					rewriteUrlIdReferences(value, context),
					elementToAppend.style.getPropertyPriority(property)
				)
			}
		}
	}

	// Make sure all IDs are unique
	if (elementToAppend.id) {
		elementToAppend.id = context.idPrefix + elementToAppend.id
	}

	context.currentSvgParent.append(elementToAppend)
	for (const child of element.childNodes) {
		handleSvgNode(child, { ...context, currentSvgParent: elementToAppend })
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
	// 'cursor',
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
	'clip-rule': 'nonzero',
	'color-interpolation-filters': 'linearrgb',
	'color-interpolation': 'srgb',
	'color-rendering': 'auto',
	'fill-opacity': '1',
	'fill-rule': 'nonzero',
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
	direction: 'ltr',
	fill: '',
	filter: 'none',
	mask: 'none',
	opacity: '1',
	stroke: '',
	transform: 'none',
	visibility: 'visible',
}

/**
 * Prefixes all ID references of the form `url(#id)` in the given string.
 */
function rewriteUrlIdReferences(value: string, { idPrefix }: Pick<SvgTraversalContext, 'idPrefix'>): string {
	const parsedValue = cssValueParser(value)
	parsedValue.walk(node => {
		if (node.type !== 'function' || node.value !== 'url') {
			return
		}
		const urlArgument = node.nodes[0]
		if (!urlArgument) {
			return
		}
		urlArgument.value = urlArgument.value.replace('#', `#${idPrefix}`)
	})
	return cssValueParser.stringify(parsedValue.nodes)
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
