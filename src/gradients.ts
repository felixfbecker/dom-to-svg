/* eslint-disable id-length */
import * as gradientParser from 'gradient-parser'

import { svgNamespace } from './dom.js'
import { TraversalContext } from './traversal.js'

const positionsForOrientation = (
	orientation: gradientParser.Gradient['orientation']
): Record<'x1' | 'x2' | 'y1' | 'y2', string> => {
	const positions = {
		x1: '0%',
		x2: '0%',
		y1: '0%',
		y2: '0%',
	}

	if (orientation?.type === 'angular') {
		const anglePI = orientation.value * (Math.PI / 180)
		positions.x1 = `${Math.round(50 + Math.sin(anglePI + Math.PI) * 50)}%`
		positions.y1 = `${Math.round(50 + Math.cos(anglePI) * 50)}%`
		positions.x2 = `${Math.round(50 + Math.sin(anglePI) * 50)}%`
		positions.y2 = `${Math.round(50 + Math.cos(anglePI + Math.PI) * 50)}%`
	} else if (orientation?.type === 'directional') {
		switch (orientation.value) {
			case 'left':
				positions.x1 = '100%'
				break

			case 'top':
				positions.y1 = '100%'
				break

			case 'right':
				positions.x2 = '100%'
				break

			case 'bottom':
				positions.y2 = '100%'
				break
		}
	}

	return positions
}

export function convertLinearGradient(
	css: string,
	{ svgDocument }: Pick<TraversalContext, 'svgDocument'>
): SVGLinearGradientElement {
	const { orientation, colorStops } = gradientParser.parse(css)[0]!
	const { x1, x2, y1, y2 } = positionsForOrientation(orientation)

	const getColorStops = (colorStop: gradientParser.ColorStop, index: number): SVGStopElement => {
		const offset = `${(index / (colorStops.length - 1)) * 100}%`
		let stopColor = 'rgb(0,0,0)'
		let stopOpacity = 1

		switch (colorStop.type) {
			case 'rgb': {
				const [red, green, blue] = colorStop.value
				stopColor = `rgb(${red},${green},${blue})`
				break
			}

			case 'rgba': {
				const [red, green, blue, alpha] = colorStop.value
				stopColor = `rgb(${red},${green},${blue})`
				stopOpacity = alpha
				break
			}

			case 'hex': {
				stopColor = `#${colorStop.value}`
				break
			}

			case 'literal': {
				stopColor = colorStop.value
				break
			}
		}

		const stop = svgDocument.createElementNS(svgNamespace, 'stop')
		stop.setAttribute('offset', offset)
		stop.setAttribute('stop-color', stopColor)
		stop.setAttribute('stop-opacity', stopOpacity.toString())
		return stop
	}

	const linearGradient = svgDocument.createElementNS(svgNamespace, 'linearGradient')
	linearGradient.setAttribute('x1', x1)
	linearGradient.setAttribute('y1', y1)
	linearGradient.setAttribute('x2', x2)
	linearGradient.setAttribute('y2', y2)
	linearGradient.append(...colorStops.map(getColorStops))

	return linearGradient
}
