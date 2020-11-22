export const createIdGenerator = (): ((prefix: string) => string) => {
	const nextCounts = new Map<string, number>()
	return prefix => {
		const count = nextCounts.get(prefix) ?? 1
		nextCounts.set(prefix, count + 1)
		return `${prefix}${count}`
	}
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

/**
 * Calculates the length of the diagonale of a given rectangle.
 */
export function diagonale(box: DOMRectReadOnly): number {
	return Math.sqrt(box.width ** 2 + box.height ** 2)
}

export function withTimeout<T>(timeout: number, message: string, func: () => Promise<T>): Promise<T> {
	return Promise.race([
		func(),
		new Promise<never>((resolve, reject) => setTimeout(() => reject(new Error(message)), timeout)),
	])
}

/**
 * Type guard to check if an object is a specific member of a tagged union type.
 *
 * @param key The key to check
 * @param value The value the key has to be.
 */
export const isTaggedUnionMember = <T extends object, K extends keyof T, V extends T[K]>(key: K, value: V) => (
	object: T
): object is T & Record<K, V> => object[key] === value

export function assert(condition: any, message: string): asserts condition {
	if (!condition) {
		throw new Error(message)
	}
}
