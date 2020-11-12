/* eslint-disable no-restricted-globals */
import { documentToSVG, inlineResources } from '../index.js'

async function main(): Promise<void> {
	console.log('Converting DOM to SVG')
	const svgDocument = documentToSVG(document)

	console.log('Inlining resources')
	const svgRootElement = svgDocument.documentElement
	// Append to DOM so SVG elements are attached to a window/have defaultView, so window.getComputedStyle() works
	document.body.prepend(svgRootElement)
	try {
		await inlineResources(svgRootElement)
	} finally {
		svgRootElement.remove()
	}

	console.log('Serializing SVG')
	const svgString = new XMLSerializer().serializeToString(svgRootElement)

	console.log('Calling callback')
	resolveSVG(svgString)
}

main().catch(error => {
	console.error(error)
	const { message, name, stack } = error
	rejectSVG({ message, name, stack })
})
