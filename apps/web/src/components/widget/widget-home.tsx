import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PlusIcon, Squares2X2Icon } from '@heroicons/react/24/solid'
import { LightBulbIcon, MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import { FormattedMessage, useIntl } from 'react-intl'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { listPublicPostsFn } from '@/lib/server/functions/public-posts'
import { useInfiniteScroll } from '@/lib/client/hooks/use-infinite-scroll'
import { widgetQueryKeys } from '@/lib/client/hooks/use-widget-vote'
import { WidgetVoteButton } from './widget-vote-button'
import { useWidgetAuth } from './widget-auth-provider'
import { sendToHost } from '@/lib/client/widget-bridge'
import type { PostId } from '@quackback/ids'
import { RichTextEditor } from '@/components/ui/rich-text-editor'
import { useWidgetImageUpload } from '@/lib/client/hooks/use-image-upload'
import type { JSONContent } from '@tiptap/react'
import type { TiptapContent } from '@/lib/shared/schemas/posts'

interface WidgetPost {
  id: string
  title: string
  voteCount: number
  statusId: string | null
  commentCount: number
  board?: { id: string; name: string; slug: string }
}

interface StatusInfo {
  id: string
  name: string
  color: string
  category: 'active' | 'complete' | 'closed'
}

interface BoardInfo {
  id: string
  name: string
  slug: string
}

interface WidgetHomeProps {
  initialPosts: WidgetPost[]
  initialHasMore?: boolean
  statuses: StatusInfo[]
  boards: BoardInfo[]
  isActive?: boolean
  onPostSelect?: (postId: string) => void
  onPostCreated?: (post: {
    id: string
    title: string
    voteCount: number
    statusId: string | null
    board: { id: string; name: string; slug: string }
  }) => void
  anonymousVotingEnabled?: boolean
  anonymousPostingEnabled?: boolean
  imageUploadsInWidget?: boolean
  hideClosed?: boolean
  initialSort?: string
  initialBoardSlug?: string
  onSortChange?: (sort: string) => void
  onBoardChange?: (boardSlug: string | null) => void
}

interface SearchResult {
  posts: WidgetPost[]
}

type WidgetPopularSort = 'top' | 'least' | 'new' | 'old' | 'trending'

const MIN_WIDGET_SEARCH_LENGTH = 2
const similarSearchCache = new Map<string, SearchResult>()

const identityInputCls =
  'bg-background rounded-md border border-border/50 px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/50 outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/50 transition-colors'

// ── Shared post row used in both similar-posts and popular-ideas lists ──

const WidgetPostRow = memo(
  function WidgetPostRow({
    post,
    statusMap,
    showBoard,
    compact,
    canVote,
    ensureSessionThen,
    onAuthRequired,
    onSelect,
  }: {
    post: WidgetPost
    statusMap: Map<string, StatusInfo>
    showBoard?: boolean
    compact?: boolean
    canVote: boolean
    ensureSessionThen: (callback: () => void | Promise<void>) => Promise<void>
    onAuthRequired?: () => void
    onSelect?: () => void
  }) {
    const status = post.statusId ? (statusMap.get(post.statusId) ?? null) : null
    const isClosed = status?.category === 'closed'
    return (
      <div
        className={`w-full overflow-hidden flex items-center gap-2 rounded-lg hover:bg-muted/30 transition-colors cursor-pointer ${compact ? 'px-1.5 py-1' : 'px-2 py-1.5'}`}
        onClick={onSelect}
      >
        <div onClick={(e) => e.stopPropagation()} className="shrink-0">
          <WidgetVoteButton
            postId={post.id as PostId}
            voteCount={post.voteCount}
            compact={compact}
            disabled={isClosed}
            onBeforeVote={
              !isClosed && canVote
                ? async () => {
                    let success = false
                    await ensureSessionThen(() => {
                      success = true
                    })
                    return success
                  }
                : undefined
            }
            onAuthRequired={!isClosed && !canVote ? onAuthRequired : undefined}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            {status && (
              <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                <span
                  className="size-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: status.color }}
                />
                {status.name}
              </span>
            )}
            {showBoard && post.board && (
              <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground/60">
                <Squares2X2Icon className="h-2.5 w-2.5 text-muted-foreground/40" />
                {post.board.name}
              </span>
            )}
          </div>
          <p
            className={`font-medium text-foreground line-clamp-1 ${compact ? 'text-xs' : 'text-sm'}`}
          >
            {post.title}
          </p>
        </div>
      </div>
    )
  },
  (prev, next) =>
    prev.post === next.post &&
    prev.statusMap === next.statusMap &&
    prev.showBoard === next.showBoard &&
    prev.compact === next.compact &&
    prev.canVote === next.canVote
)
export function WidgetHome({
  initialPosts,
  initialHasMore = false,
  statuses,
  boards,
  isActive = true,
  onPostSelect,
  onPostCreated,
  anonymousVotingEnabled = true,
  anonymousPostingEnabled = false,
  imageUploadsInWidget = true,
  hideClosed = false,
  initialSort,
  initialBoardSlug,
  onSortChange,
  onBoardChange,
}: WidgetHomeProps) {
  const intl = useIntl()
  const queryClient = useQueryClient()
  const {
    ensureSession,
    ensureSessionThen,
    isIdentified,
    hmacRequired,
    user,
    emitEvent,
    metadata,
    identifyWithEmail,
    sessionVersion,
  } = useWidgetAuth()
  const { upload: uploadImage } = useWidgetImageUpload()
  const canUploadImages = isIdentified && imageUploadsInWidget
  const canVote = isIdentified || anonymousVotingEnabled
  const canPost = isIdentified || anonymousPostingEnabled
  const needsEmail = !isIdentified && !hmacRequired && !anonymousPostingEnabled

  const [title, setTitle] = useState('')
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [selectedBoardId, setSelectedBoardId] = useState(boards[0]?.id ?? '')
  const [contentJson, setContentJson] = useState<JSONContent | null>(null)
  const [contentHtml, setContentHtml] = useState('')
  const handleEditorChange = useCallback((json: JSONContent, html: string) => {
    setContentJson(json)
    setContentHtml(html)
  }, [])
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [similarPostResults, setSimilarPostResults] = useState<SearchResult | null>(null)
  const [isSimilarSearching, setIsSimilarSearching] = useState(false)
  const similarDebounceRef = useRef<ReturnType<typeof setTimeout>>(null)
  const [activeBoardSlug, setActiveBoardSlug] = useState<string | null>(initialBoardSlug ?? null)
  const [popularSort, setPopularSort] = useState<WidgetPopularSort>(
    (initialSort as WidgetPopularSort) ?? 'top'
  )

  useEffect(() => {
    if (initialSort) setPopularSort(initialSort as WidgetPopularSort)
  }, [initialSort])

  useEffect(() => {
    setActiveBoardSlug(initialBoardSlug ?? null)
  }, [initialBoardSlug])

  const [popularSearch, setPopularSearch] = useState('')
  const [debouncedPopularSearch, setDebouncedPopularSearch] = useState('')
  const popularSearchDebounceRef = useRef<ReturnType<typeof setTimeout>>(null)

  const statusMap = useMemo(() => new Map(statuses.map((s) => [s.id, s])), [statuses])

  // Infinite query for popular ideas — page 1 seeded from SSR, pages 2+ fetched on scroll
  const {
    data: postsData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isFetching: isFetchingPosts,
  } = useInfiniteQuery({
    queryKey: [
      'widget',
      'posts',
      'popular',
      popularSort,
      activeBoardSlug ?? 'all',
      hideClosed ? 'hide-closed' : 'show-closed',
    ],
    queryFn: ({ pageParam }) =>
      listPublicPostsFn({
        data: {
          sort: popularSort,
          page: pageParam,
          limit: 20,
          boardSlug: activeBoardSlug ?? undefined,
          excludeStatusCategories: hideClosed ? ['closed'] : undefined,
        },
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => (lastPage.hasMore ? allPages.length + 1 : undefined),
    // Only seed from SSR data on the initial unfiltered view
    initialData:
      activeBoardSlug === null && popularSort === 'top'
        ? {
            pages: [{ items: initialPosts, total: -1, hasMore: initialHasMore }],
            pageParams: [1],
          }
        : undefined,
  })

  const allPopularPosts: WidgetPost[] = useMemo(
    () =>
      postsData?.pages.flatMap((page) =>
        page.items.map(
          (p): WidgetPost => ({
            id: p.id,
            title: p.title,
            voteCount: p.voteCount,
            statusId: p.statusId ?? null,
            commentCount: (p as WidgetPost).commentCount ?? 0,
            board: (p as WidgetPost).board,
          })
        )
      ) ?? [],
    [postsData]
  )

  const postsSentinelRef = useInfiniteScroll({
    hasMore: hasNextPage ?? false,
    isFetching: isFetchingNextPage,
    onLoadMore: fetchNextPage,
  })

  const normalizedDebouncedPopularSearch = debouncedPopularSearch.trim()
  const isPopularSearchActive =
    Array.from(normalizedDebouncedPopularSearch).length >= MIN_WIDGET_SEARCH_LENGTH

  // Search query for popular ideas — replaces infinite list when active
  const { data: popularSearchData, isFetching: isPopularSearchFetching } = useQuery({
    queryKey: ['widget', 'search', 'popular', debouncedPopularSearch],
    queryFn: async () => {
      const params = new URLSearchParams({ q: normalizedDebouncedPopularSearch, limit: '20' })
      const res = await fetch(`/api/widget/search?${params}`)
      const json = await res.json()
      return { posts: (json.data?.posts ?? []) as WidgetPost[] }
    },
    enabled: isPopularSearchActive,
  })

  const handleAuthRequired = useCallback(
    (postId: string) => {
      if (!hmacRequired && onPostSelect) {
        onPostSelect(postId)
      } else {
        sendToHost({ type: 'quackback:navigate', url: `${window.location.origin}/auth/login` })
      }
    },
    [hmacRequired, onPostSelect]
  )

  useEffect(() => {
    if (similarDebounceRef.current) clearTimeout(similarDebounceRef.current)
    const q = title.trim()
    if (Array.from(q).length < MIN_WIDGET_SEARCH_LENGTH) {
      setSimilarPostResults(null)
      setIsSimilarSearching(false)
      return
    }
    const cached = similarSearchCache.get(q)
    if (cached) {
      setSimilarPostResults(cached)
      setIsSimilarSearching(false)
      return
    }
    setIsSimilarSearching(true)
    const controller = new AbortController()
    similarDebounceRef.current = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q, limit: '5' })
        const res = await fetch(`/api/widget/search?${params}`, { signal: controller.signal })
        const json = await res.json()
        const result: SearchResult = { posts: json.data?.posts ?? [] }
        similarSearchCache.set(q, result)
        setSimilarPostResults(result)
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return
        setSimilarPostResults({ posts: [] })
      } finally {
        setIsSimilarSearching(false)
      }
    }, 300)
    return () => {
      if (similarDebounceRef.current) clearTimeout(similarDebounceRef.current)
      controller.abort()
    }
  }, [title])

  // Debounce popular ideas search
  useEffect(() => {
    if (popularSearchDebounceRef.current) clearTimeout(popularSearchDebounceRef.current)
    popularSearchDebounceRef.current = setTimeout(() => {
      setDebouncedPopularSearch(popularSearch)
    }, 300)
    return () => {
      if (popularSearchDebounceRef.current) clearTimeout(popularSearchDebounceRef.current)
    }
  }, [popularSearch])

  function resetCreateForm() {
    setTitle('')
    setContentJson(null)
    setContentHtml('')
    setEmail('')
    setName('')
    setError(null)
    setSimilarPostResults(null)
  }

  function closeCreateModal() {
    setIsCreateModalOpen(false)
    resetCreateForm()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !selectedBoardId || isSubmitting) return
    if (needsEmail && !email.trim()) return

    setIsSubmitting(true)
    setError(null)

    try {
      if (needsEmail) {
        const identified = await identifyWithEmail(email.trim(), name.trim() || undefined)
        if (!identified) {
          setError(
            intl.formatMessage({
              id: 'widget.home.form.errorEmail',
              defaultMessage: 'Could not verify your email. Please try again.',
            })
          )
          setIsSubmitting(false)
          return
        }
      } else if (!canPost) {
        if (hmacRequired) {
          sendToHost({ type: 'quackback:navigate', url: `${window.location.origin}/auth/login` })
          setIsSubmitting(false)
          return
        }
      } else if (!isIdentified) {
        const ok = await ensureSession()
        if (!ok) {
          setError(
            intl.formatMessage({
              id: 'widget.home.form.errorSession',
              defaultMessage: 'Could not create session. Please try again.',
            })
          )
          setIsSubmitting(false)
          return
        }
      }

      const [{ getWidgetAuthHeaders }, { createPublicPostFn }] = await Promise.all([
        import('@/lib/client/widget-auth'),
        import('@/lib/server/functions/public-posts'),
      ])
      const result = await createPublicPostFn({
        data: {
          boardId: selectedBoardId,
          title: title.trim(),
          content: contentHtml.trim(),
          contentJson: (contentJson ?? undefined) as TiptapContent | undefined,
          metadata: metadata ?? undefined,
        },
        headers: getWidgetAuthHeaders(),
      })

      emitEvent('post:created', {
        id: result.id,
        title: result.title,
        board: result.board,
        statusId: result.statusId ?? null,
      })

      onPostCreated?.({
        id: result.id,
        title: result.title,
        voteCount: result.voteCount,
        statusId: result.statusId ?? null,
        board: result.board,
      })

      // New posts are auto-voted by their author; reflect that immediately in vote UI.
      queryClient.setQueryData<Set<string>>(
        widgetQueryKeys.votedPosts.bySession(sessionVersion),
        (old) => {
          const next = new Set(old ?? [])
          next.add(result.id)
          return next
        }
      )
      queryClient.setQueriesData<Set<string>>(
        { queryKey: widgetQueryKeys.votedPosts.all },
        (old) => {
          const next = new Set(old ?? [])
          next.add(result.id)
          return next
        }
      )

      // Refresh list/search caches so newly created posts show up without page reload.
      void queryClient.invalidateQueries({ queryKey: ['widget', 'posts', 'popular'] })
      void queryClient.invalidateQueries({ queryKey: ['widget', 'search', 'popular'] })

      closeCreateModal()
    } catch {
      setError(
        intl.formatMessage({
          id: 'widget.home.form.errorNetwork',
          defaultMessage: 'Network error. Please try again.',
        })
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  const canSubmitForm =
    Boolean(title.trim()) && (!needsEmail || Boolean(email.trim())) && (canPost || needsEmail)
  const hasSimilarPosts =
    !isSimilarSearching && Boolean(similarPostResults && similarPostResults.posts.length > 0)
  const similarPosts = hasSimilarPosts ? (similarPostResults?.posts.slice(0, 3) ?? []) : []

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 min-h-0">
        <div className="w-full h-full min-h-0 px-3 pt-2 pb-3 flex flex-col">
          <div className="shrink-0 space-y-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsCreateModalOpen(true)
                  setError(null)
                }}
                className="shrink-0 inline-flex h-9 items-center gap-1.5 rounded-md border border-[var(--success-border-color)] bg-[var(--success-background-color)] px-3 text-[13px] uppercase text-[var(--success-color)] transition-colors hover:border-[var(--success-color)] hover:bg-[var(--success-color)] hover:text-white focus-visible:ring-2 focus-visible:ring-[var(--success-background-color)]"
              >
                <PlusIcon className="h-5 w-5" />
                <FormattedMessage id="widget.home.form.newRequest" defaultMessage="New request" />
              </button>
              <div className="flex h-9 min-w-0 flex-1 items-center gap-1.5 rounded-md border border-border/70 bg-card px-2">
                <MagnifyingGlassIcon className="h-4 w-4 shrink-0 text-muted-foreground/60" />
                <input
                  type="text"
                  value={popularSearch}
                  onChange={(e) => setPopularSearch(e.target.value)}
                  placeholder={intl.formatMessage({
                    id: 'widget.home.popular.search.placeholder',
                    defaultMessage: 'Search ideas...',
                  })}
                  className="h-full min-w-0 flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground/50 outline-none"
                />
                {popularSearch && (
                  <button
                    type="button"
                    onClick={() => setPopularSearch('')}
                    className="shrink-0 text-muted-foreground/60 transition-colors hover:text-foreground"
                    aria-label={intl.formatMessage({
                      id: 'widget.home.popular.search.clear',
                      defaultMessage: 'Clear search',
                    })}
                  >
                    <XMarkIcon className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Select
                value={popularSort}
                onValueChange={(value) => {
                  const sort = value as WidgetPopularSort
                  setPopularSort(sort)
                  onSortChange?.(sort)
                }}
              >
                <SelectTrigger
                  size="xs"
                  className="h-8 min-h-8 border-border/60 bg-card px-2 text-[11px]"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="start">
                  <SelectItem value="top" className="text-xs py-1">
                    <FormattedMessage
                      id="widget.home.popular.sort.top"
                      defaultMessage="Most votes"
                    />
                  </SelectItem>
                  <SelectItem value="least" className="text-xs py-1">
                    <FormattedMessage
                      id="widget.home.popular.sort.least"
                      defaultMessage="Least votes"
                    />
                  </SelectItem>
                  <SelectItem value="new" className="text-xs py-1">
                    <FormattedMessage id="widget.home.popular.sort.new" defaultMessage="Newest" />
                  </SelectItem>
                  <SelectItem value="old" className="text-xs py-1">
                    <FormattedMessage id="widget.home.popular.sort.old" defaultMessage="Oldest" />
                  </SelectItem>
                  <SelectItem value="trending" className="text-xs py-1">
                    <FormattedMessage
                      id="widget.home.popular.sort.trending"
                      defaultMessage="Trending"
                    />
                  </SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={activeBoardSlug ?? 'all'}
                onValueChange={(value) => {
                  const slug = value === 'all' ? null : value
                  setActiveBoardSlug(slug)
                  onBoardChange?.(slug)
                }}
              >
                <SelectTrigger
                  size="xs"
                  className="h-8 min-h-8 border-border/60 bg-card px-2 text-[11px]"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="start">
                  <SelectItem value="all" className="text-xs py-1">
                    <FormattedMessage id="widget.home.boards.all" defaultMessage="All categories" />
                  </SelectItem>
                  {boards.map((board) => (
                    <SelectItem key={board.id} value={board.slug} className="text-xs py-1">
                      {board.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Popular ideas */}
          <div className="mt-2 min-h-0 flex-1 flex flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
              {isPopularSearchActive && (
                <>
                  {(isPopularSearchFetching || popularSearch !== debouncedPopularSearch) && (
                    <div className="flex justify-center py-4">
                      <span className="text-[10px] text-muted-foreground/50">
                        <FormattedMessage
                          id="widget.home.popular.search.searching"
                          defaultMessage="Searching..."
                        />
                      </span>
                    </div>
                  )}
                  {!isPopularSearchFetching &&
                    popularSearch === debouncedPopularSearch &&
                    (popularSearchData?.posts.length ?? 0) === 0 && (
                      <div className="flex flex-col items-center justify-center py-8 text-center">
                        <MagnifyingGlassIcon className="w-8 h-8 text-muted-foreground/30 mb-2" />
                        <p className="text-sm font-medium text-muted-foreground/70">
                          <FormattedMessage
                            id="widget.home.popular.search.noResults"
                            defaultMessage="No ideas found"
                          />
                        </p>
                        <p className="text-xs text-muted-foreground/50 mt-0.5">
                          <FormattedMessage
                            id="widget.home.popular.search.noResultsHint"
                            defaultMessage="Try a different search term"
                          />
                        </p>
                      </div>
                    )}
                  {!isPopularSearchFetching &&
                    popularSearch === debouncedPopularSearch &&
                    (popularSearchData?.posts.length ?? 0) > 0 && (
                      <div className="space-y-0.5">
                        {popularSearchData!.posts.map((post) => (
                          <WidgetPostRow
                            key={post.id}
                            post={post}
                            statusMap={statusMap}
                            showBoard
                            canVote={canVote}
                            ensureSessionThen={ensureSessionThen}
                            onAuthRequired={() => handleAuthRequired(post.id)}
                            onSelect={() => onPostSelect?.(post.id)}
                          />
                        ))}
                      </div>
                    )}
                </>
              )}

              {!isPopularSearchActive && (
                <>
                  {isFetchingPosts && !isFetchingNextPage && allPopularPosts.length === 0 && (
                    <div className="flex justify-center py-4">
                      <span className="text-[10px] text-muted-foreground/50">
                        <FormattedMessage
                          id="widget.home.popular.loading"
                          defaultMessage="Loading..."
                        />
                      </span>
                    </div>
                  )}
                  {!isFetchingPosts && allPopularPosts.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <LightBulbIcon className="w-8 h-8 text-muted-foreground/30 mb-2" />
                      <p className="text-sm font-medium text-muted-foreground/70">
                        {activeBoardSlug ? (
                          <FormattedMessage
                            id="widget.home.popular.emptyBoard"
                            defaultMessage="No ideas in this board yet"
                          />
                        ) : (
                          <FormattedMessage
                            id="widget.home.popular.empty"
                            defaultMessage="No ideas yet"
                          />
                        )}
                      </p>
                      {!activeBoardSlug && (
                        <p className="text-xs text-muted-foreground/50 mt-0.5">
                          <FormattedMessage
                            id="widget.home.popular.emptyHint"
                            defaultMessage="Be the first to share one!"
                          />
                        </p>
                      )}
                    </div>
                  )}
                  {allPopularPosts.length > 0 && (
                    <div className="space-y-0.5">
                      {allPopularPosts.map((post) => (
                        <WidgetPostRow
                          key={post.id}
                          post={post}
                          statusMap={statusMap}
                          showBoard
                          canVote={canVote}
                          ensureSessionThen={ensureSessionThen}
                          onAuthRequired={() => handleAuthRequired(post.id)}
                          onSelect={() => onPostSelect?.(post.id)}
                        />
                      ))}
                      {hasNextPage && (
                        <div ref={postsSentinelRef} className="flex justify-center py-2">
                          {isFetchingNextPage && (
                            <span className="text-[10px] text-muted-foreground/50">
                              <FormattedMessage
                                id="widget.home.popular.loading"
                                defaultMessage="Loading..."
                              />
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <Dialog
        open={isCreateModalOpen && isActive}
        onOpenChange={(open) => {
          if (!open) {
            if (!isActive) return
            closeCreateModal()
            return
          }
          setIsCreateModalOpen(true)
          setError(null)
        }}
      >
        <DialogContent
          className="!inset-0 !top-0 !left-0 !flex !h-screen !w-screen !max-h-none !max-w-none !translate-x-0 !translate-y-0 !flex-col gap-0 overflow-hidden rounded-none border-0 p-0 !shadow-none"
          overlayClassName="!bg-transparent"
          onPointerDownOutside={(event) => event.preventDefault()}
        >
          <DialogHeader className="border-b border-border/60 px-4 pt-4 pb-3">
            <DialogTitle className="text-base">
              <FormattedMessage id="widget.home.form.newRequest" defaultMessage="New request" />
            </DialogTitle>
            <p className="text-[11px] text-muted-foreground">
              {user ? (
                <FormattedMessage
                  id="widget.home.posting.postingAs"
                  defaultMessage="Posting as {name}"
                  values={{
                    name: (
                      <span className="font-medium text-foreground">{user.name || user.email}</span>
                    ),
                  }}
                />
              ) : needsEmail ? (
                email.trim() ? (
                  <FormattedMessage
                    id="widget.home.posting.postingAs"
                    defaultMessage="Posting as {name}"
                    values={{
                      name: <span className="font-medium text-foreground">{email.trim()}</span>,
                    }}
                  />
                ) : (
                  <FormattedMessage
                    id="widget.home.posting.emailRequired"
                    defaultMessage="Your email is required"
                  />
                )
              ) : (
                <FormattedMessage
                  id="widget.home.posting.postingAnonymously"
                  defaultMessage="Posting anonymously"
                />
              )}
            </p>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="flex flex-1 min-h-0 flex-col overflow-hidden">
            <div className="flex flex-1 min-h-0 flex-col gap-3 overflow-hidden px-4 pt-3 pb-2">
              <div className="shrink-0 flex flex-col gap-2">
                {boards.length > 1 && (
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-muted-foreground">
                      <FormattedMessage
                        id="widget.home.posting.postingTo"
                        defaultMessage="Posting to"
                      />
                    </span>
                    <Select value={selectedBoardId} onValueChange={setSelectedBoardId}>
                      <SelectTrigger
                        size="xs"
                        className="h-8 min-h-8 border-border/60 bg-card px-2 text-[11px]"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent align="start">
                        {boards.map((b) => (
                          <SelectItem key={b.id} value={b.id} className="text-xs py-1">
                            {b.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <input
                  type="text"
                  autoFocus
                  placeholder={intl.formatMessage({
                    id: 'widget.home.input.placeholder',
                    defaultMessage: "What's your idea?",
                  })}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full rounded-md border border-border/60 bg-card px-3 py-2 text-base font-semibold text-foreground outline-none placeholder:font-normal placeholder:text-muted-foreground/50"
                />
              </div>

              <div className="min-h-0 overflow-hidden rounded-md border border-border/60 bg-card">
                <RichTextEditor
                  value={contentJson || ''}
                  onChange={handleEditorChange}
                  placeholder={intl.formatMessage({
                    id: 'widget.home.input.details',
                    defaultMessage: 'Add more details...',
                  })}
                  minHeight="90px"
                  maxHeight="100%"
                  borderless
                  toolbarPosition="top"
                  toolbarVariant="media-history"
                  defaultImageWidth={320}
                  features={{
                    images: canUploadImages,
                    bubbleMenu: false,
                    slashMenu: false,
                  }}
                  onImageUpload={canUploadImages ? uploadImage : undefined}
                  className="h-full text-sm [&_.tiptap.ProseMirror]:px-3 [&_.tiptap.ProseMirror]:py-2"
                />
              </div>

              {hasSimilarPosts && (
                <div className="shrink-0 border-t border-border/60 pt-3">
                  <p className="mb-1.5 flex items-center gap-1 text-[10px] font-medium text-muted-foreground/70">
                    <LightBulbIcon className="h-3 w-3" />
                    <FormattedMessage
                      id="widget.home.similar.heading"
                      defaultMessage="Similar ideas"
                    />
                  </p>
                  <div className="space-y-0.5">
                    {similarPosts.map((post) => (
                      <WidgetPostRow
                        key={post.id}
                        post={post}
                        statusMap={statusMap}
                        compact
                        canVote={canVote}
                        ensureSessionThen={ensureSessionThen}
                        onAuthRequired={() => handleAuthRequired(post.id)}
                        onSelect={() => onPostSelect?.(post.id)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {error && (
                <div className="shrink-0 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {error}
                </div>
              )}
            </div>

            <div className="shrink-0 border-t border-border bg-muted/30 px-4 py-3">
              {needsEmail && (
                <div className="mb-2 flex gap-2">
                  <input
                    type="email"
                    required
                    placeholder={intl.formatMessage({
                      id: 'widget.home.form.emailPlaceholder',
                      defaultMessage: 'Your email',
                    })}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={`flex-1 min-w-0 ${identityInputCls}`}
                  />
                  <input
                    type="text"
                    placeholder={intl.formatMessage({
                      id: 'widget.home.form.namePlaceholder',
                      defaultMessage: 'Name (optional)',
                    })}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className={`w-28 shrink-0 ${identityInputCls}`}
                  />
                </div>
              )}

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={closeCreateModal}
                  className="rounded-md px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
                >
                  <FormattedMessage id="widget.home.form.cancel" defaultMessage="Cancel" />
                </button>
                <button
                  type="submit"
                  disabled={!canSubmitForm || isSubmitting}
                  className="shrink-0 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {isSubmitting ? (
                    <FormattedMessage
                      id="widget.home.form.submitting"
                      defaultMessage="Submitting..."
                    />
                  ) : (
                    <FormattedMessage id="widget.home.form.submit" defaultMessage="Submit" />
                  )}
                </button>
              </div>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
