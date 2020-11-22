import { isCSSFontFaceRule, unescapeStringValue } from './css'
import { isSVGImageElement, isSVGStyleElement, svgNamespace } from './dom'
import { withTimeout, assert } from './util'
import cssValueParser from 'postcss-value-parser'
import { handleSvgNode } from './svg'

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
	if (isSVGImageElement(element)) {
		const blob = await withTimeout(5000, `Timeout fetching ${element.href.baseVal}`, () =>
			fetchResource(element.href.baseVal)
		)
		if (!blob.type.startsWith('image/')) {
			throw new Error(`Invalid response type: Expected image/* response, got ${blob.type}`)
		}
		if (blob.type === 'image/svg+xml') {
			// If the image is an SVG, inline it into the output SVG.
			// Some tools (e.g. Figma) do not support nested SVG.

			assert(element.ownerDocument, 'Expected <image> element to have ownerDocument')

			// Replace <image> with inline <svg>
			const embeddedSvgDocument = new DOMParser().parseFromString(
				await blob.text(),
				'image/svg+xml'
			) as XMLDocument
			const svgRoot = embeddedSvgDocument.documentElement
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
				handleSvgNode(svgRoot, { currentSvgParent: mount, svgDocument })

				// Replace the <svg> element with the <g>
				mount.dataset.tag = 'image'
				mount.setAttribute('role', 'img')
				svgRoot.replaceWith(mount)
			} finally {
				svgRoot.remove()
			}
		} else {
			// Inline binary images as base64 data: URL
			const dataUrl = await blobToDataURL(blob)
			element.dataset.src = element.href.baseVal
			element.setAttribute('href', dataUrl.href)
		}
	} else if (isSVGStyleElement(element) && element.sheet) {
		try {
			const rules = element.sheet.cssRules
			for (const rule of rules) {
				if (isCSSFontFaceRule(rule)) {
					const parsedSourceValue = cssValueParser(rule.style.src)
					const promises: Promise<void>[] = []
					parsedSourceValue.walk(node => {
						if (node.type === 'function' && node.value === 'url' && node.nodes[0]) {
							const urlArgumentNode = node.nodes[0]
							if (urlArgumentNode.type === 'string' || urlArgumentNode.type === 'word') {
								const url = new URL(unescapeStringValue(urlArgumentNode.value))
								promises.push(
									(async () => {
										const blob = await withTimeout(5000, `Timeout fetching ${url.href}`, () =>
											fetchResource(url.href)
										)
										if (!blob.type.startsWith('font/')) {
											throw new Error(
												`Invalid response type: Expected font/* response, got ${blob.type}`
											)
										}
										const dataUrl = await blobToDataURL(blob)
										urlArgumentNode.value = dataUrl.href
									})()
								)
							}
						}
					})
					await Promise.all(promises)
					rule.style.src = cssValueParser.stringify(parsedSourceValue.nodes)
				}
			}
		} catch (error) {
			console.error('Error inlining stylesheet', element.sheet, error)
		}
	}
	await Promise.all([...element.children].map(inlineResources))
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
