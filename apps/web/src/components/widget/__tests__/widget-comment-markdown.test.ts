import { describe, it, expect } from 'vitest'
import type { JSONContent } from '@tiptap/react'
import {
  parseWidgetCommentMarkdown,
  serializeWidgetCommentMarkdown,
} from '../widget-comment-markdown'

function findImageNode(node: JSONContent): JSONContent | null {
  if (node.type === 'image' && node.attrs?.src) return node
  if (!node.content) return null
  for (const child of node.content) {
    const match = findImageNode(child)
    if (match) return match
  }
  return null
}

describe('widget-comment-markdown', () => {
  it('serializes resizableImage nodes as markdown images', () => {
    const json: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Screenshot:' }],
        },
        {
          type: 'resizableImage',
          attrs: { src: 'https://cdn.example.com/widget-images/shot.webp', alt: 'shot' },
        },
      ],
    }

    const markdown = serializeWidgetCommentMarkdown(json)

    expect(markdown).toContain('https://cdn.example.com/widget-images/shot.webp')

    const parsed = parseWidgetCommentMarkdown(markdown)
    expect(parsed).not.toBeNull()
    expect(findImageNode(parsed as JSONContent)?.attrs?.src).toBe(
      'https://cdn.example.com/widget-images/shot.webp'
    )
  })

  it('returns fallback markdown when content is invalid', () => {
    const markdown = serializeWidgetCommentMarkdown({} as JSONContent, 'fallback')
    expect(markdown).toBe('fallback')
  })
})
