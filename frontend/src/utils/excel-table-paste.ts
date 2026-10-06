import DOMPurify from 'dompurify'
import { Extension } from '@tiptap/core'
import { DOMParser as ProseMirrorDOMParser } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'

const ALLOWED_TAGS = [
	'table',
	'thead',
	'tbody',
	'tfoot',
	'tr',
	'td',
	'th',
	'colgroup',
	'col',
	'caption',
	'div',
	'p',
	'br',
	'span',
	'strong',
	'b',
	'em',
	'i',
	'u',
	's',
	'a',
	'ul',
	'ol',
	'li',
]

const ALLOWED_ATTR = [
	'colspan',
	'rowspan',
	'width',
	'height',
	'align',
	'valign',
	'style',
	'href',
	'target',
	'rel',
]

const ALLOWED_STYLE_PROPERTIES = new Set([
	'background-color',
	'border',
	'border-bottom',
	'border-collapse',
	'border-left',
	'border-right',
	'border-top',
	'color',
	'font-style',
	'font-weight',
	'height',
	'text-align',
	'text-decoration',
	'vertical-align',
	'white-space',
	'width',
])

function sanitizeTableHTML(clipboardHTML: string): string | null {
	const sanitized = DOMPurify.sanitize(clipboardHTML, {
		ALLOWED_TAGS,
		ALLOWED_ATTR,
		ALLOW_DATA_ATTR: false,
		ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i,
	})

	const container = document.createElement('div')
	container.innerHTML = sanitized

	const tables = Array.from(container.querySelectorAll('table'))
	if (!tables.length) return null

	for (const element of container.querySelectorAll<HTMLElement>('[style]')) {
		for (const property of Array.from(element.style)) {
			if (!ALLOWED_STYLE_PROPERTIES.has(property.toLowerCase())) {
				element.style.removeProperty(property)
			}
		}
	}

	for (const link of container.querySelectorAll<HTMLAnchorElement>('a[href]')) {
		link.target = '_blank'
		link.rel = 'noopener noreferrer'
	}

	return tables.map((table) => table.outerHTML).join('')
}

function tsvToTable(text: string): string | null {
	const rows = text
		.replace(/\r\n?/g, '\n')
		.split('\n')
		.filter((row) => row.length > 0)
		.map((row) => row.split('\t'))

	// Avoid treating normal pasted prose or a single tab as a table.
	if (rows.length < 2 || !rows.some((row) => row.length > 1)) return null

	const table = document.createElement('table')
	const tbody = document.createElement('tbody')

	for (const cells of rows) {
		const tr = document.createElement('tr')
		for (const value of cells) {
			const td = document.createElement('td')
			td.textContent = value
			tr.append(td)
		}
		tbody.append(tr)
	}

	table.append(tbody)
	return table.outerHTML
}

function insertHTML(view: EditorView, html: string): void {
	const container = document.createElement('div')
	container.innerHTML = html

	const parser = ProseMirrorDOMParser.fromSchema(view.state.schema)
	const slice = parser.parseSlice(container, { preserveWhitespace: true })
	view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView())
}

export const ExcelTablePasteExtension = Extension.create({
	name: 'excelTablePaste',

	// Frappe UI's generic content-paste extension uses the default priority.
	// This must run first when Excel exposes both image and HTML clipboard data.
	priority: 1000,

	addProseMirrorPlugins() {
		return [
			new Plugin({
				key: new PluginKey('excelTablePaste'),
				props: {
					handlePaste(view, event) {
						const html = event.clipboardData?.getData('text/html') || ''
						const safeTableHTML = html ? sanitizeTableHTML(html) : null

						if (safeTableHTML) {
							event.preventDefault()
							insertHTML(view, safeTableHTML)
							return true
						}

						const plainText = event.clipboardData?.getData('text/plain') || ''
						const tsvTableHTML = tsvToTable(plainText)

						if (tsvTableHTML) {
							event.preventDefault()
							insertHTML(view, tsvTableHTML)
							return true
						}

						return false
					},
				},
			}),
		]
	},
})
