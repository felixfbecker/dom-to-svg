import { documentToSVG, inlineResources } from '../index.js'
import { formatXML } from '../serialize.js'

async function main(): Promise<void> {
	// eslint-disable-next-line no-restricted-globals
	const svgDocument = documentToSVG(document)
	await inlineResources(svgDocument.documentElement)
	const formattedSVGDocument = formatXML(svgDocument)
	const svgString = new XMLSerializer().serializeToString(formattedSVGDocument)
	svgCallback(svgString)
}
// eslint-disable-next-line @typescript-eslint/no-floating-promises
main()
