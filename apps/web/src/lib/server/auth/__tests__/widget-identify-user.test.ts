import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockUserFindFirst = vi.fn()
const mockPrincipalFindFirst = vi.fn()
const mockInsert = vi.fn()
const mockInsertValues = vi.fn()
const mockInsertReturning = vi.fn()
const mockUpdate = vi.fn()
const mockUpdateSet = vi.fn()
const mockUpdateWhere = vi.fn()

vi.mock('@quackback/ids', () => ({
  generateId: vi.fn(() => 'user_generated'),
}))

vi.mock('@/lib/server/db', () => ({
  db: {
    query: {
      user: {
        findFirst: (...args: unknown[]) => mockUserFindFirst(...args),
      },
      principal: {
        findFirst: (...args: unknown[]) => mockPrincipalFindFirst(...args),
      },
    },
    insert: (...args: unknown[]) => mockInsert(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
  },
  user: {
    id: 'id',
    email: 'email',
    externalId: 'external_id',
  },
  principal: {
    userId: 'user_id',
  },
  eq: vi.fn(),
}))

import {
  upsertWidgetIdentifiedUser,
  WidgetIdentifyExternalIdConflictError,
} from '../widget-identify-user'

describe('upsertWidgetIdentifiedUser', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mockInsert.mockReturnValue({ values: mockInsertValues })
    mockInsertValues.mockReturnValue({ returning: mockInsertReturning })
    mockUpdate.mockReturnValue({ set: mockUpdateSet })
    mockUpdateSet.mockReturnValue({ where: mockUpdateWhere })
    mockUpdateWhere.mockResolvedValue(undefined)
  })

  it('creates a new user when no externalId/email match exists', async () => {
    mockUserFindFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null)
    mockInsertReturning.mockResolvedValue([
      {
        id: 'user_created',
        name: 'Alice',
        email: 'alice@example.com',
        externalId: 'ext-1',
        image: null,
      },
    ])

    const result = await upsertWidgetIdentifiedUser({
      externalId: 'ext-1',
      email: 'alice@example.com',
      name: 'Alice',
    })

    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'alice@example.com',
        externalId: 'ext-1',
      })
    )
    expect(result.id).toBe('user_created')
  })

  it('falls back to email match and binds externalId', async () => {
    mockUserFindFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: 'user_email',
      name: 'Alice',
      email: 'alice@example.com',
      externalId: null,
      image: null,
    })
    mockPrincipalFindFirst.mockResolvedValueOnce({ role: 'user' })

    const result = await upsertWidgetIdentifiedUser({
      externalId: 'ext-1',
      email: 'alice@example.com',
      name: 'Alice',
    })

    expect(mockUpdateSet).toHaveBeenCalledWith({ externalId: 'ext-1' })
    expect(result.id).toBe('user_email')
    expect(result.externalId).toBe('ext-1')
  })

  it('throws when email fallback points to a team account', async () => {
    mockUserFindFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: 'team_user',
      name: 'Team User',
      email: 'team@example.com',
      externalId: null,
      image: null,
    })
    mockPrincipalFindFirst.mockResolvedValueOnce({ role: 'member' })

    await expect(
      upsertWidgetIdentifiedUser({
        externalId: 'ext-1',
        email: 'team@example.com',
        name: 'Alice',
      })
    ).rejects.toBeInstanceOf(WidgetIdentifyExternalIdConflictError)
    expect(mockUpdateSet).not.toHaveBeenCalled()
    expect(mockInsertValues).not.toHaveBeenCalled()
  })

  it('prefers sessionHint user over email fallback when externalId is missing', async () => {
    mockUserFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'user_session_hint',
        name: 'Alice',
        email: 'old@example.com',
        externalId: null,
        image: null,
      })
      .mockResolvedValueOnce({
        id: 'user_email',
        name: 'Bob',
        email: 'alice@example.com',
        externalId: null,
        image: null,
      })

    const result = await upsertWidgetIdentifiedUser(
      {
        externalId: 'ext-1',
        email: 'alice@example.com',
        name: 'Alice',
      },
      { sessionHintUserId: 'user_session_hint' }
    )

    expect(result.id).toBe('user_session_hint')
    expect(mockUpdateSet).toHaveBeenCalledWith({ externalId: 'ext-1' })
  })

  it('throws when email is already linked to a different externalId', async () => {
    mockUserFindFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: 'user_email_other',
      name: 'Bob',
      email: 'alice@example.com',
      externalId: 'ext-2',
      image: null,
    })

    await expect(
      upsertWidgetIdentifiedUser({
        externalId: 'ext-1',
        email: 'alice@example.com',
        name: 'Alice',
      })
    ).rejects.toBeInstanceOf(WidgetIdentifyExternalIdConflictError)
    expect(mockUpdateSet).not.toHaveBeenCalled()
    expect(mockInsertValues).not.toHaveBeenCalled()
  })

  it('throws when sessionHint user is linked to a different externalId', async () => {
    mockUserFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'user_session_hint',
        name: 'Alice',
        email: 'alice@example.com',
        externalId: 'ext-2',
        image: null,
      })
      .mockResolvedValueOnce(null)

    await expect(
      upsertWidgetIdentifiedUser(
        {
          externalId: 'ext-1',
          email: 'alice@example.com',
          name: 'Alice',
        },
        { sessionHintUserId: 'user_session_hint' }
      )
    ).rejects.toBeInstanceOf(WidgetIdentifyExternalIdConflictError)
    expect(mockUpdateSet).not.toHaveBeenCalled()
    expect(mockInsertValues).not.toHaveBeenCalled()
  })

  it('uses externalId match as primary identity and skips conflicting email update', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockUserFindFirst
      .mockResolvedValueOnce({
        id: 'user_ext',
        name: 'Alice',
        email: 'old@example.com',
        externalId: 'ext-1',
        image: null,
      })
      .mockResolvedValueOnce({
        id: 'user_email_other',
        name: 'Bob',
        email: 'new@example.com',
        externalId: 'ext-2',
        image: null,
      })

    const result = await upsertWidgetIdentifiedUser({
      externalId: 'ext-1',
      email: 'new@example.com',
      name: 'Alice',
    })

    expect(result.id).toBe('user_ext')
    expect(result.email).toBe('old@example.com')
    expect(mockUpdateSet).not.toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalledTimes(1)
    warnSpy.mockRestore()
  })

  it('updates email when matched by externalId and no email collision exists', async () => {
    mockUserFindFirst
      .mockResolvedValueOnce({
        id: 'user_ext',
        name: 'Alice',
        email: 'old@example.com',
        externalId: 'ext-1',
        image: null,
      })
      .mockResolvedValueOnce(null)

    const result = await upsertWidgetIdentifiedUser({
      externalId: 'ext-1',
      email: 'new@example.com',
      name: 'Alice',
    })

    expect(mockUpdateSet).toHaveBeenCalledWith({ email: 'new@example.com' })
    expect(result.email).toBe('new@example.com')
  })
})
