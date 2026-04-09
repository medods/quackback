import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PostId, PrincipalId } from '@quackback/ids'

const mockPostsFindFirst = vi.fn()
const mockVotesFindFirst = vi.fn()
const mockCommentsFindFirst = vi.fn()
const mockSelectWhere = vi.fn()
const mockUpdateReturning = vi.fn()
const mockRemoveVote = vi.fn()

function createUpdateChain() {
  const chain: Record<string, unknown> = {}
  chain.set = vi.fn().mockReturnValue(chain)
  chain.where = vi.fn().mockReturnValue(chain)
  chain.returning = mockUpdateReturning
  return chain
}

vi.mock('@/lib/server/db', async () => {
  const { sql: realSql } = await vi.importActual<typeof import('drizzle-orm')>('drizzle-orm')

  return {
    db: {
      query: {
        posts: { findFirst: (...args: unknown[]) => mockPostsFindFirst(...args) },
        settings: { findFirst: vi.fn().mockResolvedValue(null) },
        votes: { findFirst: (...args: unknown[]) => mockVotesFindFirst(...args) },
        comments: { findFirst: (...args: unknown[]) => mockCommentsFindFirst(...args) },
        boards: { findFirst: vi.fn().mockResolvedValue({ slug: 'feedback' }) },
      },
      select: vi.fn(() => ({
        from: vi.fn().mockReturnValue({
          where: (...args: unknown[]) => mockSelectWhere(...args),
        }),
      })),
      update: vi.fn(() => createUpdateChain()),
      insert: vi.fn(() => ({
        values: vi.fn().mockResolvedValue(undefined),
      })),
    },
    posts: { id: 'id', postId: 'post_id', statusId: 'status_id', deletedAt: 'deleted_at' },
    boards: { id: 'board_id', slug: 'slug' },
    votes: { id: 'id', postId: 'post_id', principalId: 'principal_id' },
    comments: { id: 'id', postId: 'post_id', principalId: 'principal_id', deletedAt: 'deleted_at' },
    postEditHistory: {},
    eq: vi.fn(),
    and: vi.fn(),
    isNull: vi.fn(),
    sql: realSql,
  }
})

vi.mock('@/lib/server/domains/posts/post.voting', () => ({
  removeVote: (...args: unknown[]) => mockRemoveVote(...args),
}))

vi.mock('@/lib/server/domains/activity/activity.service', () => ({
  createActivity: vi.fn(),
}))

vi.mock('@/lib/server/events/dispatch', () => ({
  dispatchPostDeleted: vi.fn(),
  dispatchPostRestored: vi.fn(),
  buildEventActor: vi.fn((actor) => actor),
}))

vi.mock('@/lib/server/domains/embeddings/embedding.service', () => ({
  generatePostEmbedding: vi.fn().mockResolvedValue(undefined),
}))

const POST_ID = 'post_1' as PostId
const USER_PRINCIPAL_ID = 'principal_01knrswyb9eh6s5n4c0tzrvdzj' as PrincipalId

const USER_ACTOR = {
  principalId: USER_PRINCIPAL_ID,
  role: 'user' as const,
}

const basePost = {
  id: POST_ID,
  title: 'Old title',
  content: 'Old content',
  contentJson: null,
  principalId: USER_PRINCIPAL_ID,
  statusId: null,
  postStatus: { isDefault: true },
  deletedAt: null,
  boardId: 'board_1',
}

describe('post.user-actions engagement validations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSelectWhere.mockResolvedValue([{ count: 0 }])
    mockCommentsFindFirst.mockResolvedValue(null)
    mockVotesFindFirst.mockResolvedValue(null)
    mockRemoveVote.mockResolvedValue({ removed: true, voteCount: 0 })
    mockUpdateReturning.mockResolvedValue([basePost])
  })

  it('allows editing when only author vote exists', async () => {
    mockPostsFindFirst.mockResolvedValueOnce({
      ...basePost,
      voteCount: 1,
    })
    mockVotesFindFirst.mockResolvedValueOnce(null)

    const { userEditPost } = await import('../post.user-actions')
    await expect(
      userEditPost(
        POST_ID,
        { title: 'New title', content: 'New content', contentJson: null },
        USER_ACTOR
      )
    ).resolves.toBeDefined()
  })

  it('blocks editing when another user has voted', async () => {
    mockPostsFindFirst.mockResolvedValueOnce({
      ...basePost,
      voteCount: 2,
    })
    mockVotesFindFirst.mockResolvedValueOnce({ id: 'vote_other' })

    const { userEditPost } = await import('../post.user-actions')
    await expect(
      userEditPost(
        POST_ID,
        { title: 'New title', content: 'New content', contentJson: null },
        USER_ACTOR
      )
    ).rejects.toThrow('Cannot edit posts that have received votes')
  })

  it('allows deleting when only author vote exists and removes author vote', async () => {
    mockPostsFindFirst.mockResolvedValueOnce({
      ...basePost,
      voteCount: 1,
    })
    mockVotesFindFirst.mockResolvedValueOnce(null)

    const { softDeletePost } = await import('../post.user-actions')
    await expect(softDeletePost(POST_ID, USER_ACTOR)).resolves.toBeUndefined()
    expect(mockRemoveVote).toHaveBeenCalledWith(POST_ID, USER_PRINCIPAL_ID)
  })

  it('blocks deleting when another user has voted', async () => {
    mockPostsFindFirst.mockResolvedValueOnce({
      ...basePost,
      voteCount: 2,
    })
    mockVotesFindFirst.mockResolvedValueOnce({ id: 'vote_other' })

    const { softDeletePost } = await import('../post.user-actions')
    await expect(softDeletePost(POST_ID, USER_ACTOR)).rejects.toThrow(
      'Cannot delete posts that have received votes'
    )
    expect(mockRemoveVote).not.toHaveBeenCalled()
  })
})
