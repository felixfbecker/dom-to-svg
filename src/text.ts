import { isVisible } from './css'
import { svgNamespace } from './dom'
import { TraversalContext } from './traversal'
import { doRectanglesIntersect } from './util'

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
	const { whiteSpace } = styles

	const svgTextElement = context.svgDocument.createElementNS(svgNamespace, 'text')

	// Copy text styles
	// https://css-tricks.com/svg-properties-and-css
	copyTextStyles(styles, svgTextElement)

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
			const lineRectangle = lineRange.getClientRects()[0]
			if (!doRectanglesIntersect(lineRectangle, context.options.captureArea)) {
				return
			}
			const textSpan = context.svgDocument.createElementNS(svgNamespace, 'tspan')
			textSpan.setAttribute('xml:space', 'preserve')

			let text = lineRange.toString()

			if (whiteSpace !== 'pre' && whiteSpace !== 'pre-wrap') {
				// Collapse whitespace within the text node
				text = text.replace(/\s+/, ' ')

				// Check if previous siblings had trailing whitespace.
				// If so, trim beginning of the text content to collapse whitespace across nodes.
				if (lineRange.startOffset === 0) {
					for (let node: Node | null = textNode.previousSibling; node; node = node.previousSibling) {
						if (node.textContent && /\s+$/.test(node.textContent)) {
							text = text.trimStart()
							break
						} else if (node.textContent?.trim()) {
							break
						}
					}
				}
			}
			textSpan.textContent = text
			textSpan.setAttribute('x', lineRectangle.x.toString())
			textSpan.setAttribute('y', lineRectangle.bottom.toString())
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
		if (lineRectangles.length === 0) {
			// Pure whitespace text nodes are collapsed and not rendered.
			return
		}
		// For some reason, Chrome returns 2 identical DOMRects for text with text-overflow: ellipsis.
		if (lineRectangles.length > 1 && lineRectangles[0].top !== lineRectangles[1].top) {
			// Crossed a line break.
			lineRange.setEnd(textNode, lineRange.endOffset - 1)
			addTextSpanForLineRange()
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
