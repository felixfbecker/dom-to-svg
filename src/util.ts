export const createCounter = (): (() => number) => {
	let count = 0
	return () => ++count
}

export const isDefined = <T>(value: T): value is NonNullable<T> => value !== null && value !== undefined

/**
 * Check if two rectangles (e.g. an element and the capture area) intersect.
 */
export const doRectanglesIntersect = (a: DOMRectReadOnly, b: DOMRectReadOnly): boolean =>
	!(
		a.bottom < b.top || // A is above B
		a.top > b.bottom || // A is below B
		a.right < b.left || // A is left of B
		// A is right of B
		a.left > b.right
	)
