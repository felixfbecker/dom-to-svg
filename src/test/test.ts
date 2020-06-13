import puppeteer from 'puppeteer'
import * as path from 'path'
import { writeFile, readFile } from 'fs/promises'
import { createConfig, startServer } from 'es-dev-server'
import chokidar from 'chokidar'
import { Server } from 'net'
import { readFileSync, readdirSync } from 'fs'
import { pathToFileURL } from 'url'

declare global {
	function svgCallback(svg: string): void
}

const createDeferred = <T>(): {
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

describe('documentToSVG()', () => {
	let browser: puppeteer.Browser
	let server: Server
	before('Launch devserver', async () => {
		const fileWatcher = chokidar.watch([path.resolve(__dirname, '../**/*.js')])
		const config = createConfig({
			nodeResolve: true,
			port: 8080,
			middlewares: [
				async ({ request, response }, next) => {
					response.set('Access-Control-Allow-Origin', request.get('Origin'))
					await next()
				},
			],
		})
		;({ server } = await startServer(config, fileWatcher))
	})
	before('Launch browser', async () => {
		browser = await puppeteer.launch({
			headless: false,
			defaultViewport: null,
			devtools: true,
			args: ['--window-size=1920,1080'],
			timeout: 0,
		})
	})

	after('Close browser', () => browser?.close())
	after('Close devserver', done => server?.close(done))

	const fixtures = readdirSync(path.resolve(__dirname, 'fixtures'))
	for (const fixture of fixtures) {
		const url = new URL(decodeURIComponent(path.basename(fixture, '.html')))
		const encodedName = encodeURIComponent(url.href)
		describe(url.href, () => {
			it('produces expected SVG', async () => {
				const page = await browser.newPage()
				page.on('console', message => {
					console.log('Browser console:', message.type().toUpperCase(), message.text())
				})
				const injectedScriptUrl = 'http://localhost:8080/lib/test/injected-script.js'
				const svgDeferred = createDeferred<string>()
				await page.goto(url.href, { timeout: 0, waitUntil: 'networkidle2' })

				await page.screenshot({ path: path.resolve(__dirname, 'snapshots', encodedName + '.expected.png') })
				const expectedAccessibilityTree = await page.accessibility.snapshot({
					interestingOnly: false,
				})
				await writeFile(
					path.resolve(__dirname, 'snapshots', encodedName + '.expected.a11y.json'),
					JSON.stringify(expectedAccessibilityTree, null, 2)
				)

				await page.exposeFunction('svgCallback', svgDeferred.resolve)
				await page.addScriptTag({ type: 'module', url: injectedScriptUrl })
				const svg = await svgDeferred.promise
				const svgFilePath = path.resolve(__dirname, 'snapshots', encodedName + '.svg')
				await writeFile(svgFilePath, svg)
				console.log('SVG saved', svgFilePath)

				const svgPage = await browser.newPage()
				await svgPage.goto(pathToFileURL(svgFilePath).href)
				await svgPage.screenshot({ path: path.resolve(__dirname, 'snapshots', encodedName + '.actual.png') })

				// await new Promise(() => {})
				const actualAccessibilityTree = await svgPage.accessibility.snapshot({
					interestingOnly: false,
				})
				await writeFile(
					path.resolve(__dirname, 'snapshots', encodedName + '.actual.a11y.json'),
					JSON.stringify(actualAccessibilityTree, null, 2)
				)
			})
		})
	}
})
