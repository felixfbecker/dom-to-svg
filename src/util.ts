export const createCounter = (): (() => number) => {
	let count = 0
	return () => ++count
}

export const isDefined = <T>(value: T): value is NonNullable<T> => value !== null && value !== undefined
