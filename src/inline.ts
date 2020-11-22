import { is as isContentType } from 'type-is'
import { isCSSFontFaceRule, unescapeStringValue } from './css'
import { isSVGImageElement, isSVGStyleElement } from './dom'
import { withTimeout } from './util'
import cssValueParser from 'postcss-value-parser'

declare global {
	interface SVGStyleElement extends LinkStyle {}
}

export interface InlineResourcesOptions {
	fetchAsDataURL?: (url: string) => Promise<URL>
}

export async function inlineResources(element: Element, options: InlineResourcesOptions = {}): Promise<void> {
	const { fetchAsDataURL: customFetchAsDataURL = fetchAsDataURL } = options
	if (isSVGImageElement(element)) {
		const dataURL = await withTimeout(5000, `Timeout fetching ${element.href.baseVal}`, () =>
			customFetchAsDataURL(element.href.baseVal)
		)
		element.dataset.src = element.href.baseVal
		element.setAttribute('href', dataURL.href)
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
										const dataUrl = await withTimeout(5000, `Timeout fetching ${url.href}`, () =>
											customFetchAsDataURL(url.href)
										)
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
	await Promise.all([...element.children].map(element => inlineResources(element, options)))
}

export interface FetchAsDataURLOptions {
	accept?: string[]
}

export async function fetchAsDataURL(url: string, options: FetchAsDataURLOptions = {}): Promise<URL> {
	if (!url) {
		throw new Error('No URL passed')
	}
	const headers = new Headers()
	if (options.accept) {
		headers.set('Accept', options.accept.join(', '))
	}
	const response = await fetch(url, { headers })
	if (!response.ok) {
		throw new Error(response.statusText)
	}
	const contentType = response.headers.get('Content-Type')
	// Do an additional client-side check, in case the server does not handle the Accept header.
	if (options.accept && (!contentType || !isContentType(contentType, options.accept))) {
		throw new Error(`Content-Type not accepted: ${String(contentType)}`)
	}
	const blob = await response.blob()
	const reader = new FileReader()
	await new Promise<void>((resolve, reject) => {
		reader.addEventListener('error', () => reject(new Error('Error loading resource with FileLoader')))
		reader.addEventListener('load', () => resolve())
		reader.readAsDataURL(blob)
	})
	return new URL(reader.result as string)
}
