/* eslint-disable no-restricted-globals */
import { documentToSVG, inlineResources } from '../index'

async function main(): Promise<void> {
	console.log('Converting DOM to SVG')
	const svgDocument = documentToSVG(document)
	console.log('Inlining resources')
	await inlineResources(svgDocument.documentElement)
	console.log('Serializing SVG')
	const svgString = new XMLSerializer().serializeToString(svgDocument)
	console.log('Calling callback')
	resolveSVG(svgString)
}

main().catch(({ message, name, stack }) => rejectSVG({ message, name, stack }))
