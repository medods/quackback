import { beforeEach, describe, expect, it, vi } from 'vitest'

const navigate = vi.fn()
const useSearchMock = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  useNavigate: vi.fn(() => navigate),
}))

vi.mock('@/routes/admin/settings.boards.index', () => ({
  Route: {
    useSearch: () => useSearchMock(),
  },
}))

describe('useBoardSelection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('preserves current tab when switching board without explicit tab', async () => {
    useSearchMock.mockReturnValue({ board: 'general', tab: 'access' })

    const { useBoardSelection } = await import('../use-board-selection')
    const selection = useBoardSelection()
    selection.setSelectedBoard('bugs')

    expect(navigate).toHaveBeenCalledWith({
      to: '/admin/settings/boards',
      search: {
        board: 'bugs',
        tab: 'access',
      },
      replace: true,
    })
  })

  it('omits tab when explicit target tab is general', async () => {
    useSearchMock.mockReturnValue({ board: 'general', tab: 'access' })

    const { useBoardSelection } = await import('../use-board-selection')
    const selection = useBoardSelection()
    selection.setSelectedBoard('bugs', 'general')

    expect(navigate).toHaveBeenCalledWith({
      to: '/admin/settings/boards',
      search: {
        board: 'bugs',
        tab: undefined,
      },
      replace: true,
    })
  })
})
