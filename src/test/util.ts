import { readFile } from 'fs/promises'

import { Page } from 'puppeteer'

export const createDeferred = <T>(): {
	promise: Promise<T>
	resolve: (value: T) => void
	reject: (value: unknown) => void
} => {
	let resolve!: (value: T) => void
	let reject!: (value: unknown) => void
	const promise = new Promise<T>((resolve_, reject_) => {
		resolve = resolve_
		reject = reject_
	})
	return { promise, resolve, reject }
}

export function forwardBrowserLogs(page: Page): void {
	page.on('console', message => {
		console.log('Browser console:', message.type().toUpperCase(), message.text())
	})
	page.on('error', error => {
		console.error(error)
	})
	page.on('pageerror', error => {
		console.error(error)
	})
}

export async function readFileOrUndefined(filePath: string): Promise<string | undefined> {
	try {
		return await readFile(filePath, 'utf-8')
	} catch (error) {
		if (error.code === 'ENOENT') {
			return undefined
		}
		throw error
	}
}
