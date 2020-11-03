import { documentToSVG, inlineResources } from '../index'
import formatXML from 'xml-formatter'

async function main(): Promise<void> {
	// eslint-disable-next-line no-restricted-globals
	const svgDocument = documentToSVG(document)
	await inlineResources(svgDocument.documentElement)
	const svgString = new XMLSerializer().serializeToString(svgDocument)
	const formattedSvgString = formatXML(svgString)
	svgCallback(formattedSvgString)
}
// eslint-disable-next-line @typescript-eslint/no-floating-promises
main()
