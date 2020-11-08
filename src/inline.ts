import { is as isContentType } from 'type-is'

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
