import { svgNamespace, isHTMLAnchorElement, isHTMLImageElement } from './dom.js'
import { getAccessibilityAttributes } from './accessibility.js'
import { TraversalContext, walkNode } from './traversal'
import {
	createStackingLayers,
	establishesStackingContext,
	determineStackingLayer,
	StackingLayers,
	sortStackingLayerChildren,
} from './stacking.js'
import {
	copyCssStyles,
	parseCssString,
	isVisible,
	isTransparent,
	hasUniformBorder,
	parseUrlReference,
	hasUniformBorderRadius,
} from './css.js'

export function handleElement(element: Element, context: Readonly<TraversalContext>): void {
	const cleanupFunctions: (() => void)[] = []

	try {
		const window = element.ownerDocument.defaultView
		if (!window) {
			throw new Error("Element's ownerDocument has no defaultView")
		}

		const bounds = element.getBoundingClientRect() // Includes borders
		const styles = window.getComputedStyle(element)
		const parentStyles = element.parentElement && window.getComputedStyle(element.parentElement)

		const svgContainer = isHTMLAnchorElement(element)
			? createSvgAnchor(element, context)
			: context.svgDocument.createElementNS(svgNamespace, 'g')

		// Add IDs, classes, debug info
		svgContainer.dataset.tag = element.tagName.toLowerCase()
		const id = element.id || (element.classList[0] || element.tagName.toLowerCase()) + context.getUniqueId()
		svgContainer.id = id
		const className = element.getAttribute('class')
		if (className) {
			svgContainer.setAttribute('class', className)
		}

		// Which parent should the container itself be appended to?
		const stackingLayer =
			context.stackingLayers[
				establishesStackingContext(styles, parentStyles)
					? 'rootBackgroundAndBorders'
					: determineStackingLayer(styles, parentStyles)
			]
		if (stackingLayer) {
			context.currentSvgParent.setAttribute(
				'aria-owns',
				[context.currentSvgParent.getAttribute('aria-owns'), svgContainer.id].filter(Boolean).join(' ')
			)
		}
		// If the parent is within the same stacking layer, append to the parent.
		// Otherwise append to the right stacking layer.
		const elementToAppendTo =
			context.parentStackingLayer === stackingLayer ? context.currentSvgParent : stackingLayer
		svgContainer.dataset.zIndex = styles.zIndex // Used for sorting
		elementToAppendTo.append(svgContainer)

		// If the element establishes a stacking context, create subgroups for each stacking layer.
		let childContext: TraversalContext
		let backgroundContainer: SVGElement
		let ownStackingLayers: StackingLayers | undefined
		if (establishesStackingContext(styles, parentStyles)) {
			ownStackingLayers = createStackingLayers(svgContainer)
			backgroundContainer = ownStackingLayers.rootBackgroundAndBorders
			childContext = {
				...context,
				currentSvgParent: svgContainer,
				parentStackingLayer: stackingLayer,
			}
		} else {
			backgroundContainer = svgContainer
			childContext = {
				...context,
				currentSvgParent: svgContainer,
				parentStackingLayer: stackingLayer,
			}
		}

		// Accessibility
		for (const [name, value] of getAccessibilityAttributes(element, context)) {
			svgContainer.setAttribute(name, value)
		}

		const handlePseudoElement = (pseudoSelector: '::before' | '::after', position: 'prepend' | 'append'): void => {
			const pseudoElementStyles = window.getComputedStyle(element, pseudoSelector)
			if (pseudoElementStyles.content !== 'none') {
				// Pseudo elements are inline by default (like a span)
				const span = element.ownerDocument.createElement('span')
				copyCssStyles(pseudoElementStyles, span.style)
				span.textContent = parseCssString(pseudoElementStyles.content)
				const style = element.ownerDocument.createElement('style')
				style.innerHTML = `#${id}${pseudoSelector} { display: none; }`
				element.before(style)
				cleanupFunctions.push(() => style.remove())
				element[position](span)
				cleanupFunctions.push(() => span.remove())
			}
		}
		handlePseudoElement('::before', 'prepend')
		handlePseudoElement('::after', 'append')
		// TODO handle ::marker etc

		addBackgroundAndBorders(styles, bounds, backgroundContainer, window, context)

		// If element is overflow: hidden, create a clipping rectangle to hide any overflowing content of any descendants
		let clipPath: SVGClipPathElement | undefined
		if (styles.overflow !== 'visible') {
			clipPath = context.svgDocument.createElementNS(svgNamespace, 'clipPath')
			clipPath.id = 'clipPath' + context.getUniqueId()
			clipPath.append(createBox(bounds, context))
			svgContainer.before(clipPath)
			svgContainer.setAttribute('clip-path', `url(#${clipPath.id})`)
		}

		if (isHTMLImageElement(element)) {
			const svgImage = context.svgDocument.createElementNS(svgNamespace, 'image')
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
		} else if (element.tagName !== 'IFRAME') {
			for (const child of element.childNodes) {
				walkNode(child, childContext)
			}
			if (ownStackingLayers) {
				sortStackingLayerChildren(ownStackingLayers)
			}
		}
	} finally {
		for (const cleanup of cleanupFunctions) {
			cleanup()
		}
	}
}

function addBackgroundAndBorders(
	styles: CSSStyleDeclaration,
	bounds: DOMRect,
	backgroundAndBordersContainer: SVGElement,
	window: Window,
	context: Pick<TraversalContext, 'getUniqueId' | 'svgDocument'>
): void {
	if (isVisible(styles)) {
		if (
			bounds.width > 0 &&
			bounds.height > 0 &&
			(!isTransparent(styles.backgroundColor) || hasUniformBorder(styles) || styles.backgroundImage !== 'none')
		) {
			const box = createBackgroundAndBorderBox(bounds, styles, context)
			backgroundAndBordersContainer.append(box)
			// TODO handle multiple backgrounds
			if (styles.backgroundImage !== 'none') {
				const image = context.svgDocument.createElementNS(svgNamespace, 'image')
				const [width, height = 'auto'] = styles.backgroundSize.split(' ')
				image.setAttribute('x', bounds.x.toString())
				image.setAttribute('y', bounds.y.toString())
				image.setAttribute('width', getBackgroundSizeDimension(width, bounds.width).toString())
				image.setAttribute('height', getBackgroundSizeDimension(height, bounds.height).toString())
				if (width !== 'auto' && height !== 'auto') {
					image.setAttribute('preserveAspectRatio', 'none')
				} else if (styles.backgroundSize === 'contain') {
					image.setAttribute('preserveAspectRatio', 'xMidYMid meet')
				} else if (styles.backgroundSize === 'cover') {
					image.setAttribute('preserveAspectRatio', 'xMidYMid slice')
				}
				// Technically not correct, because relative URLs should be resolved relative to the stylesheet,
				// not the page. But we have no means to know what stylesheet the style came from.
				const url = new URL(parseUrlReference(styles.backgroundImage), window.location.href)
				image.setAttribute('href', url.href)
				if (styles.backgroundRepeat === 'no-repeat') {
					backgroundAndBordersContainer.append(image)
				} else {
					const pattern = context.svgDocument.createElementNS(svgNamespace, 'pattern')
					pattern.setAttribute('patternUnits', 'userSpaceOnUse')
					pattern.id = 'pattern' + context.getUniqueId()
					pattern.append(image)
					box.before(pattern)
					box.setAttribute('fill', `url(#${pattern.id})`)
				}
			}
		}

		if (!hasUniformBorder(styles)) {
			// Draw lines for each border
			for (const borderLine of createBorders(styles, bounds, context)) {
				backgroundAndBordersContainer.append(borderLine)
			}
		}
	}
}

function getBackgroundSizeDimension(size: string, elementSize: number): number {
	if (size === 'auto') {
		// Let preserveAspectRatio handle scaling
		return elementSize
	}
	if (size.endsWith('px')) {
		return parseFloat(size)
	}
	if (size.endsWith('%')) {
		// TODO this needs to account for padding (except if background-origin is set)
		return (parseFloat(size) / 100) * elementSize
	}
	// Fallback
	console.warn('Unknown background-size value', size)
	return elementSize
}

function createBox(bounds: DOMRectReadOnly, context: Pick<TraversalContext, 'svgDocument'>): SVGRectElement {
	const box = context.svgDocument.createElementNS(svgNamespace, 'rect')

	// TODO consider rotation
	box.setAttribute('width', bounds.width.toString())
	box.setAttribute('height', bounds.height.toString())
	box.setAttribute('x', bounds.x.toString())
	box.setAttribute('y', bounds.y.toString())

	return box
}

function createBackgroundAndBorderBox(
	bounds: DOMRectReadOnly,
	styles: CSSStyleDeclaration,
	context: Pick<TraversalContext, 'svgDocument'>
): SVGRectElement {
	const background = createBox(bounds, context)

	// TODO handle background image and other properties
	if (styles.backgroundColor) {
		background.setAttribute('fill', styles.backgroundColor)
	}

	if (hasUniformBorder(styles)) {
		// Uniform border, use stroke
		background.setAttribute('stroke', styles.borderColor)
		background.setAttribute('stroke-width', styles.borderWidth)
		if (styles.borderStyle === 'dashed') {
			// > Displays a series of short square-ended dashes or line segments.
			// > The exact size and length of the segments are not defined by the specification and are implementation-specific.
			background.setAttribute('stroke-dasharray', '1')
		}
	}
	if (hasUniformBorderRadius(styles)) {
		background.setAttribute('rx', styles.borderRadius)
		background.setAttribute('ry', styles.borderRadius)
	}

	return background
}

function* createBorders(
	styles: CSSStyleDeclaration,
	bounds: DOMRectReadOnly,
	context: Pick<TraversalContext, 'svgDocument'>
): Iterable<SVGLineElement> {
	for (const side of ['top', 'bottom', 'right', 'left'] as const) {
		if (hasBorder(styles, side)) {
			yield createBorder(styles, bounds, side, context)
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

function createBorder(
	styles: CSSStyleDeclaration,
	bounds: DOMRectReadOnly,
	side: Side,
	context: Pick<TraversalContext, 'svgDocument'>
): SVGLineElement {
	const border = context.svgDocument.createElementNS(svgNamespace, 'line')
	border.setAttribute('stroke', styles.getPropertyValue(`border-${side}-color`))
	border.setAttribute('stroke-width', styles.getPropertyValue(`border-${side}-width`))
	if (side === 'top') {
		border.setAttribute('x1', bounds.left.toString())
		border.setAttribute('x2', bounds.right.toString())
		border.setAttribute('y1', bounds.top.toString())
		border.setAttribute('y2', bounds.top.toString())
	} else if (side === 'left') {
		border.setAttribute('x1', bounds.left.toString())
		border.setAttribute('x2', bounds.left.toString())
		border.setAttribute('y1', bounds.top.toString())
		border.setAttribute('y2', bounds.bottom.toString())
	} else if (side === 'right') {
		border.setAttribute('x1', bounds.right.toString())
		border.setAttribute('x2', bounds.right.toString())
		border.setAttribute('y1', bounds.top.toString())
		border.setAttribute('y2', bounds.bottom.toString())
	} else if (side === 'bottom') {
		border.setAttribute('x1', bounds.left.toString())
		border.setAttribute('x2', bounds.right.toString())
		border.setAttribute('y1', bounds.bottom.toString())
		border.setAttribute('y2', bounds.bottom.toString())
	}
	return border
}

function createSvgAnchor(element: HTMLAnchorElement, context: Pick<TraversalContext, 'svgDocument'>): SVGAElement {
	const svgAnchor = context.svgDocument.createElementNS(svgNamespace, 'a')
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
