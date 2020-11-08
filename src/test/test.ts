import puppeteer, { ResourceType } from 'puppeteer'
import * as path from 'path'
import { writeFile, readFile, mkdir } from 'fs/promises'
import { Server } from 'net'
import { pathToFileURL } from 'url'
import { Polly } from '@pollyjs/core'
import { PuppeteerAdapter } from './PuppeteerAdapter'
import { createDeferred, readFileOrUndefined } from './util'
import FSPersister from '@pollyjs/persister-fs'
import { assert } from 'chai'
import { PNG } from 'pngjs'
import pixelmatch from 'pixelmatch'
import ParcelBundler from 'parcel-bundler'
import * as util from 'util'
import delay from 'delay'
import formatXML from 'xml-formatter'

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

const root = path.resolve(__dirname, '..', '..')

describe('documentToSVG()', () => {
	let browser: puppeteer.Browser
	let server: Server
	before('Launch devserver', async () => {
		const bundler = new ParcelBundler(path.resolve(root, 'src/test/injected-script.ts'), {
			hmr: false,
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
		new URL('https://www.google.com?hl=en'),
		new URL('https://news.ycombinator.com'),
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
					mode: 'replay',
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
							query: false,
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
				polly.server.any('https://sentry.io/*').intercept((request, response) => {
					response.sendStatus(204)
				})
				polly.server.any('https://www.googletagmanager.com/*').intercept((request, response) => {
					response.sendStatus(204)
				})
				polly.server.any('https://sourcegraph.com/.api/graphql?logEvent').intercept((request, response) => {
					response.status(200).type('application/json').send('{}')
				})
			})

			before('Go to page', async () => {
				await page.goto(url.href)
				await page.waitForTimeout(1000)
				await page.mouse.click(0, 0)
			})

			after('Stop Polly', () => polly?.stop())
			after('Close page', () => page?.close())

			let snapshottedSVGMarkup: string | undefined
			let generatedSVGMarkupFormatted: string
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
					delay(60000).then(() => Promise.reject(new Error('Timeout generating SVG'))),
				])
				console.log('Formatting SVG')
				generatedSVGMarkupFormatted = formatXML(generatedSVGMarkup)
				snapshottedSVGMarkup = await readFileOrUndefined(svgFilePath)
				await writeFile(svgFilePath, generatedSVGMarkupFormatted)
				svgPage = await browser.newPage()
				await svgPage.goto(pathToFileURL(svgFilePath).href)
			})
			after('Close SVG page', () => svgPage?.close())

			it('produces expected SVG markup', function () {
				if (!snapshottedSVGMarkup) {
					this.skip()
				}
				assert.strictEqual(
					generatedSVGMarkupFormatted,
					snapshottedSVGMarkup,
					'Expected SVG markup to be the same as snapshot'
				)
			})

			it('produces SVG that is visually the same', async () => {
				console.log('Bringing page to front')
				await page.bringToFront()
				console.log('Snapshotting the original page')
				const expectedScreenshot = await page.screenshot({ encoding: 'binary', type: 'png', fullPage: true })
				await mkdir(path.resolve(root, 'src/test/screenshots'), { recursive: true })
				await writeFile(
					path.resolve(root, `src/test/screenshots/${encodedName}.expected.png`),
					expectedScreenshot
				)
				console.log('Snapshotting the SVG')
				const actualScreenshot = await svgPage.screenshot({ encoding: 'binary', type: 'png', fullPage: true })
				await writeFile(path.resolve(root, `src/test/screenshots/${encodedName}.actual.png`), actualScreenshot)
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
				await writeFile(path.resolve(root, `src/test/screenshots/${encodedName}.diff.png`), diffPngBuffer)

				if (process.env.TERM_PROGRAM === 'iTerm.app') {
					const nameBase64 = Buffer.from(encodedName + '.diff.png').toString('base64')
					const diffBase64 = diffPngBuffer.toString('base64')
					console.log(`\u001B]1337;File=name=${nameBase64};inline=1;width=1080px:${diffBase64}\u0007`)
				}

				console.log('Difference', (differenceRatio * 100).toFixed(2) + '%')

				// TODO lower threshold as output becomes more accurate.
				assert.isBelow(differenceRatio, 0.1)
			})

			it('produces SVG with the expected accessibility tree', async function () {
				const snapshotPath = path.resolve(snapshotDirectory, encodedName + '.a11y.json')
				const expectedAccessibilityTree = await readFileOrUndefined(snapshotPath)
				const actualAccessibilityTree = await svgPage.accessibility.snapshot({
					// This would exclude text nodes, which we want to capture.
					interestingOnly: false,
				})
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
