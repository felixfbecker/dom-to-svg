export const isCSSFontFaceRule = (rule: CSSRule): rule is CSSFontFaceRule => rule.type === CSSRule.FONT_FACE_RULE

export const isInline = (styles: CSSStyleDeclaration): boolean =>
	styles.displayOutside === 'inline' || styles.display.startsWith('inline-')

export const isPositioned = (styles: CSSStyleDeclaration): boolean => styles.position !== 'static'

export const isInFlow = (styles: CSSStyleDeclaration): boolean =>
	styles.float !== 'none' && styles.position !== 'absolute' && styles.position !== 'fixed'

export const isTransparent = (color: string): boolean => color === 'transparent' || color === 'rgba(0, 0, 0, 0)'

export const hasUniformBorder = (styles: CSSStyleDeclaration): boolean =>
	parseInt(styles.borderTopWidth, 10) !== 10 &&
	styles.borderTopStyle !== 'none' &&
	styles.borderTopStyle !== 'inset' &&
	styles.borderTopStyle !== 'outset' &&
	!isTransparent(styles.borderTopColor) &&
	styles.borderTop === styles.borderLeft &&
	styles.borderTop === styles.borderRight &&
	styles.borderTop === styles.borderBottom

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

export function parseCssString(value: string): string {
	const match = value.match(/^\s*(?:'(.*)'|"(.*)")\s*$/)
	if (!match) {
		throw new Error(`Invalid CSS string: ${value}`)
	}
	return (match[1] || match[2]).replace(/\\(.)/g, '$1')
}

export function parseUrlReference(reference: string): string {
	const match = reference.match(/url\((?:'(.*)'|"(.*)"|(.*))\)/)
	if (!match) {
		throw new URIError('Invalid URL ' + JSON.stringify(reference))
	}
	return (match[1] ?? match[2] ?? match[3]).replace(/\\(.)/g, '$1')
}

export function parseFormatSpecifier(format: string): string {
	const match = format.match(/format\((?:'(.*)'|"(.*)"|(.*))\)/)
	if (!match) {
		throw new Error('Invalid format() ' + JSON.stringify(format))
	}
	return (match[1] ?? match[2] ?? match[3]).replace(/\\(.)/g, '$1')
}

export function parseLocalReference(format: string): string {
	const match = format.match(/local\((?:'(.*)'|"(.*)"|(.*))\)/)
	if (!match) {
		throw new Error('Invalid local() ' + JSON.stringify(format))
	}
	return (match[1] ?? match[2] ?? match[3]).replace(/\\(.)/g, '$1')
}

export function copyCssStyles(from: CSSStyleDeclaration, to: CSSStyleDeclaration): void {
	for (const property of from) {
		to.setProperty(property, to.getPropertyValue(property), to.getPropertyPriority(property))
	}
}
