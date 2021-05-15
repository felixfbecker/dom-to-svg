import { isVisible } from './css.js'
import { svgNamespace } from './dom.js'
import { TraversalContext } from './traversal.js'
import { doRectanglesIntersect, assert } from './util.js'

export function handleTextNode(textNode: Text, context: TraversalContext): void {
	if (!textNode.ownerDocument.defaultView) {
		throw new Error("Element's ownerDocument has no defaultView")
	}
	const window = textNode.ownerDocument.defaultView
	const parentElement = textNode.parentElement!
	const styles = window.getComputedStyle(parentElement)
	if (!isVisible(styles)) {
		return
	}

	const selection = window.getSelection()
	assert(
		selection,
		'Could not obtain selection from window. Selection is needed for detecting whitespace collapsing in text.'
	)

	const svgTextElement = context.svgDocument.createElementNS(svgNamespace, 'text')

	// Copy text styles
	// https://css-tricks.com/svg-properties-and-css
	copyTextStyles(styles, svgTextElement)

	const tabSize = parseInt(styles.tabSize, 10)

	// Make sure the y attribute is the bottom of the box, not the baseline
	svgTextElement.setAttribute('dominant-baseline', 'text-after-edge')

	const lineRange = textNode.ownerDocument.createRange()
	lineRange.setStart(textNode, 0)
	lineRange.setEnd(textNode, 0)
	while (true) {
		const addTextSpanForLineRange = (): void => {
			if (lineRange.collapsed) {
				return
			}
			const lineRectangle = lineRange.getClientRects()[0]!
			if (!doRectanglesIntersect(lineRectangle, context.options.captureArea)) {
				return
			}
			const textSpan = context.svgDocument.createElementNS(svgNamespace, 'tspan')
			textSpan.setAttribute('xml:space', 'preserve')

			// lineRange.toString() returns the text including whitespace.
			// by adding the range to a Selection, then getting the text from that selection,
			// we can let the DOM handle whitespace collapsing the same way as innerText (but for a Range).
			// For this to work, the parent element must not forbid user selection.
			const previousUserSelect = parentElement.style.userSelect
			parentElement.style.userSelect = 'all'
			try {
				selection.removeAllRanges()
				selection.addRange(lineRange)
				textSpan.textContent = selection
					.toString()
					// SVG does not support tabs in text. Tabs get rendered as one space character. Convert the
					// tabs to spaces according to tab-size instead.
					// Ideally we would keep the tab and create offset tspans.
					.replace(/\t/g, ' '.repeat(tabSize))
			} finally {
				parentElement.style.userSelect = previousUserSelect
				selection.removeAllRanges()
			}

			textSpan.setAttribute('x', lineRectangle.x.toString())
			textSpan.setAttribute('y', lineRectangle.bottom.toString()) // intentionally bottom because of dominant-baseline setting
			textSpan.setAttribute('textLength', lineRectangle.width.toString())
			textSpan.setAttribute('lengthAdjust', 'spacingAndGlyphs')
			svgTextElement.append(textSpan)
		}
		try {
			lineRange.setEnd(textNode, lineRange.endOffset + 1)
		} catch (error) {
			if ((error as DOMException).code === DOMException.INDEX_SIZE_ERR) {
				// Reached the end
				addTextSpanForLineRange()
				break
			}
			throw error
		}
		// getClientRects() returns one rectangle for each line of a text node.
		const lineRectangles = lineRange.getClientRects()
		// If no lines
		if (!lineRectangles[0]) {
			// Pure whitespace text nodes are collapsed and not rendered.
			return
		}
		// If two (unique) lines
		// For some reason, Chrome returns 2 identical DOMRects for text with text-overflow: ellipsis.
		if (lineRectangles[1] && lineRectangles[0].top !== lineRectangles[1].top) {
			// Crossed a line break.
			// Go back one character to select exactly the previous line.
			lineRange.setEnd(textNode, lineRange.endOffset - 1)
			// Add <tspan> for exactly that line
			addTextSpanForLineRange()
			// Start on the next line.
			lineRange.setStart(textNode, lineRange.endOffset)
		}
	}

	context.currentSvgParent.append(svgTextElement)
}

export const textAttributes = new Set([
	'color',
	'dominant-baseline',
	'font-family',
	'font-size',
	'font-size-adjust',
	'font-stretch',
	'font-style',
	'font-variant',
	'font-weight',
	'direction',
	'letter-spacing',
	'text-decoration',
	'text-anchor',
	'text-decoration',
	'text-rendering',
	'unicode-bidi',
	'word-spacing',
	'writing-mode',
	'user-select',
] as const)
export function copyTextStyles(styles: CSSStyleDeclaration, svgElement: SVGElement): void {
	for (const textProperty of textAttributes) {
		const value = styles.getPropertyValue(textProperty)
		if (value) {
			svgElement.setAttribute(textProperty, value)
		}
	}
	// tspan uses fill, CSS uses color
	svgElement.setAttribute('fill', styles.color)
}
