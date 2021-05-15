import { hasLabels, isHTMLElement } from './dom.js'
import { TraversalContext } from './traversal.js'

const isStandaloneFooter = (element: Element): boolean =>
	!element.closest(
		'article, aside, main, nav, section, [role="article"], [role="complementary"], [role="main"], [role="navigation"], [role="region"]'
	)

export function getAccessibilityAttributes(
	element: Element,
	{ labels, getUniqueId }: Pick<TraversalContext, 'labels' | 'getUniqueId'>
): Map<string, string> {
	// https://www.w3.org/TR/html-aria/
	const attributes = new Map<string, string>()
	switch (element.tagName) {
		case 'A':
			attributes.set('role', 'link')
			break
		case 'ARTICLE':
			attributes.set('role', 'article')
			break
		case 'ASIDE':
			attributes.set('role', 'complementary')
			break
		case 'BODY':
			attributes.set('role', 'document')
			break
		case 'BUTTON':
		case 'SUMMARY':
			attributes.set('role', 'button')
			break
		case 'DD':
			attributes.set('role', 'definition')
			break
		case 'DETAILS':
			attributes.set('role', 'group')
			break
		case 'DFN':
			attributes.set('role', 'term')
			break
		case 'DIALOG':
			attributes.set('role', 'dialog')
			break
		case 'DT':
			attributes.set('role', 'term')
			break
		case 'FIELDSET':
			attributes.set('role', 'group')
			break
		case 'FIGURE':
			attributes.set('role', 'figure')
			break
		case 'FOOTER':
			if (isStandaloneFooter(element)) {
				attributes.set('role', 'contentinfo')
			}
			break
		case 'FORM':
			attributes.set('role', 'form')
			break
		case 'H1':
		case 'H2':
		case 'H3':
		case 'H4':
		case 'H5':
		case 'H6':
			attributes.set('role', 'heading')
			attributes.set('aria-level', element.tagName.slice(1))
			break
		case 'HEADER':
			if (isStandaloneFooter(element)) {
				attributes.set('role', 'banner')
			}
			break
		case 'HR':
			attributes.set('role', 'separator')
			break
		case 'IMG': {
			const alt = element.getAttribute('alt')
			if (alt === null || alt !== '') {
				attributes.set('role', 'img')
				if (alt) {
					attributes.set('aria-label', alt)
				}
			}
			break
		}
		case 'INPUT':
			switch ((element as HTMLInputElement).type) {
				case 'button':
				case 'image':
				case 'reset':
				case 'submit':
					attributes.set('role', 'button')
					break
				case 'number':
					attributes.set('role', 'spinbutton')
					break
				case 'range':
					attributes.set('role', 'slider')
					break
				case 'checkbox':
					attributes.set('role', 'checkbox')
					break
				case 'radio':
					attributes.set('role', 'radio')
					break
				case 'email':
				case 'tel':
					if (!element.hasAttribute('list')) {
						attributes.set('role', 'textbox')
					}
					break
			}
			break
		case 'LI':
			if (
				element.parentElement?.tagName === 'OL' ||
				element.parentElement?.tagName === 'UL' ||
				element.parentElement?.tagName === 'MENU'
			) {
				attributes.set('role', 'listitem')
			}
			break
		case 'LINK':
			if ((element as HTMLLinkElement).href) {
				attributes.set('role', 'link')
			}
			break
		case 'MAIN':
			attributes.set('role', 'main')
			break
		case 'MATH':
			attributes.set('role', 'math')
			break
		case 'OL':
		case 'UL':
		case 'MENU':
			attributes.set('role', 'list')
			break
		case 'NAV':
			attributes.set('role', 'navigation')
			break
		case 'OPTION':
			attributes.set('role', 'option')
			break
		case 'PROGRESS':
			attributes.set('role', 'progressbar')
			break
		case 'SECTION':
			attributes.set('role', 'region')
			break
		case 'SELECT':
			attributes.set(
				'role',
				!element.hasAttribute('multiple') && (element as HTMLSelectElement).size <= 1 ? 'combobox' : 'listbox'
			)
			break
		case 'TABLE':
			attributes.set('role', 'table')
			break
		case 'THEAD':
		case 'TBODY':
		case 'TFOOT':
			attributes.set('role', 'rowgroup')
			break
		case 'TEXTAREA':
			attributes.set('role', 'textbox')
			break
		case 'TD':
			attributes.set('role', 'cell')
			break
		case 'TH':
			attributes.set('role', element.closest('thead') ? 'columnheader' : 'rowheader')
			break
		case 'TR':
			attributes.set('role', 'tablerow')
			break
	}
	if (element.hasAttribute('disabled')) {
		attributes.set('aria-disabled', 'true')
	}
	if (element.hasAttribute('placeholder')) {
		attributes.set('aria-placeholder', element.getAttribute('placeholder') || '')
	}
	const tabIndex = element.getAttribute('tabindex')
	if (tabIndex) {
		attributes.set('tabindex', tabIndex)
	}
	if (isHTMLElement(element) && hasLabels(element) && element.labels) {
		// Need to invert the label[for] / [aria-labelledby] relationship
		attributes.set(
			'aria-labelledby',
			[...element.labels]
				.map(label => {
					let labelId = label.id || labels.get(label)
					if (!labelId) {
						labelId = getUniqueId('label')
						labels.set(label, labelId)
					}
					return labelId
				})
				.join(' ')
		)
	}

	for (const attribute of element.attributes) {
		if (attribute.name.startsWith('aria-')) {
			attributes.set(attribute.name, attribute.value)
		}
	}
	const customRole = element.getAttribute('role')
	if (customRole) {
		attributes.set('role', customRole)
	}
	return attributes
}
