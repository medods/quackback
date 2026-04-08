import { useCallback, useEffect, useRef } from 'react'

interface UseInfiniteScrollOptions {
  /** Whether there are more items to load */
  hasMore: boolean
  /** Whether a fetch is currently in progress */
  isFetching?: boolean
  /** Called when the sentinel enters the viewport */
  onLoadMore: () => void
  /** Root margin for early triggering (default: '100px') */
  rootMargin?: string
  /** Intersection threshold (default: 0) */
  threshold?: number
}

export function useInfiniteScroll({
  hasMore,
  isFetching = false,
  onLoadMore,
  rootMargin = '100px',
  threshold = 0,
}: UseInfiniteScrollOptions) {
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const observerRef = useRef<IntersectionObserver | null>(null)

  const hasMoreRef = useRef(hasMore)
  const isFetchingRef = useRef(isFetching)
  const onLoadMoreRef = useRef(onLoadMore)

  useEffect(() => {
    hasMoreRef.current = hasMore
    isFetchingRef.current = isFetching
    onLoadMoreRef.current = onLoadMore
  })

  const observe = useCallback(
    (el: HTMLDivElement | null) => {
      if (observerRef.current) {
        observerRef.current.disconnect()
        observerRef.current = null
      }
      sentinelRef.current = el
      if (!el || !hasMoreRef.current) return

      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting && !isFetchingRef.current) {
            onLoadMoreRef.current()
          }
        },
        { rootMargin, threshold }
      )
      observer.observe(el)
      observerRef.current = observer
    },
    // rootMargin and threshold are stable config values
    [rootMargin, threshold]
  )

  // Re-observe when hasMore changes (e.g. after search clears and sentinel remounts)
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    observe(el)
  }, [hasMore, observe])

  return observe
}
