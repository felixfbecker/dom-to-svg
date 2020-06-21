import puppeteer from 'puppeteer'
import * as path from 'path'
import { writeFile, readFile } from 'fs/promises'
import { createConfig, startServer } from 'es-dev-server'
import { Server } from 'net'
import { pathToFileURL } from 'url'
import { Polly } from '@pollyjs/core'
import PuppeteerAdapter from '@pollyjs/adapter-puppeteer'
import { createDeferred, readFileOrUndefined } from './util'
import FSPersister from '@pollyjs/persister-fs'
import { assert } from 'chai'
import { PNG } from 'pngjs'
import pixelmatch from 'pixelmatch'

declare global {
	function svgCallback(svg: string): void
}

const defaultViewport: puppeteer.Viewport = {
	width: 1200,
	height: 800,
}

describe('documentToSVG()', () => {
	let browser: puppeteer.Browser
	let server: Server
	before('Launch devserver', async () => {
		const config = createConfig({
			nodeResolve: true,
			port: 8080,
			middlewares: [
				async ({ request, response }, next) => {
					response.set('Access-Control-Allow-Origin', '*')
					response.set('Cache-Control', 'no-store')
					await next()
				},
			],
		})
		;({ server } = await startServer(config))
	})
	before('Launch browser', async () => {
		browser = await puppeteer.launch({
			headless: false,
			defaultViewport,
			devtools: true,
			args: ['--window-size=1920,1080'],
			timeout: 0,
		})
	})

	after('Close browser', () => browser?.close())
	after('Close devserver', done => server?.close(done))

	const snapshotDirectory = path.resolve(__dirname, 'snapshots')
	const sites = [
		new URL('https://sourcegraph.com/search'),
		new URL('https://google.com'),
		new URL('https://news.ycombinator.com'),
	]
	for (const url of sites) {
		const encodedName = encodeURIComponent(url.href)
		const svgFilePath = path.resolve(snapshotDirectory, encodedName + '.svg')
		describe(url.href, () => {
			let polly: Polly
			let page: puppeteer.Page
			before(async () => {
				page = await browser.newPage()
				await page.setRequestInterception(true)
				await page.setBypassCSP(true)
				polly = new Polly(url.href, {
					// recordIfMissing: false,
					recordFailedRequests: true,
					adapters: [PuppeteerAdapter],
					adapterOptions: {
						puppeteer: { page },
					},
					persister: FSPersister,
					persisterOptions: {
						fs: {
							recordingsDir: path.resolve(__dirname, 'recordings'),
						},
					},
				})
				polly.server.get('http://localhost:8080/*').passthrough()
				polly.replay()
				await page.goto(url.href)
				await page.waitFor(1000)
				await page.mouse.click(0, 0)
			})
			after('Closing page', () => page?.close())
			after('Stop Polly', () => polly?.stop())

			let snapshottedSVGMarkup: string | undefined
			let generatedSVGMarkup: string
			let svgPage: puppeteer.Page
			before('Produce SVG', async () => {
				const svgDeferred = createDeferred<string>()
				await page.exposeFunction('svgCallback', svgDeferred.resolve)
				const injectedScriptUrl = 'http://localhost:8080/lib/test/injected-script.js'
				await page.addScriptTag({ type: 'module', url: injectedScriptUrl })
				generatedSVGMarkup = await svgDeferred.promise
				snapshottedSVGMarkup = await readFileOrUndefined(svgFilePath)
				await writeFile(svgFilePath, generatedSVGMarkup)
				svgPage = await browser.newPage()
				await svgPage.goto(pathToFileURL(svgFilePath).href)
			})
			after('Closing SVG page', () => svgPage?.close())

			it('produces expected SVG markup', async function () {
				if (!snapshottedSVGMarkup) {
					this.skip()
				}
				assert.equal(generatedSVGMarkup, snapshottedSVGMarkup)
			})

			it('produces SVG that is visually the same', async () => {
				const expectedScreenshot = await page.screenshot({ encoding: 'binary', type: 'png', fullPage: true })
				const actualScreenshot = await svgPage.screenshot({ encoding: 'binary', type: 'png', fullPage: true })

				const expectedPNG = PNG.sync.read(expectedScreenshot)
				const actualPNG = PNG.sync.read(actualScreenshot)
				const { width, height } = expectedPNG
				const diffPNG = new PNG({ width, height })

				const differentPixels = pixelmatch(expectedPNG.data, actualPNG.data, diffPNG.data, width, height, {
					threshold: 0.3,
				})
				const differenceRatio = differentPixels / (width * height)

				if (process.env.TERM_PROGRAM === 'iTerm.app') {
					const nameBase64 = Buffer.from(encodedName + '.diff.png').toString('base64')
					const diffBase64 = PNG.sync.write(diffPNG).toString('base64')
					console.log(`\u001B]1337;File=name=${nameBase64};inline=1;width=1080px:${diffBase64}\u0007`)
				}

				console.log('Difference', (differenceRatio * 100).toFixed(2) + '%')

				assert.isBelow(differenceRatio, 0.1)
			})

			it('produces SVG with the expected accessibility tree', async function () {
				const snapshotPath = path.resolve(snapshotDirectory, encodedName + '.a11y.json')
				const expectedAccessibilityTree = await readFileOrUndefined(snapshotPath)
				const actualAccessibilityTree = await svgPage.accessibility.snapshot({
					interestingOnly: false,
				})
				await writeFile(snapshotPath, JSON.stringify(actualAccessibilityTree, null, 2))
				if (!expectedAccessibilityTree) {
					this.skip()
				}
				assert.deepStrictEqual(actualAccessibilityTree, JSON.parse(expectedAccessibilityTree))
			})
		})
	}
})
