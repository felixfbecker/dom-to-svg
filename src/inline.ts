export async function fetchAsDataURL(url: string): Promise<URL> {
	const response = await fetch(url)
	if (!response.ok) {
		throw new Error(response.statusText)
	}
	const blob = await response.blob()
	const reader = new FileReader()
	await new Promise<void>((resolve, reject) => {
		reader.addEventListener('error', () => reject(new Error('Error loading image')))
		reader.addEventListener('load', () => resolve())
		reader.readAsDataURL(blob)
	})
	return new URL(reader.result as string)
}
