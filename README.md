# DOM to SVG

[![CI status](https://github.com/felixfbecker/dom-to-svg/workflows/test/badge.svg?branch=main)](https://github.com/felixfbecker/dom-to-svg/actions)

Library to convert a given HTML DOM node into an accessible SVG "screenshot".

## Usage

```js
import { documentToSVG, elementToSVG, inlineResources, formatXML } from 'dom-to-svg'

// Capture the whole document
const svgDocument = documentToSVG(document)

// Capture specific element
const svgDocument = elementToSVG(document.querySelector('#my-element'))

// Inline external resources (fonts, images, etc) as data: URIs
await inlineResources(svgDocument.documentElement)

// Get SVG string
const svgString = new XMLSerializer().serializeToString(formattedSvgDocument)
```

The output can be used as-is as valid SVG or easily passed to other packages to pretty-print or compress.

## Features

- Does NOT rely on `<foreignObject>` - SVGs will work in design tools like Illustrator, Figma etc.
- Maintains DOM accessibility tree by annotating SVG with correct ARIA attributes.
- Maintains interactive links.
- Maintains text to allow copying to clipboard.
- Can inline external resources like images, fonts, etc to make SVG self-contained.
- Maintains CSS stacking order of elements.
- Outputs debug attributes on SVG to trace elements back to their DOM nodes.

## Caveats

- Designed to run in the browser. Using JSDOM on the server will likely not work, but it can easily run inside Puppeteer.
