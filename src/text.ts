import { svgNamespace } from './common.js'
import { TraversalContext } from './traversal.js'

export function handleTextNode(textNode: Text, context: TraversalContext): void {
	const svgTextElement = document.createElementNS(svgNamespace, 'text')

	// Make sure the y attribute is the bottom of the box, not the baseline
	svgTextElement.setAttribute('dominant-baseline', 'text-after-edge')

	const lineRange = document.createRange()
	lineRange.setStart(textNode, 0)
	lineRange.setEnd(textNode, 0)
	while (true) {
		const addTextSpanForLineRange = (): void => {
			if (lineRange.collapsed) {
				return
			}
			const textSpan = document.createElementNS(svgNamespace, 'tspan')
			textSpan.setAttribute('xml:space', 'preserve')
			textSpan.textContent = lineRange.toString()
			const lineRectangle = lineRange.getClientRects()[0]
			textSpan.setAttribute('x', lineRectangle.x.toString())
			textSpan.setAttribute('y', lineRectangle.bottom.toString())
			textSpan.setAttribute('textLength', lineRectangle.width.toString())
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
		if (lineRectangles.length > 1) {
			// Crossed a line break.
			lineRange.setEnd(textNode, lineRange.endOffset - 1)
			addTextSpanForLineRange()
			lineRange.setStart(textNode, lineRange.endOffset)
		}
	}

	if (textNode.parentElement) {
		// Copy text styles
		// https://css-tricks.com/svg-properties-and-css
		if (!textNode.ownerDocument.defaultView) {
			throw new Error("Element's ownerDocument has no defaultView")
		}
		const {
			color,
			fontFamily,
			fontSize,
			fontSizeAdjust,
			fontStretch,
			fontStyle,
			fontVariant,
			fontWeight,
			direction,
			letterSpacing,
			textDecoration,
			unicodeBidi,
			wordSpacing,
			writingMode,
		} = textNode.ownerDocument.defaultView.getComputedStyle(textNode.parentElement)
		Object.assign(svgTextElement.style, {
			fill: color,
			fontFamily,
			fontSize,
			fontSizeAdjust,
			fontStretch,
			fontStyle,
			fontVariant,
			fontWeight,
			direction,
			letterSpacing,
			textDecoration,
			unicodeBidi,
			wordSpacing,
			writingMode,
		})
	}

	context.currentSvgParent.append(svgTextElement)
}
