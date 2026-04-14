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
  | { view: 'home'; sort?: string; board?: string }
  | { view: 'post-detail'; postId: string; board?: string }
  | { view: 'changelog'; sort?: string }
  | { view: 'changelog-detail'; changelogId: string }
  | { view: 'help' }
  | { view: 'notifications' }

// ---- Public SDK API ----

export interface QuackbackRouterAdapter {
  read: () => WidgetRoute | null | undefined
  write: (route: WidgetRoute) => void | Promise<void>
  subscribe?: (onRoute: (route: WidgetRoute) => void) => (() => void) | void
}

export interface QuackbackInitOptions {
  placement?: 'left' | 'right'
  trigger?: boolean
  selector?: string
  mountSelector?: string
  buttonColor?: string
  defaultBoard?: string
  locale?: string
  router?: QuackbackRouterAdapter
}

export type QuackbackIdentifyOptions =
  | null
  | { anonymous: true }
  | {
      ssoToken: string
      id?: string
      email?: string
      name?: string
      avatarURL?: string
      created?: string
      hash?: string
      anonymous?: false
    }
  | {
      id: string
      email: string
      name?: string
      avatarURL?: string
      created?: string
      hash?: string
      ssoToken?: string
      anonymous?: false
    }

export type QuackbackOpenOptions =
  | {
      view?:
        | 'home'
        | 'new-post'
        | 'post-detail'
        | 'changelog'
        | 'changelog-detail'
        | 'help'
        | 'notifications'
      title?: string
      board?: string
      postId?: string
      changelogId?: string
      sort?: string
    }
  | undefined

export type QuackbackMetadata = Record<string, string | number | boolean | null | undefined>

export interface QuackbackAPI {
  (command: 'init', options?: QuackbackInitOptions): void
  (command: 'identify', options: QuackbackIdentifyOptions): void
  (command: 'open', options?: QuackbackOpenOptions): void
  (command: 'close'): void
  (command: 'destroy'): void
  (command: 'metadata', options: QuackbackMetadata): void
  <T extends WidgetEventName>(
    command: 'on',
    eventName: T,
    handler: (payload: WidgetEventMap[T]) => void
  ): (() => void) | void
  <T extends WidgetEventName>(
    command: 'off',
    eventName: T,
    handler?: (payload: WidgetEventMap[T]) => void
  ): void
  q?: Array<[command: string, options?: unknown, extra?: unknown]>
}

// ---- SDK -> Iframe Messages ----

export interface WidgetInboundMessages {
  'quackback:identify': { anonymous: true } | Record<string, unknown> | null
  'quackback:metadata': WidgetMetadata
  'quackback:locale': string
  'quackback:open':
    | {
        view?:
          | 'home'
          | 'new-post'
          | 'post-detail'
          | 'changelog'
          | 'changelog-detail'
          | 'help'
          | 'notifications'
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
