import * as postcss from 'postcss'
import cssValueParser from 'postcss-value-parser'

import { unescapeStringValue } from './css.js'
import { isSVGImageElement, isSVGStyleElement, svgNamespace } from './dom.js'
import { handleSvgNode } from './svg.js'
import { withTimeout, assert } from './util.js'

declare global {
	interface SVGStyleElement extends LinkStyle {}
}

/**
 * Inlines all external resources of the given element, such as fonts and images.
 *
 * Fonts and binary images are inlined as Base64 data: URIs.
 *
 * Images that reference another SVG are inlined by inlining the embedded SVG into the output SVG.
 * Note: The passed element needs to be attached to a document with a window (`defaultView`) for this so that `getComputedStyle()` can be used.
 */
export async function inlineResources(element: Element): Promise<void> {
	await Promise.all([
		...[...element.children].map(inlineResources),
		(async () => {
			if (isSVGImageElement(element)) {
				const blob = await withTimeout(10000, `Timeout fetching ${element.href.baseVal}`, () =>
					fetchResource(element.href.baseVal)
				)
				if (blob.type === 'image/svg+xml') {
					// If the image is an SVG, inline it into the output SVG.
					// Some tools (e.g. Figma) do not support nested SVG.

					assert(element.ownerDocument, 'Expected <image> element to have ownerDocument')

					// Replace <image> with inline <svg>
					const embeddedSvgDocument = new DOMParser().parseFromString(
						await blob.text(),
						'image/svg+xml'
					) as XMLDocument
					const svgRoot = (embeddedSvgDocument.documentElement as Element) as SVGSVGElement
					svgRoot.setAttribute('x', element.getAttribute('x')!)
					svgRoot.setAttribute('y', element.getAttribute('y')!)
					svgRoot.setAttribute('width', element.getAttribute('width')!)
					svgRoot.setAttribute('height', element.getAttribute('height')!)
					svgRoot.remove()
					element.replaceWith(svgRoot)
					try {
						// Let handleSvgNode inline the <svg> into a simple <g>
						const svgDocument = element.ownerDocument
						const mount = svgDocument.createElementNS(svgNamespace, 'g')
						assert(element.id, '<image> element must have ID')
						handleSvgNode(svgRoot, {
							currentSvgParent: mount,
							svgDocument,
							idPrefix: `${element.id}-`,
							options: {
								// SVGs embedded through <img> are never interactive.
								keepLinks: false,
								captureArea: svgRoot.viewBox.baseVal,
							},
						})

						// Replace the <svg> element with the <g>
						mount.dataset.tag = 'img'
						mount.setAttribute('role', 'img')
						svgRoot.replaceWith(mount)
					} finally {
						svgRoot.remove()
					}
				} else {
					// Inline binary images as base64 data: URL
					const dataUrl = await blobToDataURL(blob)
					element.dataset.src = element.href.baseVal
					element.setAttribute('xlink:href', dataUrl.href)
				}
			} else if (isSVGStyleElement(element)) {
				try {
					const promises: Promise<void>[] = []
					// Walk the stylesheet and replace @font-face src URLs with data URIs
					const parsedSheet = postcss.parse(element.textContent ?? '')
					parsedSheet.walkAtRules('font-face', fontFaceRule => {
						fontFaceRule.walkDecls('src', sourceDeclaration => {
							const parsedSourceValue = cssValueParser(sourceDeclaration.value)
							parsedSourceValue.walk(node => {
								if (node.type === 'function' && node.value === 'url' && node.nodes[0]) {
									const urlArgumentNode = node.nodes[0]
									if (urlArgumentNode.type === 'string' || urlArgumentNode.type === 'word') {
										promises.push(inlineCssFontUrlArgumentNode(urlArgumentNode))
									}
								}
							})
							sourceDeclaration.value = cssValueParser.stringify(parsedSourceValue.nodes)
						})
					})
					await Promise.all(promises)
					// Update <style> element with updated CSS
					element.textContent = parsedSheet.toString()
				} catch (error) {
					console.error('Error inlining stylesheet', element.sheet, error)
				}
			}
		})().catch(error => {
			console.error('Error inlining resource for element', element, error)
		}),
	])
}

/**
 * Fetches the font from a `url()` CSS node and replaces it with a `data:` URI of the content.
 */
async function inlineCssFontUrlArgumentNode(
	urlArgumentNode: cssValueParser.StringNode | cssValueParser.WordNode
): Promise<void> {
	try {
		const url = new URL(unescapeStringValue(urlArgumentNode.value))
		const blob = await withTimeout(10000, `Timeout fetching ${url.href}`, () => fetchResource(url.href))
		if (
			!blob.type.startsWith('font/') &&
			!blob.type.startsWith('application/font-') &&
			!blob.type.startsWith('application/x-font-') &&
			!blob.type.startsWith('image/svg+xml') &&
			!blob.type.startsWith('application/vnd.ms-fontobject')
		) {
			throw new Error(
				`Invalid response MIME type inlining font at ${url.href}: Expected font MIME type, got ${blob.type}`
			)
		}
		const dataUrl = await blobToDataURL(blob)
		urlArgumentNode.value = dataUrl.href
	} catch (error) {
		console.error(`Error inlining ${urlArgumentNode.value}`, error)
	}
}

async function fetchResource(url: string): Promise<Blob> {
	assert(url, 'No URL passed')
	const headers = new Headers()
	const response = await fetch(url, { headers })
	if (!response.ok) {
		throw new Error(response.statusText)
	}
	const blob = await response.blob()
	return blob
}

async function blobToDataURL(blob: Blob): Promise<URL> {
	const reader = new FileReader()
	await new Promise<void>((resolve, reject) => {
		reader.addEventListener('error', () => reject(new Error('Error loading resource with FileLoader')))
		reader.addEventListener('load', () => resolve())
		reader.readAsDataURL(blob)
	})
	return new URL(reader.result as string)
}
