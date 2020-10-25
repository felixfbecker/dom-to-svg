import { svgNamespace, isSVGImageElement, isSVGStyleElement } from './dom.js'
import { fetchAsDataURL } from './inline'
import { walkNode } from './traversal.js'
import { createStackingLayers } from './stacking.js'
import { createCounter } from './util.js'
import { isCSSFontFaceRule, parseFontFaceSourceUrls } from './css.js'

export * from './serialize.js'

export interface DomToSvgOptions {
	/**
	 * To visual area to contrain the SVG too.
	 * Note this will not remove out-of-bounds elements from the SVG, just modify the `viewBox` accordingly.
	 */
	clientBounds?: DOMRectReadOnly
}

export function documentToSVG(document: Document, options?: DomToSvgOptions): XMLDocument {
	return elementToSVG(document.documentElement, options)
}

export function elementToSVG(element: Element, options?: DomToSvgOptions): XMLDocument {
	const svgDocument = element.ownerDocument.implementation.createDocument(svgNamespace, 'svg', null) as XMLDocument

	const svgElement = (svgDocument.documentElement as unknown) as SVGSVGElement
	svgElement.setAttribute('xmlns', svgNamespace)

	// Copy @font-face rules
	const styleElement = svgDocument.createElementNS(svgNamespace, 'style')
	for (const styleSheet of element.ownerDocument.styleSheets) {
		for (const rule of styleSheet.cssRules) {
			if (isCSSFontFaceRule(rule)) {
				styleElement.append(rule.cssText, '\n')
			}
		}
	}
	svgElement.append(styleElement)

	walkNode(element, {
		svgDocument,
		currentSvgParent: svgElement,
		stackingLayers: createStackingLayers(svgElement),
		parentStackingLayer: svgElement,
		getUniqueId: createCounter(),
		labels: new Map(),
	})

	const bounds = options?.clientBounds ?? element.getBoundingClientRect()
	svgElement.setAttribute('width', bounds.width.toString())
	svgElement.setAttribute('height', bounds.height.toString())
	svgElement.setAttribute('viewBox', `${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`)

	return svgDocument
}

declare global {
	interface SVGStyleElement extends LinkStyle {}
}

export async function inlineResources(element: Element): Promise<void> {
	if (isSVGImageElement(element)) {
		const dataURL = await fetchAsDataURL(element.href.baseVal)
		element.setAttribute('href', dataURL.href)
	} else if (isSVGStyleElement(element) && element.sheet) {
		const sheet = element.sheet
		for (const rule of element.sheet.cssRules) {
			if (isCSSFontFaceRule(rule)) {
				const sources = parseFontFaceSourceUrls(rule.style.src)
				const resolvedSources = await Promise.all(
					sources.map(async source => {
						if (!('url' in source)) {
							return source
						}
						const dataUrl = await fetchAsDataURL(source.url)
						return { ...source, url: dataUrl }
					})
				)
				rule.style.src = resolvedSources
					.map(source => {
						if ('local' in source) {
							return source.local
						}
						return [`url(${source.url.href})`, source.format && `format(${source.format})`]
							.filter(Boolean)
							.join(' ')
					})
					.join(', ')
			}
		}
	}
	await Promise.all([...element.children].map(inlineResources))
}
