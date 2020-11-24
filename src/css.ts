export const isCSSFontFaceRule = (rule: CSSRule): rule is CSSFontFaceRule => rule.type === CSSRule.FONT_FACE_RULE

export const isInline = (styles: CSSStyleDeclaration): boolean =>
	styles.displayOutside === 'inline' || styles.display.startsWith('inline-')

export const isPositioned = (styles: CSSStyleDeclaration): boolean => styles.position !== 'static'

export const isInFlow = (styles: CSSStyleDeclaration): boolean =>
	styles.float !== 'none' && styles.position !== 'absolute' && styles.position !== 'fixed'

export const isTransparent = (color: string): boolean => color === 'transparent' || color === 'rgba(0, 0, 0, 0)'

export const hasUniformBorder = (styles: CSSStyleDeclaration): boolean =>
	parseFloat(styles.borderTopWidth) !== 0 &&
	styles.borderTopStyle !== 'none' &&
	styles.borderTopStyle !== 'inset' &&
	styles.borderTopStyle !== 'outset' &&
	!isTransparent(styles.borderTopColor) &&
	// Cannot use border property directly as in Firefox those are empty strings.
	// Need to get the specific border properties from the specific sides.
	// https://stackoverflow.com/questions/41696063/getcomputedstyle-returns-empty-strings-on-ff-when-instead-crome-returns-a-comp
	styles.borderTopWidth === styles.borderLeftWidth &&
	styles.borderTopWidth === styles.borderRightWidth &&
	styles.borderTopWidth === styles.borderBottomWidth &&
	styles.borderTopColor === styles.borderLeftColor &&
	styles.borderTopColor === styles.borderRightColor &&
	styles.borderTopColor === styles.borderBottomColor &&
	styles.borderTopStyle === styles.borderLeftStyle &&
	styles.borderTopStyle === styles.borderRightStyle &&
	styles.borderTopStyle === styles.borderBottomStyle

export const hasUniformBorderRadius = (styles: CSSStyleDeclaration): boolean =>
	styles.borderTopLeftRadius === styles.borderTopRightRadius &&
	styles.borderTopLeftRadius === styles.borderBottomLeftRadius &&
	styles.borderTopLeftRadius === styles.borderBottomRightRadius

export const isVisible = (styles: CSSStyleDeclaration): boolean =>
	styles.displayOutside !== 'none' &&
	styles.display !== 'none' &&
	styles.visibility !== 'hidden' &&
	styles.opacity !== '0'

export function parseCSSLength(length: string, containerLength: number): number | undefined {
	if (length.endsWith('px')) {
		return parseFloat(length)
	}
	if (length.endsWith('%')) {
		return (parseFloat(length) / 100) * containerLength
	}
	return undefined
}

export const unescapeStringValue = (value: string): string =>
	value
		// Replace hex escape sequences
		.replace(/\\([\da-f]{1,2})/gi, (substring, codePoint) => String.fromCodePoint(parseInt(codePoint, 16)))
		// Replace all other escapes (quotes, backslash, etc)
		.replace(/\\(.)/g, '$1')

export function copyCssStyles(from: CSSStyleDeclaration, to: CSSStyleDeclaration): void {
	for (const property of from) {
		to.setProperty(property, from.getPropertyValue(property), from.getPropertyPriority(property))
	}
}
