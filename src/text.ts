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
	const { whiteSpace } = styles

	const svgTextElement = context.svgDocument.createElementNS(svgNamespace, 'text')

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
			if (!doRectanglesIntersect(lineRectangle, context.captureArea)) {
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
		if (lineRectangles.length > 1) {
			// Crossed a line break.
			lineRange.setEnd(textNode, lineRange.endOffset - 1)
			addTextSpanForLineRange()
			lineRange.setStart(textNode, lineRange.endOffset)
		}
	}

	// Copy text styles
	// https://css-tricks.com/svg-properties-and-css
	assignTextStyles(styles, svgTextElement)

	context.currentSvgParent.append(svgTextElement)
}

export function assignTextStyles(styles: CSSStyleDeclaration, svgElement: SVGElement): void {
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
		userSelect,
	} = styles
	Object.assign(svgElement.style, {
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
		userSelect,
	})
}
