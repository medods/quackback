// ---- Metadata ----

/** Key-value string pairs attached to a widget session. Stored on posts created via the widget. */
export type WidgetMetadata = Record<string, string>

// ---- SDK Event Payloads ----

export interface WidgetEventMap {
  ready: Record<string, never>
  open: Record<string, never>
  close: Record<string, never>
  'post:created': {
    id: string
    title: string
    board: { id: string; name: string; slug: string }
    statusId: string | null
  }
  vote: {
    postId: string
    voted: boolean
    voteCount: number
  }
  'comment:created': {
    postId: string
    commentId: string
    parentId: string | null
  }
  identify: {
    success: boolean
    user: { id: string; name: string; email: string } | null
    anonymous: boolean
    error?: string
  }
}

export type WidgetEventName = keyof WidgetEventMap

export type WidgetRoute =
  | { view: 'home' }
  | { view: 'post-detail'; postId: string }
  | { view: 'changelog' }
  | { view: 'changelog-detail'; changelogId: string }

// ---- SDK -> Iframe Messages ----

export interface WidgetInboundMessages {
  'quackback:identify': { anonymous: true } | Record<string, unknown> | null
  'quackback:metadata': WidgetMetadata
  'quackback:open':
    | {
        view?: 'home' | 'new-post' | 'post-detail' | 'changelog' | 'changelog-detail' | 'help'
        title?: string
        board?: string
        postId?: string
        changelogId?: string
        __fromRouteSync?: boolean
      }
    | undefined
}

// ---- Iframe -> SDK Messages ----

export interface WidgetOutboundMessages {
  'quackback:ready': Record<string, never>
  'quackback:close': Record<string, never>
  'quackback:navigate': { url: string }
  'quackback:route-change': WidgetRoute
  'quackback:identify-result': {
    success: boolean
    user: { id: string; name: string; email: string; avatarUrl: string | null } | null
    error?: string
  }
  'quackback:auth-change': {
    user: { id: string; name: string; email: string; avatarUrl: string | null } | null
  }
  'quackback:event': {
    name: WidgetEventName
    payload: WidgetEventMap[WidgetEventName]
  }
}
