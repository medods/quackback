import { useCallback } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BellIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import { FormattedMessage, type IntlShape, useIntl } from 'react-intl'
import type { NotificationId } from '@quackback/ids'
import { Spinner } from '@/components/shared/spinner'
import { getTimeAgo } from '@/components/ui/time-ago'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/shared/utils'
import { getWidgetAuthHeaders } from '@/lib/client/widget-auth'
import {
  getNotificationsFn,
  markAllNotificationsAsReadFn,
  markNotificationAsReadFn,
} from '@/lib/server/functions/notifications'
import { getNotificationTypeConfig } from '@/components/notifications/notification-type-config'
import { useWidgetAuth } from './widget-auth-provider'

interface WidgetNotificationsProps {
  onPostSelect?: (postId: string) => void
}

interface WidgetNotification {
  id: NotificationId
  type: string
  title: string
  body: string | null
  postId: string | null
  metadata: Record<string, unknown> | null
  readAt: string | null
  createdAt: string
  post?: {
    id: string
    title: string
    boardSlug: string
  } | null
}

interface WidgetNotificationsResponse {
  notifications: WidgetNotification[]
}

const widgetNotificationsKeys = {
  all: ['widget', 'notifications'] as const,
  list: (sessionVersion: number) => ['widget', 'notifications', 'list', sessionVersion] as const,
}

const EMPTY_RESULT: WidgetNotificationsResponse = {
  notifications: [],
}

function formatNotificationTime(iso: string, locale: string): string {
  return getTimeAgo(iso, locale)
}

function getStringMetadata(metadata: Record<string, unknown> | null, key: string): string | null {
  const value = metadata?.[key]
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

function getBooleanMetadata(metadata: Record<string, unknown> | null, key: string): boolean {
  return metadata?.[key] === true
}

function getLocalizedNotificationCopy(
  notification: WidgetNotification,
  intl: IntlShape
): { title: string; body: string | null } {
  const metadata = notification.metadata

  if (notification.type === 'post_status_changed') {
    const postTitle = getStringMetadata(metadata, 'postTitle') ?? notification.post?.title ?? null
    const previousStatus = getStringMetadata(metadata, 'previousStatus')
    const newStatus = getStringMetadata(metadata, 'newStatus')

    const title = newStatus
      ? intl.formatMessage(
          {
            id: 'widget.notifications.type.postStatusChanged.titleWithStatus',
            defaultMessage: 'Status changed: {status}',
          },
          { status: newStatus }
        )
      : intl.formatMessage({
          id: 'widget.notifications.type.postStatusChanged.title',
          defaultMessage: 'Status changed',
        })

    if (postTitle && previousStatus && newStatus) {
      return {
        title,
        body: intl.formatMessage(
          {
            id: 'widget.notifications.type.postStatusChanged.body.withFromTo',
            defaultMessage: '{postTitle}: {previousStatus} -> {newStatus}',
          },
          { postTitle, previousStatus, newStatus }
        ),
      }
    }

    if (postTitle && newStatus) {
      return {
        title,
        body: intl.formatMessage(
          {
            id: 'widget.notifications.type.postStatusChanged.body.withTo',
            defaultMessage: '{postTitle}: {newStatus}',
          },
          { postTitle, newStatus }
        ),
      }
    }

    return { title, body: notification.body }
  }

  if (notification.type === 'comment_created') {
    const commenterName =
      getStringMetadata(metadata, 'commenterName') ??
      intl.formatMessage({
        id: 'widget.notifications.type.commentCreated.someone',
        defaultMessage: 'Someone',
      })
    const isTeamMember = getBooleanMetadata(metadata, 'isTeamMember')
    const commentPreview = getStringMetadata(metadata, 'commentPreview')

    return {
      title: intl.formatMessage(
        {
          id: isTeamMember
            ? 'widget.notifications.type.commentCreated.titleTeam'
            : 'widget.notifications.type.commentCreated.title',
          defaultMessage: isTeamMember ? '{name} (team) commented' : '{name} commented',
        },
        { name: commenterName }
      ),
      body: commentPreview ?? notification.body,
    }
  }

  if (notification.type === 'changelog_published') {
    const changelogTitle = getStringMetadata(metadata, 'changelogTitle')
    const contentPreview = getStringMetadata(metadata, 'contentPreview')
    return {
      title: changelogTitle
        ? intl.formatMessage(
            {
              id: 'widget.notifications.type.changelogPublished.titleWithName',
              defaultMessage: 'New update: {title}',
            },
            { title: changelogTitle }
          )
        : intl.formatMessage({
            id: 'widget.notifications.type.changelogPublished.title',
            defaultMessage: 'New update',
          }),
      body: contentPreview ?? notification.body,
    }
  }

  if (notification.type === 'post_mentioned') {
    return {
      title: intl.formatMessage({
        id: 'widget.notifications.type.postMentioned.title',
        defaultMessage: 'You were mentioned',
      }),
      body: notification.body,
    }
  }

  return { title: notification.title, body: notification.body }
}

export function WidgetNotifications({ onPostSelect }: WidgetNotificationsProps) {
  const queryClient = useQueryClient()
  const intl = useIntl()
  const { sessionVersion } = useWidgetAuth()
  const hasToken = Boolean(getWidgetAuthHeaders().Authorization)

  const { data, isLoading, isError } = useQuery({
    queryKey: widgetNotificationsKeys.list(sessionVersion),
    queryFn: async (): Promise<WidgetNotificationsResponse> => {
      const headers = getWidgetAuthHeaders()
      if (!headers.Authorization) return EMPTY_RESULT

      const result = await getNotificationsFn({
        data: { limit: 50, offset: 0, unreadOnly: false },
        headers,
      })

      return result as WidgetNotificationsResponse
    },
    enabled: hasToken,
    staleTime: 15_000,
    refetchInterval: hasToken ? 30_000 : false,
  })

  const markAsRead = useMutation({
    mutationFn: (notificationId: NotificationId) =>
      markNotificationAsReadFn({
        data: { notificationId },
        headers: getWidgetAuthHeaders(),
      }),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: widgetNotificationsKeys.all })
    },
  })

  const markAllAsRead = useMutation({
    mutationFn: () =>
      markAllNotificationsAsReadFn({
        headers: getWidgetAuthHeaders(),
      }),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: widgetNotificationsKeys.all })
    },
  })

  const notifications = data?.notifications ?? []
  const unreadCount = notifications.reduce((count, item) => count + (item.readAt ? 0 : 1), 0)

  const handleNotificationClick = useCallback(
    (notification: WidgetNotification) => {
      if (!notification.readAt) {
        markAsRead.mutate(notification.id)
      }

      if (notification.postId) {
        onPostSelect?.(notification.postId)
      }
    },
    [markAsRead, onPostSelect]
  )

  if (!hasToken) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-4 text-center">
        <BellIcon className="mb-2 h-8 w-8 text-muted-foreground/40" />
        <p className="text-sm font-medium text-foreground">
          <FormattedMessage
            id="widget.notifications.authRequired.title"
            defaultMessage="No notifications yet"
          />
        </p>
        <p className="mt-1 text-xs text-muted-foreground/70">
          <FormattedMessage
            id="widget.notifications.authRequired.hint"
            defaultMessage="Sign in, vote, or comment to start receiving updates."
          />
        </p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center py-10">
        <Spinner />
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-4 text-center">
        <ExclamationTriangleIcon className="mb-2 h-8 w-8 text-muted-foreground/40" />
        <p className="text-sm font-medium text-foreground">
          <FormattedMessage
            id="widget.notifications.error.title"
            defaultMessage="Could not load notifications"
          />
        </p>
        <p className="mt-1 text-xs text-muted-foreground/70">
          <FormattedMessage
            id="widget.notifications.error.hint"
            defaultMessage="Please try again."
          />
        </p>
      </div>
    )
  }

  if (notifications.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-4 text-center">
        <BellIcon className="mb-2 h-8 w-8 text-muted-foreground/40" />
        <p className="text-sm font-medium text-foreground">
          <FormattedMessage id="widget.notifications.empty.title" defaultMessage="All caught up" />
        </p>
        <p className="mt-1 text-xs text-muted-foreground/70">
          <FormattedMessage
            id="widget.notifications.empty.hint"
            defaultMessage="You'll see status updates and new comments here."
          />
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-border/40 px-3 py-2.5">
        <h3 className="text-sm font-medium text-foreground">
          <FormattedMessage id="widget.notifications.title" defaultMessage="Notifications" />
        </h3>
        {unreadCount > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => markAllAsRead.mutate()}
            disabled={markAllAsRead.isPending}
            className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            <FormattedMessage
              id="widget.notifications.markAllRead"
              defaultMessage="Mark all read"
            />
          </Button>
        )}
      </div>

      <ScrollArea scrollBarClassName="w-1.5" className="min-h-0 flex-1">
        <div className="divide-y divide-border/40">
          {notifications.map((notification) => {
            const config = getNotificationTypeConfig(notification.type)
            const Icon = config.icon
            const isUnread = !notification.readAt
            const localizedCopy = getLocalizedNotificationCopy(notification, intl)

            return (
              <button
                key={notification.id}
                type="button"
                onClick={() => handleNotificationClick(notification)}
                className={cn(
                  'w-full text-left transition-colors hover:bg-muted/30',
                  isUnread && 'bg-primary/[0.02]'
                )}
              >
                <div className="flex items-start gap-3 px-3 py-3">
                  <div
                    className={cn(
                      'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                      config.bgClass
                    )}
                  >
                    <Icon className={cn('h-4 w-4', config.iconClass)} />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        'text-sm leading-tight',
                        isUnread ? 'font-medium' : 'font-normal'
                      )}
                    >
                      {localizedCopy.title}
                    </p>
                    {localizedCopy.body && (
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground/80">
                        {localizedCopy.body}
                      </p>
                    )}
                    <p className="mt-1 text-[10px] text-muted-foreground/60">
                      {formatNotificationTime(notification.createdAt, intl.locale)}
                    </p>
                  </div>

                  {isUnread && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />}
                </div>
              </button>
            )
          })}
        </div>
      </ScrollArea>
    </div>
  )
}
