import puppeteer from 'puppeteer'
import { writeFile } from 'fs/promises'
import * as path from 'path'

async function main(): Promise<void> {
	const browser = await puppeteer.launch({ defaultViewport: null })
	try {
		const page = await browser.newPage()
		const url = new URL(process.argv[2])
		console.log('Navigating to', url.href)
		await page.goto(url.href, { waitUntil: 'networkidle2' })
		const html = await page.evaluate(() => document.documentElement.outerHTML)
		await writeFile(path.resolve(__dirname, 'fixtures', encodeURIComponent(url.href) + '.html'), html)
		console.log('Saved')
	} finally {
		await browser.close()
	}
}

main().catch(error => {
	process.exitCode = 1
	console.error(error)
})
