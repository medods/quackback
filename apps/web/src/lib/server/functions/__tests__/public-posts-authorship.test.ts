import { beforeEach, describe, expect, it, vi } from 'vitest'

type AnyHandler = (args: { data: Record<string, unknown> }) => Promise<unknown>

const handlersByIndex: AnyHandler[] = []
const mockRequireAuth = vi.fn()
const mockPostsFindFirst = vi.fn()
const mockUserEditPost = vi.fn()
const mockSoftDeletePost = vi.fn()

vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => {
    const chain = {
      inputValidator() {
        return chain
      },
      handler(fn: AnyHandler) {
        handlersByIndex.push(fn)
        return chain
      },
    }
    return chain
  },
}))

vi.mock('@/lib/server/functions/auth-helpers', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
  getOptionalAuth: vi.fn(),
  hasAuthCredentials: vi.fn(),
}))

vi.mock('@/lib/server/db', () => ({
  db: {
    query: {
      posts: {
        findFirst: (...args: unknown[]) => mockPostsFindFirst(...args),
      },
    },
  },
  posts: { id: 'id' },
  eq: vi.fn(),
}))

vi.mock('@/lib/server/sanitize-tiptap', () => ({
  sanitizeTiptapContent: (value: unknown) => value,
}))

vi.mock('@/lib/server/domains/posts/post.user-actions', () => ({
  userEditPost: (...args: unknown[]) => mockUserEditPost(...args),
  softDeletePost: (...args: unknown[]) => mockSoftDeletePost(...args),
}))

vi.mock('@/lib/server/domains/posts/post.public', () => ({
  listPublicPosts: vi.fn(),
  getAllUserVotedPostIds: vi.fn(),
}))

vi.mock('@/lib/server/domains/posts/post.public.utils', () => ({
  getPublicRoadmapPostsPaginated: vi.fn(),
  getVoteAndSubscriptionStatus: vi.fn(),
}))

vi.mock('@/lib/server/domains/posts/post.permissions', () => ({
  getPostPermissions: vi.fn(),
}))

vi.mock('@/lib/server/domains/posts/post.service', () => ({
  createPost: vi.fn(),
}))

vi.mock('@/lib/server/domains/boards/board.public', () => ({
  getPublicBoardById: vi.fn(),
}))

vi.mock('@/lib/server/domains/statuses/status.service', () => ({
  getDefaultStatus: vi.fn(),
}))

vi.mock('@/lib/server/domains/principals/principal.service', () => ({
  getMemberByUser: vi.fn(),
}))

vi.mock('@/lib/server/functions/workspace', () => ({
  getSettings: vi.fn(),
}))

vi.mock('@/lib/server/domains/roadmaps/roadmap.service', () => ({
  listPublicRoadmaps: vi.fn(),
}))

vi.mock('@/lib/server/domains/roadmaps/roadmap.query', () => ({
  getPublicRoadmapPosts: vi.fn(),
}))

const HANDLER_INDEX_USER_EDIT_POST = 2
const HANDLER_INDEX_USER_DELETE_POST = 3

let userEditPostHandler: AnyHandler
let userDeletePostHandler: AnyHandler

const AUTH_CONTEXT = {
  principal: {
    id: 'principal_author',
    role: 'user' as const,
    type: 'user',
  },
  user: {
    id: 'user_1',
    email: 'author@example.com',
    name: 'Author',
    image: null,
  },
}

beforeEach(async () => {
  vi.clearAllMocks()

  if (handlersByIndex.length === 0) {
    await import('../public-posts')
  }

  userEditPostHandler = handlersByIndex[HANDLER_INDEX_USER_EDIT_POST]
  userDeletePostHandler = handlersByIndex[HANDLER_INDEX_USER_DELETE_POST]
})

describe('public post user actions authorship validation', () => {
  it('blocks post edit when actor is not the author', async () => {
    mockRequireAuth.mockResolvedValue(AUTH_CONTEXT)
    mockPostsFindFirst.mockResolvedValueOnce({ principalId: 'principal_other' })

    await expect(
      userEditPostHandler({
        data: { postId: 'post_1', title: 'Updated', content: 'Body' },
      })
    ).rejects.toThrow('own posts')

    expect(mockUserEditPost).not.toHaveBeenCalled()
  })

  it('allows post edit when actor is the author', async () => {
    mockRequireAuth.mockResolvedValue(AUTH_CONTEXT)
    mockPostsFindFirst.mockResolvedValueOnce({ principalId: AUTH_CONTEXT.principal.id })
    mockUserEditPost.mockResolvedValueOnce({
      id: 'post_1',
      title: 'Updated',
      content: 'Body',
      contentJson: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      deletedAt: null,
    })

    await userEditPostHandler({
      data: { postId: 'post_1', title: 'Updated', content: 'Body' },
    })

    expect(mockUserEditPost).toHaveBeenCalledWith(
      'post_1',
      { title: 'Updated', content: 'Body', contentJson: undefined },
      {
        principalId: AUTH_CONTEXT.principal.id,
        role: AUTH_CONTEXT.principal.role,
      }
    )
  })

  it('blocks post deletion when actor is not the author', async () => {
    mockRequireAuth.mockResolvedValue(AUTH_CONTEXT)
    mockPostsFindFirst.mockResolvedValueOnce({ principalId: 'principal_other' })

    await expect(userDeletePostHandler({ data: { postId: 'post_1' } })).rejects.toThrow('own posts')

    expect(mockSoftDeletePost).not.toHaveBeenCalled()
  })

  it('allows post deletion when actor is the author', async () => {
    mockRequireAuth.mockResolvedValue(AUTH_CONTEXT)
    mockPostsFindFirst.mockResolvedValueOnce({ principalId: AUTH_CONTEXT.principal.id })
    mockSoftDeletePost.mockResolvedValueOnce(undefined)

    await userDeletePostHandler({ data: { postId: 'post_1' } })

    expect(mockSoftDeletePost).toHaveBeenCalledWith('post_1', {
      principalId: AUTH_CONTEXT.principal.id,
      role: AUTH_CONTEXT.principal.role,
      userId: AUTH_CONTEXT.user.id,
    })
  })
})
