import {
	svgNamespace,
	isTransparent,
	hasUniformBorder,
	hasUniformBorderRadius,
	isHTMLAnchorElement,
	isHTMLImageElement,
	isVisible,
	isHTMLElement,
	hasLabels,
	isHTMLLabelElement,
} from './common.js'
import { getAccessibilityAttributes } from './accessibility.js'
import { TraversalContext, walkNode } from './traversal'
import {
	createStackingLayers,
	establishesStackingContext,
	determineStackingLayer,
	StackingLayers,
	sortStackingLayerChildren,
} from './stacking.js'

export function handleElement(
	element: Element,
	{ currentSvgParent, parentStackingLayer, stackingLayers, labels, getUniqueId }: Readonly<TraversalContext>
): void {
	if (!element.ownerDocument.defaultView) {
		throw new Error("Element's ownerDocument has no defaultView")
	}
	const bounds = element.getBoundingClientRect() // Includes borders
	const styles = element.ownerDocument.defaultView.getComputedStyle(element)

	const svgContainer = isHTMLAnchorElement(element)
		? createSvgAnchor(element)
		: document.createElementNS(svgNamespace, 'g')

	// Add IDs, classes, debug info
	svgContainer.dataset.tag = element.tagName.toLowerCase()
	svgContainer.id = element.id || (element.classList[0] || element.tagName.toLowerCase()) + getUniqueId()
	const className = element.getAttribute('class')
	if (className) {
		svgContainer.setAttribute('class', className)
	}

	// Which parent should the container itself be appended to?
	const stackingLayer =
		stackingLayers[
			establishesStackingContext(element) ? 'rootBackgroundAndBorders' : determineStackingLayer(element)
		]
	if (stackingLayer) {
		currentSvgParent.setAttribute(
			'aria-owns',
			[currentSvgParent.getAttribute('aria-owns'), svgContainer.id].filter(Boolean).join(' ')
		)
	}
	// If the parent is within the same stacking layer, append to the parent.
	// Otherwise append to the right stacking layer.
	const elementToAppendTo = parentStackingLayer === stackingLayer ? currentSvgParent : stackingLayer
	svgContainer.dataset.zIndex = styles.zIndex // Used for sorting
	elementToAppendTo.append(svgContainer)

	// If the element establishes a stacking context, create subgroups for each stacking layer.
	let childContext: TraversalContext
	let backgroundContainer: SVGElement
	let ownStackingLayers: StackingLayers | undefined
	if (establishesStackingContext(element)) {
		ownStackingLayers = createStackingLayers(svgContainer)
		backgroundContainer = ownStackingLayers.rootBackgroundAndBorders
		childContext = {
			currentSvgParent: svgContainer,
			parentStackingLayer: stackingLayer,
			stackingLayers,
			labels,
			getUniqueId,
		}
	} else {
		backgroundContainer = svgContainer
		childContext = {
			currentSvgParent: svgContainer,
			parentStackingLayer: stackingLayer,
			stackingLayers,
			labels,
			getUniqueId,
		}
	}

	// Accessibility
	for (const [name, value] of getAccessibilityAttributes(element, { labels, getUniqueId })) {
		svgContainer.setAttribute(name, value)
	}

	addBackgroundAndBorders(styles, bounds, backgroundContainer)

	// If element is overflow: hidden, create a clipping rectangle to hide any overflowing content of any descendants
	let clipPath: SVGClipPathElement | undefined
	if (styles.overflow !== 'visible') {
		clipPath = document.createElementNS(svgNamespace, 'clipPath')
		clipPath.id = 'clipPath' + getUniqueId()
		clipPath.append(createBox(bounds))
		svgContainer.before(clipPath)
		svgContainer.setAttribute('clip-path', `url(#${clipPath.id})`)
	}

	if (isHTMLImageElement(element)) {
		const svgImage = document.createElementNS(svgNamespace, 'image')
		// TODO inline resource as Base64 data URI
		svgImage.setAttribute('href', element.src)
		svgImage.setAttribute('x', bounds.x.toString())
		svgImage.setAttribute('y', bounds.y.toString())
		svgImage.setAttribute('width', bounds.width.toString())
		svgImage.setAttribute('height', bounds.height.toString())
		if (element.alt) {
			svgImage.setAttribute('aria-label', element.alt)
		}
		svgContainer.append(svgImage)
	} else if (element.tagName === 'svg') {
		// Embed SVG, don't traverse contents
		// TODO walk contents to inline resources
		const clonedSvg = element.cloneNode(true) as SVGSVGElement
		clonedSvg.setAttribute('x', bounds.x.toString())
		clonedSvg.setAttribute('y', bounds.y.toString())
		clonedSvg.setAttribute('width', bounds.width.toString())
		clonedSvg.setAttribute('height', bounds.height.toString())
		clonedSvg.style.color = styles.color // handle fill or stroke referencing currentColor keyword
		elementToAppendTo.append(clonedSvg)
	} else {
		for (const child of element.childNodes) {
			walkNode(child, childContext)
		}
		if (ownStackingLayers) {
			sortStackingLayerChildren(ownStackingLayers)
		}
	}
}

function addBackgroundAndBorders(
	styles: CSSStyleDeclaration,
	bounds: DOMRect,
	backgroundAndBordersContainer: SVGElement
): void {
	if (isVisible(styles)) {
		if (
			bounds.width > 0 &&
			bounds.height > 0 &&
			(!isTransparent(styles.backgroundColor) || hasUniformBorder(styles))
		) {
			const box = createBackground(bounds, styles)
			backgroundAndBordersContainer.append(box)
			if (hasUniformBorder(styles)) {
				// Uniform border, use stroke
				box.setAttribute('stroke', styles.borderColor)
				box.setAttribute('stroke-width', styles.borderWidth)
				if (styles.borderStyle === 'dashed') {
					// > Displays a series of short square-ended dashes or line segments.
					// > The exact size and length of the segments are not defined by the specification and are implementation-specific.
					box.setAttribute('stroke-dasharray', '1')
				}
			}
			if (hasUniformBorderRadius(styles)) {
				box.setAttribute('rx', styles.borderRadius)
				box.setAttribute('ry', styles.borderRadius)
			}
		}

		if (!hasUniformBorder(styles)) {
			// Draw lines for each border
			for (const borderLine of createBorders(styles, bounds)) {
				backgroundAndBordersContainer.append(borderLine)
			}
		}
	}
}

function createBox(bounds: DOMRectReadOnly): SVGRectElement {
	const box = document.createElementNS(svgNamespace, 'rect')

	// TODO consider rotation
	box.setAttribute('width', bounds.width.toString())
	box.setAttribute('height', bounds.height.toString())
	box.setAttribute('x', bounds.x.toString())
	box.setAttribute('y', bounds.y.toString())

	return box
}

function createBackground(bounds: DOMRectReadOnly, styles: CSSStyleDeclaration): SVGRectElement {
	const background = createBox(bounds)

	// TODO handle background image and other properties
	if (styles.backgroundColor) {
		background.setAttribute('fill', styles.backgroundColor)
	}

	return background
}

function* createBorders(styles: CSSStyleDeclaration, bounds: DOMRectReadOnly): Iterable<SVGLineElement> {
	for (const side of ['top', 'bottom', 'right', 'left'] as const) {
		if (hasBorder(styles, side)) {
			yield createBorder(styles, bounds, side)
		}
	}
}

type Side = 'top' | 'bottom' | 'right' | 'left'

function hasBorder(styles: CSSStyleDeclaration, side: Side): boolean {
	return (
		!!styles.getPropertyValue(`border-${side}-color`) &&
		!isTransparent(styles.getPropertyValue(`border-${side}-color`)) &&
		styles.getPropertyValue(`border-${side}-width`) !== '0px'
	)
}

function createBorder(styles: CSSStyleDeclaration, bounds: DOMRectReadOnly, side: Side): SVGLineElement {
	const border = document.createElementNS(svgNamespace, 'line')
	border.setAttribute('stroke', styles.getPropertyValue(`border-${side}-color`))
	border.setAttribute('stroke-width', styles.getPropertyValue(`border-${side}-width`))
	border.setAttribute('x1', bounds.left.toString())
	border.setAttribute('x2', (bounds.left + bounds.width).toString())
	border.setAttribute('y1', bounds.top.toString())
	border.setAttribute('y2', bounds.top.toString())
	return border
}

function createSvgAnchor(element: HTMLAnchorElement): SVGAElement {
	const svgAnchor = document.createElementNS(svgNamespace, 'a')
	if (element.href && !element.href.startsWith('javascript:')) {
		svgAnchor.setAttribute('href', element.href)
	}
	if (element.rel) {
		svgAnchor.setAttribute('rel', element.rel)
	}
	if (element.target) {
		svgAnchor.setAttribute('target', element.target)
	}
	if (element.download) {
		svgAnchor.setAttribute('download', element.download)
	}
	return svgAnchor
}
