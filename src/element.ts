import cssValueParser from 'postcss-value-parser'

import { getAccessibilityAttributes } from './accessibility.js'
import {
	copyCssStyles,
	isVisible,
	isTransparent,
	hasUniformBorder,
	parseCSSLength,
	unescapeStringValue,
	Side,
	getBorderRadiiForSide,
	calculateOverlappingCurvesFactor,
} from './css.js'
import {
	svgNamespace,
	isHTMLAnchorElement,
	isHTMLImageElement,
	isHTMLInputElement,
	isHTMLElement,
	isSVGSVGElement,
} from './dom.js'
import { convertLinearGradient } from './gradients.js'
import {
	createStackingLayers,
	establishesStackingContext,
	determineStackingLayer,
	StackingLayers,
	sortStackingLayerChildren,
	cleanupStackingLayerChildren,
} from './stacking.js'
import { handleSvgNode } from './svg.js'
import { copyTextStyles } from './text.js'
import { TraversalContext, walkNode } from './traversal.js'
import { doRectanglesIntersect, isTaggedUnionMember } from './util.js'

export function handleElement(element: Element, context: Readonly<TraversalContext>): void {
	const cleanupFunctions: (() => void)[] = []

	try {
		const window = element.ownerDocument.defaultView
		if (!window) {
			throw new Error("Element's ownerDocument has no defaultView")
		}

		const bounds = element.getBoundingClientRect() // Includes borders
		const rectanglesIntersect = doRectanglesIntersect(bounds, context.options.captureArea)

		const styles = window.getComputedStyle(element)
		const parentStyles = element.parentElement && window.getComputedStyle(element.parentElement)

		const svgContainer =
			isHTMLAnchorElement(element) && context.options.keepLinks
				? createSvgAnchor(element, context)
				: context.svgDocument.createElementNS(svgNamespace, 'g')

		// Add IDs, classes, debug info
		svgContainer.dataset.tag = element.tagName.toLowerCase()
		const id = element.id || context.getUniqueId(element.classList[0] || element.tagName.toLowerCase())
		svgContainer.id = id
		const className = element.getAttribute('class')
		if (className) {
			svgContainer.setAttribute('class', className)
		}

		// Title
		if (isHTMLElement(element) && element.title) {
			const svgTitle = context.svgDocument.createElementNS(svgNamespace, 'title')
			svgTitle.textContent = element.title
			svgContainer.prepend(svgTitle)
		}

		// Which parent should the container itself be appended to?
		const stackingLayerName = determineStackingLayer(styles, parentStyles)
		const stackingLayer = stackingLayerName
			? context.stackingLayers[stackingLayerName]
			: context.parentStackingLayer
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
				stackingLayers: ownStackingLayers,
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

		// Opacity
		if (styles.opacity !== '1') {
			svgContainer.setAttribute('opacity', styles.opacity)
		}

		// Accessibility
		for (const [name, value] of getAccessibilityAttributes(element, context)) {
			svgContainer.setAttribute(name, value)
		}

		// Handle ::before and ::after by creating temporary child elements in the DOM.
		// Avoid infinite loop, in case `element` already is already a synthetic element created by us for a pseudo element.
		if (isHTMLElement(element) && !element.dataset.pseudoElement) {
			const handlePseudoElement = (
				pseudoSelector: '::before' | '::after',
				position: 'prepend' | 'append'
			): void => {
				const pseudoElementStyles = window.getComputedStyle(element, pseudoSelector)
				const content = cssValueParser(pseudoElementStyles.content).nodes.find(
					isTaggedUnionMember('type', 'string' as const)
				)
				if (!content) {
					return
				}
				// Pseudo elements are inline by default (like a span)
				const span = element.ownerDocument.createElement('span')
				span.dataset.pseudoElement = pseudoSelector
				copyCssStyles(pseudoElementStyles, span.style)
				span.textContent = unescapeStringValue(content.value)
				element.dataset.pseudoElementOwner = id
				cleanupFunctions.push(() => element.removeAttribute('data-pseudo-element-owner'))
				const style = element.ownerDocument.createElement('style')
				// Hide the *actual* pseudo element temporarily while we have a real DOM equivalent in the DOM
				style.textContent = `[data-pseudo-element-owner="${id}"]${pseudoSelector} { display: none !important; }`
				element.before(style)
				cleanupFunctions.push(() => style.remove())
				element[position](span)
				cleanupFunctions.push(() => span.remove())
			}
			handlePseudoElement('::before', 'prepend')
			handlePseudoElement('::after', 'append')
			// TODO handle ::marker etc
		}

		if (rectanglesIntersect) {
			addBackgroundAndBorders(styles, bounds, backgroundContainer, window, context)
		}

		// If element is overflow: hidden, create a masking rectangle to hide any overflowing content of any descendants.
		// Use <mask> instead of <clipPath> as Figma supports <mask>, but not <clipPath>.
		if (styles.overflow !== 'visible') {
			const mask = context.svgDocument.createElementNS(svgNamespace, 'mask')
			mask.id = context.getUniqueId('mask-for-' + id)
			const visibleRectangle = createBox(bounds, context)
			visibleRectangle.setAttribute('fill', '#ffffff')
			mask.append(visibleRectangle)
			svgContainer.append(mask)
			svgContainer.setAttribute('mask', `url(#${mask.id})`)
			childContext = {
				...childContext,
				ancestorMasks: [{ mask, forElement: element }, ...childContext.ancestorMasks],
			}
		}

		if (
			isHTMLElement(element) &&
			(styles.position === 'absolute' || styles.position === 'fixed') &&
			context.ancestorMasks.length > 0 &&
			element.offsetParent
		) {
			// Absolute and fixed elements are out of the flow and will bleed out of an `overflow: hidden` ancestor
			// as long as their offsetParent is higher up than the mask element.
			for (const { mask, forElement } of context.ancestorMasks) {
				if (element.offsetParent.contains(forElement) || element.offsetParent === forElement) {
					// Add a cutout to the ancestor mask
					const visibleRectangle = createBox(bounds, context)
					visibleRectangle.setAttribute('fill', '#ffffff')
					mask.append(visibleRectangle)
				} else {
					break
				}
			}
		}

		if (
			rectanglesIntersect &&
			isHTMLImageElement(element) &&
			// Make sure the element has a src/srcset attribute (the relative URL). `element.src` is absolute and always defined.
			(element.getAttribute('src') || element.getAttribute('srcset'))
		) {
			const svgImage = context.svgDocument.createElementNS(svgNamespace, 'image')
			svgImage.id = `${id}-image` // read by inlineResources()
			svgImage.setAttribute('xlink:href', element.currentSrc || element.src)
			const paddingLeft = parseCSSLength(styles.paddingLeft, bounds.width) ?? 0
			const paddingRight = parseCSSLength(styles.paddingRight, bounds.width) ?? 0
			const paddingTop = parseCSSLength(styles.paddingTop, bounds.height) ?? 0
			const paddingBottom = parseCSSLength(styles.paddingBottom, bounds.height) ?? 0
			svgImage.setAttribute('x', (bounds.x + paddingLeft).toString())
			svgImage.setAttribute('y', (bounds.y + paddingTop).toString())
			svgImage.setAttribute('width', (bounds.width - paddingLeft - paddingRight).toString())
			svgImage.setAttribute('height', (bounds.height - paddingTop - paddingBottom).toString())
			if (element.alt) {
				svgImage.setAttribute('aria-label', element.alt)
			}
			svgContainer.append(svgImage)
		} else if (rectanglesIntersect && isHTMLInputElement(element) && bounds.width > 0 && bounds.height > 0) {
			// Handle button labels or input field content
			if (element.value) {
				const svgTextElement = context.svgDocument.createElementNS(svgNamespace, 'text')
				copyTextStyles(styles, svgTextElement)
				svgTextElement.setAttribute('dominant-baseline', 'central')
				svgTextElement.setAttribute('xml:space', 'preserve')
				svgTextElement.setAttribute(
					'x',
					(bounds.x + (parseCSSLength(styles.paddingLeft, bounds.width) ?? 0)).toString()
				)
				const top = bounds.top + (parseCSSLength(styles.paddingTop, bounds.height) ?? 0)
				const bottom = bounds.bottom + (parseCSSLength(styles.paddingBottom, bounds.height) ?? 0)
				const middle = (top + bottom) / 2
				svgTextElement.setAttribute('y', middle.toString())
				svgTextElement.textContent = element.value
				childContext.stackingLayers.inFlowInlineLevelNonPositionedDescendants.append(svgTextElement)
			}
		} else if (rectanglesIntersect && isSVGSVGElement(element) && isVisible(styles)) {
			handleSvgNode(element, { ...childContext, idPrefix: `${id}-` })
		} else {
			// Walk children even if rectangles don't intersect,
			// because children can overflow the parent's bounds as long as overflow: visible (default).
			for (const child of element.childNodes) {
				walkNode(child, childContext)
			}
			if (ownStackingLayers) {
				sortStackingLayerChildren(ownStackingLayers)
				cleanupStackingLayerChildren(ownStackingLayers)
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
			if (styles.backgroundImage !== 'none') {
				const backgrounds = cssValueParser(styles.backgroundImage)
					.nodes.filter(isTaggedUnionMember('type', 'function' as const))
					.reverse()
				const xBackgroundPositions = styles.backgroundPositionX.split(/\s*,\s*/g)
				const yBackgroundPositions = styles.backgroundPositionY.split(/\s*,\s*/g)
				const backgroundRepeats = styles.backgroundRepeat.split(/\s*,\s*/g)
				for (const [index, backgroundNode] of backgrounds.entries()) {
					const backgroundPositionX = parseCSSLength(xBackgroundPositions[index]!, bounds.width) ?? 0
					const backgroundPositionY = parseCSSLength(yBackgroundPositions[index]!, bounds.height) ?? 0
					const backgroundRepeat = backgroundRepeats[index]
					if (backgroundNode.value === 'url' && backgroundNode.nodes[0]) {
						const urlArgument = backgroundNode.nodes[0]
						const image = context.svgDocument.createElementNS(svgNamespace, 'image')
						image.id = context.getUniqueId('background-image') // read by inlineResources()
						const [cssWidth = 'auto', cssHeight = 'auto'] = styles.backgroundSize.split(' ')
						const backgroundWidth = parseCSSLength(cssWidth, bounds.width) ?? bounds.width
						const backgroundHeight = parseCSSLength(cssHeight, bounds.height) ?? bounds.height
						image.setAttribute('width', backgroundWidth.toString())
						image.setAttribute('height', backgroundHeight.toString())
						if (cssWidth !== 'auto' && cssHeight !== 'auto') {
							image.setAttribute('preserveAspectRatio', 'none')
						} else if (styles.backgroundSize === 'contain') {
							image.setAttribute('preserveAspectRatio', 'xMidYMid meet')
						} else if (styles.backgroundSize === 'cover') {
							image.setAttribute('preserveAspectRatio', 'xMidYMid slice')
						}
						// Technically not correct, because relative URLs should be resolved relative to the stylesheet,
						// not the page. But we have no means to know what stylesheet the style came from
						// (unless we iterate through all rules in all style sheets and find the matching one).
						const url = new URL(unescapeStringValue(urlArgument.value), window.location.href)
						image.setAttribute('xlink:href', url.href)

						if (
							backgroundRepeat === 'no-repeat' ||
							(backgroundPositionX === 0 &&
								backgroundPositionY === 0 &&
								backgroundWidth === bounds.width &&
								backgroundHeight === bounds.height)
						) {
							image.setAttribute('x', bounds.x.toString())
							image.setAttribute('y', bounds.y.toString())
							backgroundAndBordersContainer.append(image)
						} else {
							image.setAttribute('x', '0')
							image.setAttribute('y', '0')
							const pattern = context.svgDocument.createElementNS(svgNamespace, 'pattern')
							pattern.setAttribute('patternUnits', 'userSpaceOnUse')
							pattern.setAttribute('patternContentUnits', 'userSpaceOnUse')
							pattern.setAttribute('x', (bounds.x + backgroundPositionX).toString())
							pattern.setAttribute('y', (bounds.y + backgroundPositionY).toString())
							pattern.setAttribute(
								'width',
								(backgroundRepeat === 'repeat' || backgroundRepeat === 'repeat-x'
									? backgroundWidth
									: // If background shouldn't repeat on this axis, make the tile as big as the element so the repetition is cut off.
									  backgroundWidth + bounds.x + backgroundPositionX
								).toString()
							)
							pattern.setAttribute(
								'height',
								(backgroundRepeat === 'repeat' || backgroundRepeat === 'repeat-y'
									? backgroundHeight
									: // If background shouldn't repeat on this axis, make the tile as big as the element so the repetition is cut off.
									  backgroundHeight + bounds.y + backgroundPositionY
								).toString()
							)
							pattern.id = context.getUniqueId('pattern')
							pattern.append(image)
							box.before(pattern)
							box.setAttribute('fill', `url(#${pattern.id})`)
						}
					} else if (/^(-webkit-)?linear-gradient$/.test(backgroundNode.value)) {
						const linearGradientCss = cssValueParser.stringify(backgroundNode)
						const svgLinearGradient = convertLinearGradient(linearGradientCss, context)
						if (backgroundPositionX !== 0 || backgroundPositionY !== 0) {
							svgLinearGradient.setAttribute(
								'gradientTransform',
								`translate(${backgroundPositionX}, ${backgroundPositionY})`
							)
						}
						svgLinearGradient.id = context.getUniqueId('linear-gradient')
						box.before(svgLinearGradient)
						box.setAttribute('fill', `url(#${svgLinearGradient.id})`)
					}
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
		// Cannot use borderColor/borderWidth directly as in Firefox those are empty strings.
		// Need to get the border property from some specific side (they are all the same in this condition).
		// https://stackoverflow.com/questions/41696063/getcomputedstyle-returns-empty-strings-on-ff-when-instead-crome-returns-a-comp
		background.setAttribute('stroke', styles.borderTopColor)
		background.setAttribute('stroke-width', styles.borderTopWidth)
		if (styles.borderTopStyle === 'dashed') {
			// > Displays a series of short square-ended dashes or line segments.
			// > The exact size and length of the segments are not defined by the specification and are implementation-specific.
			background.setAttribute('stroke-dasharray', '1')
		}
	}

	// Set border radius
	// Approximation, always assumes uniform border-radius by using the top-left horizontal radius and the top-left vertical radius for all corners.
	// TODO support irregular border radii on all corners by drawing border as a <path>.
	const overlappingCurvesFactor = calculateOverlappingCurvesFactor(styles, bounds)
	const radiusX = getBorderRadiiForSide('top', styles, bounds)[0] * overlappingCurvesFactor
	const radiusY = getBorderRadiiForSide('left', styles, bounds)[0] * overlappingCurvesFactor
	if (radiusX !== 0) {
		background.setAttribute('rx', radiusX.toString())
	}
	if (radiusY !== 0) {
		background.setAttribute('ry', radiusY.toString())
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
	// TODO handle border-radius for non-uniform borders
	const border = context.svgDocument.createElementNS(svgNamespace, 'line')
	border.setAttribute('stroke-linecap', 'square')
	const color = styles.getPropertyValue(`border-${side}-color`)
	border.setAttribute('stroke', color)
	border.setAttribute('stroke-width', styles.getPropertyValue(`border-${side}-width`))

	// Handle inset/outset borders
	const borderStyle = styles.getPropertyValue(`border-${side}-style`)
	if (
		(borderStyle === 'inset' && (side === 'top' || side === 'left')) ||
		(borderStyle === 'outset' && (side === 'right' || side === 'bottom'))
	) {
		const match = color.match(/rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)/)
		if (!match) {
			throw new Error(`Unexpected color: ${color}`)
		}
		const components = match.slice(1, 4).map(value => parseInt(value, 10) * 0.3)
		if (match[4]) {
			components.push(parseFloat(match[4]))
		}
		// Low-light border
		// https://stackoverflow.com/questions/4147940/how-do-browsers-determine-which-exact-colors-to-use-for-border-inset-or-outset
		border.setAttribute('stroke', `rgba(${components.join(', ')})`)
	}

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
