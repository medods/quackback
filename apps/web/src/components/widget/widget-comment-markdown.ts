import type { JSONContent } from '@tiptap/react'
import { MarkdownManager } from '@tiptap/markdown'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Underline from '@tiptap/extension-underline'
import Image from '@tiptap/extension-image'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import { Table } from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'

const WIDGET_COMMENT_MARKDOWN_MANAGER = new MarkdownManager({
  extensions: [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
    }),
    Link.configure({ openOnClick: false }),
    Underline,
    Image,
    TaskList,
    TaskItem.configure({ nested: true }),
    Table.configure({ resizable: false }),
    TableRow,
    TableCell,
    TableHeader,
  ],
  markedOptions: { gfm: true },
})

function normalizeImageNodes(node: JSONContent): JSONContent {
  const next: JSONContent = { ...node }

  if (next.type === 'resizableImage') {
    next.type = 'image'
  }

  if (Array.isArray(node.content)) {
    next.content = node.content.map(normalizeImageNodes)
  }

  return next
}

export function serializeWidgetCommentMarkdown(json: JSONContent, fallbackMarkdown = ''): string {
  try {
    const normalized = normalizeImageNodes(json)
    const markdown = WIDGET_COMMENT_MARKDOWN_MANAGER.serialize(normalized)
    return markdown || fallbackMarkdown
  } catch {
    return fallbackMarkdown
  }
}

export function parseWidgetCommentMarkdown(markdown: string): JSONContent | null {
  try {
    return WIDGET_COMMENT_MARKDOWN_MANAGER.parse(markdown) as JSONContent
  } catch {
    return null
  }
}
