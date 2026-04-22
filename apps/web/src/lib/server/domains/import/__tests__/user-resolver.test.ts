import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PrincipalId } from '@quackback/ids'

const mockSelect = vi.fn()
const mockUpdateSet = vi.fn()
const mockUpdateWhere = vi.fn()
const mockInsertValues = vi.fn()

function createSelectChain(rows: unknown[] = []) {
  const chain: Record<string, unknown> = {}
  chain.from = vi.fn(() => chain)
  chain.innerJoin = vi.fn(() => chain)
  chain.where = vi.fn(() => chain)
  chain.limit = vi.fn().mockResolvedValue(rows)
  return chain
}

function createInsertChain() {
  return {
    values: (...args: unknown[]) => {
      mockInsertValues(...args)
      return Promise.resolve(undefined)
    },
  }
}

vi.mock('@/lib/server/db', () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
    update: vi.fn(() => ({
      set: (...args: unknown[]) => {
        mockUpdateSet(...args)
        return {
          where: (...whereArgs: unknown[]) => {
            mockUpdateWhere(...whereArgs)
            return Promise.resolve(undefined)
          },
        }
      },
    })),
    insert: vi.fn(() => createInsertChain()),
  },
  eq: vi.fn(),
  user: { id: 'user_id', email: 'email', name: 'name' },
  principal: { id: 'principal_id', userId: 'user_id', displayName: 'display_name' },
}))

vi.mock('@quackback/ids', async () => {
  let counter = 0
  return {
    createId: vi.fn((prefix: string) => `${prefix}_${++counter}` as PrincipalId),
  }
})

const { ImportUserResolver } = await import('../user-resolver')

describe('ImportUserResolver', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('backfills principal.displayName when existing principal has null displayName', async () => {
    mockSelect.mockReturnValue(
      createSelectChain([
        {
          principalId: 'principal_existing',
          principalDisplayName: null,
          userName: 'User Name',
        },
      ])
    )

    const resolver = new ImportUserResolver()
    const principalId = await resolver.resolve(
      'alice@example.com',
      'Alice CSV',
      'principal_fallback' as PrincipalId
    )

    expect(principalId).toBe('principal_existing')
    expect(mockUpdateSet).toHaveBeenCalledWith({ displayName: 'Alice CSV' })
    expect(mockUpdateWhere).toHaveBeenCalled()
  })

  it('writes displayName when creating new principals in flushPendingCreates', async () => {
    mockSelect.mockReturnValue(createSelectChain([]))

    const resolver = new ImportUserResolver()
    await resolver.resolve('new.user@example.com', 'New User', 'principal_fallback' as PrincipalId)
    await resolver.flushPendingCreates()

    const allInsertCalls = mockInsertValues.mock.calls.flatMap((call) => call)
    const principalInsertPayload = allInsertCalls.find(
      (payload) =>
        Array.isArray(payload) &&
        payload.length > 0 &&
        typeof payload[0] === 'object' &&
        payload[0] !== null &&
        'role' in payload[0]
    ) as Array<Record<string, unknown>> | undefined

    expect(principalInsertPayload).toBeDefined()
    expect(principalInsertPayload?.[0]?.displayName).toBe('New User')
  })
})
