import { writeFile } from 'fs/promises'
import { Server } from 'net'
import * as path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import * as util from 'util'

import { MODE, Polly } from '@pollyjs/core'
import FSPersister from '@pollyjs/persister-fs'
import { assert } from 'chai'
import delay from 'delay'
import ParcelBundler from 'parcel-bundler'
import pixelmatch from 'pixelmatch'
import { PNG } from 'pngjs'
import puppeteer, { ResourceType } from 'puppeteer'
import css from 'tagged-template-noop'
import formatXML from 'xml-formatter'

import { PuppeteerAdapter } from './PuppeteerAdapter.js'
import { createDeferred, readFileOrUndefined } from './util.js'

// Reduce log verbosity
util.inspect.defaultOptions.depth = 0
util.inspect.defaultOptions.maxStringLength = 80

Polly.register(PuppeteerAdapter as any)

declare global {
	function resolveSVG(svg: string): void
	function rejectSVG(error: unknown): void
}

const defaultViewport: puppeteer.Viewport = {
	width: 1200,
	height: 800,
}

const mode = (process.env.POLLY_MODE || 'replay') as MODE
console.log('Using Polly mode', mode)

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

describe('documentToSVG()', () => {
	let browser: puppeteer.Browser
	let server: Server
	before('Launch devserver', async () => {
		const bundler = new ParcelBundler(path.resolve(root, 'lib/test/injected-script.js'), {
			hmr: false,
			sourceMaps: false, // Workaround for "Unterminated regular expression" Parcel bug
			minify: false,
			autoInstall: false,
		})
		server = await bundler.serve(8080)
	})
	before('Launch browser', async () => {
		browser = await puppeteer.launch({
			headless: true,
			defaultViewport,
			devtools: true,
			args: [
				'--window-size=1920,1080',
				'--lang=en-US',
				'--disable-web-security',
				'--font-render-hinting=none',
				'--enable-font-antialiasing',
			],
			timeout: 0,
			// slowMo: 100,
		})
	})

	after('Close browser', () => browser?.close())
	after('Close devserver', done => server?.close(done))

	const snapshotDirectory = path.resolve(root, 'src/test/snapshots')
	const sites = [
		new URL('https://sourcegraph.com/search'),
		new URL('https://sourcegraph.com/extensions'),
		new URL('https://www.google.com?hl=en'),
		new URL('https://news.ycombinator.com'),
		new URL(
			'https://github.com/felixfbecker/dom-to-svg/blob/fee7e1e7b63c888bc1c5205126b05c63073ebdd3/.vscode/settings.json'
		),
	]
	for (const url of sites) {
		const encodedName = encodeURIComponent(url.href)
		const svgFilePath = path.resolve(snapshotDirectory, encodedName + '.svg')
		describe(url.href, () => {
			let polly: Polly
			let page: puppeteer.Page
			before('Open tab and setup Polly', async () => {
				page = await browser.newPage()
				await page.setRequestInterception(true)
				await page.setBypassCSP(true)
				// Prevent Google cookie consent prompt
				if (url.hostname.endsWith('google.com')) {
					await page.setCookie({ name: 'CONSENT', value: 'YES+DE.de+V14+BX', domain: '.google.com' })
				}
				await page.setExtraHTTPHeaders({
					'Accept-Language': 'en-US',
					DNT: '1',
				})
				page.on('console', message => {
					console.log('🖥  ' + (message.type() !== 'log' ? message.type().toUpperCase() : ''), message.text())
				})

				const requestResourceTypes: ResourceType[] = [
					'xhr',
					'fetch',
					'document',
					'script',
					'stylesheet',
					'image',
					'font',
					'other',
				]
				polly = new Polly(url.href, {
					mode,
					recordIfMissing: false,
					recordFailedRequests: true,
					flushRequestsOnStop: false,
					logging: false,
					adapters: [PuppeteerAdapter as any],
					adapterOptions: {
						puppeteer: {
							page,
							requestResourceTypes,
						},
					},
					// Very lenient, but pages often have very complex URL parameters and this usually works fine.
					matchRequestsBy: {
						method: true,
						body: false,
						url: {
							username: false,
							password: false,
							hostname: true,
							pathname: true,
							query: url.hostname !== 'www.google.com',
							hash: false,
						},
						order: false,
						headers: false,
					},
					persister: FSPersister,
					persisterOptions: {
						fs: {
							recordingsDir: path.resolve(root, 'src/test/recordings'),
						},
					},
				})
				polly.server.get('http://localhost:8080/*').passthrough()
				polly.server.get('data:*').passthrough()
				polly.server.any('https://sentry.io/*rest').intercept((request, response) => {
					response.sendStatus(204)
				})
				polly.server.any('https://www.googletagmanager.com/*').intercept((request, response) => {
					response.sendStatus(204)
				})
				polly.server.any('https://api.github.com/_private/*rest').intercept((request, response) => {
					response.sendStatus(204)
				})
				polly.server.any('https://collector.githubapp.com/*rest').intercept((request, response) => {
					response.sendStatus(204)
				})
				polly.server.any('https://www.google.com/gen_204').intercept((request, response) => {
					response.sendStatus(204)
				})
			})

			before('Go to page', async () => {
				await page.goto(url.href, {
					waitUntil: url.host === 'github.com' ? 'domcontentloaded' : 'networkidle2',
					timeout: 60000,
				})
				await page.waitForTimeout(2000)
				await page.mouse.click(0, 0)
				// Override system font to Arial to make screenshots deterministic cross-platform
				await page.addStyleTag({
					content: css`
						@font-face {
							font-family: system-ui;
							font-style: normal;
							font-weight: 300;
							src: local('Arial');
						}
						@font-face {
							font-family: -apple-system;
							font-style: normal;
							font-weight: 300;
							src: local('Arial');
						}
						@font-face {
							font-family: BlinkMacSystemFont;
							font-style: normal;
							font-weight: 300;
							src: local('Arial');
						}
					`,
				})
				// await new Promise<never>(() => {})
			})

			after('Stop Polly', () => polly?.stop())
			after('Close page', () => page?.close())

			let svgPage: puppeteer.Page
			before('Produce SVG', async () => {
				const svgDeferred = createDeferred<string>()
				await page.exposeFunction('resolveSVG', svgDeferred.resolve)
				await page.exposeFunction('rejectSVG', svgDeferred.reject)
				const injectedScriptUrl = 'http://localhost:8080/injected-script.js'
				await page.addScriptTag({ url: injectedScriptUrl })
				const generatedSVGMarkup = await Promise.race([
					svgDeferred.promise.catch(({ message, ...error }) =>
						Promise.reject(Object.assign(new Error(message), error))
					),
					delay(120000).then(() => Promise.reject(new Error('Timeout generating SVG'))),
				])
				console.log('Formatting SVG')
				const generatedSVGMarkupFormatted = formatXML(generatedSVGMarkup)
				await writeFile(svgFilePath, generatedSVGMarkupFormatted)
				svgPage = await browser.newPage()
				await svgPage.goto(pathToFileURL(svgFilePath).href)
				// await new Promise<never>(() => {})
			})
			after('Close SVG page', () => svgPage?.close())

			it('produces SVG that is visually the same', async () => {
				console.log('Bringing page to front')
				await page.bringToFront()
				console.log('Snapshotting the original page')
				const expectedScreenshot = await page.screenshot({ encoding: 'binary', type: 'png', fullPage: false })
				await writeFile(path.resolve(snapshotDirectory, `${encodedName}.expected.png`), expectedScreenshot)
				console.log('Snapshotting the SVG')
				const actualScreenshot = await svgPage.screenshot({ encoding: 'binary', type: 'png', fullPage: false })
				await writeFile(path.resolve(snapshotDirectory, `${encodedName}.actual.png`), actualScreenshot)
				console.log('Snapshotted, comparing PNGs')

				const expectedPNG = PNG.sync.read(expectedScreenshot)
				const actualPNG = PNG.sync.read(actualScreenshot)
				const { width, height } = expectedPNG
				const diffPNG = new PNG({ width, height })

				const differentPixels = pixelmatch(expectedPNG.data, actualPNG.data, diffPNG.data, width, height, {
					threshold: 0.3,
				})
				const differenceRatio = differentPixels / (width * height)

				const diffPngBuffer = PNG.sync.write(diffPNG)
				await writeFile(path.resolve(snapshotDirectory, `${encodedName}.diff.png`), diffPngBuffer)

				if (process.env.TERM_PROGRAM === 'iTerm.app') {
					const nameBase64 = Buffer.from(encodedName + '.diff.png').toString('base64')
					const diffBase64 = diffPngBuffer.toString('base64')
					console.log(`\u001B]1337;File=name=${nameBase64};inline=1;width=1080px:${diffBase64}\u0007`)
				}

				const differencePercentage = differenceRatio * 100

				console.log('Difference', differencePercentage.toFixed(2) + '%')

				assert.isBelow(differencePercentage, 0.5) // %
			})

			it('produces SVG with the expected accessibility tree', async function () {
				const snapshotPath = path.resolve(snapshotDirectory, encodedName + '.a11y.json')
				const expectedAccessibilityTree = await readFileOrUndefined(snapshotPath)
				const actualAccessibilityTree = await svgPage.accessibility.snapshot()
				await writeFile(snapshotPath, JSON.stringify(actualAccessibilityTree, null, 2))
				if (!expectedAccessibilityTree) {
					this.skip()
				}
				assert.deepStrictEqual(
					actualAccessibilityTree,
					JSON.parse(expectedAccessibilityTree),
					'Expected accessibility tree to be the same as snapshot'
				)
			})
		})
	}
})
