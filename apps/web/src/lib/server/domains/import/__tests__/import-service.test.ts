import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PrincipalId, BoardId } from '@quackback/ids'

const mockPostStatusesFindFirst = vi.fn()
const mockPostStatusesFindMany = vi.fn()
const mockTagsFindMany = vi.fn()
const mockInsert = vi.fn()

const postsTable = { __table: 'posts' }
const tagsTable = { __table: 'tags' }
const postTagsTable = { __table: 'post_tags' }

let capturedPostInsert: Array<Record<string, unknown>> = []

vi.mock('@/lib/server/db', () => ({
  db: {
    query: {
      postStatuses: {
        findFirst: (...args: unknown[]) => mockPostStatusesFindFirst(...args),
        findMany: (...args: unknown[]) => mockPostStatusesFindMany(...args),
      },
      tags: {
        findMany: (...args: unknown[]) => mockTagsFindMany(...args),
      },
    },
    insert: (...args: unknown[]) => mockInsert(...args),
  },
  posts: postsTable,
  tags: tagsTable,
  postTags: postTagsTable,
  postStatuses: { isDefault: 'is_default' },
  eq: vi.fn(),
}))

vi.mock('@quackback/ids', async () => {
  let counter = 0
  return {
    boardIdSchema: { safeParse: vi.fn() },
    createId: vi.fn((prefix: string) => `${prefix}_${++counter}`),
  }
})

const { processBatch } = await import('../import-service')

describe('processBatch status normalization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    capturedPostInsert = []

    mockPostStatusesFindFirst.mockResolvedValue({ id: 'status_default' })
    mockPostStatusesFindMany.mockResolvedValue([
      { id: 'status_default', slug: 'open', category: 'active' },
      { id: 'status_under_review', slug: 'under-review', category: 'active' },
    ])
    mockTagsFindMany.mockResolvedValue([])

    mockInsert.mockImplementation((table: unknown) => {
      if (table === postsTable) {
        return {
          values: (rows: Array<Record<string, unknown>>) => {
            capturedPostInsert = rows
            return Promise.resolve(undefined)
          },
        }
      }

      // tags/post_tags path (not used in this test, but keeps mock complete)
      return {
        values: () => ({
          onConflictDoNothing: () => Promise.resolve(undefined),
        }),
      }
    })
  })

  it('maps "under review" to slug "under-review" and sets matching statusId', async () => {
    const fakeResolver = {
      resolve: vi.fn().mockResolvedValue('principal_author' as PrincipalId),
      flushPendingCreates: vi.fn().mockResolvedValue(0),
    }

    const result = await processBatch(
      [
        {
          title: 'Status mapping test',
          content: 'Body',
          status: 'under review',
          author_name: 'Alice',
          author_email: 'alice@example.com',
          vote_count: '1',
          created_at: '2025-01-01T00:00:00Z',
        },
      ],
      'board_1' as BoardId,
      0,
      fakeResolver as unknown as import('../user-resolver').ImportUserResolver,
      'principal_fallback' as PrincipalId
    )

    expect(result.imported).toBe(1)
    expect(result.skipped).toBe(0)
    expect(capturedPostInsert).toHaveLength(1)
    expect(capturedPostInsert[0]?.statusId).toBe('status_under_review')
  })
})
