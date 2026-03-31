import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  ArrowLeftIcon,
  XMarkIcon,
  LightBulbIcon,
  NewspaperIcon,
  BookOpenIcon,
} from '@heroicons/react/24/solid'
import { cn } from '@/lib/shared/utils'
import { Avatar } from '@/components/ui/avatar'
import { UserStatsBar } from '@/components/shared/user-stats'
import { getWidgetAuthHeaders } from '@/lib/client/widget-auth'
import { useWidgetAuth } from './widget-auth-provider'
import { t } from './i18n'

export type WidgetTab = 'feedback' | 'changelog' | 'help'

interface WidgetShellProps {
  orgSlug: string
  activeTab: WidgetTab
  onTabChange: (tab: WidgetTab) => void
  onBack?: () => void
  enabledTabs?: { feedback?: boolean; changelog?: boolean; help?: boolean }
  showCloseButton?: boolean
  children: ReactNode
}

export function WidgetShell({
  activeTab,
  onTabChange,
  onBack,
  enabledTabs = { feedback: true, changelog: false, help: false },
  showCloseButton = true,
  children,
}: WidgetShellProps) {
  const enabledCount = [enabledTabs.feedback, enabledTabs.changelog, enabledTabs.help].filter(
    Boolean
  ).length
  const showTabBar = enabledCount > 1
  const { user, closeWidget } = useWidgetAuth()
  const tabConfig: { tab: WidgetTab; icon: typeof LightBulbIcon; label: string }[] = [
    { tab: 'feedback', icon: LightBulbIcon, label: t('shell.feedback') },
    { tab: 'changelog', icon: NewspaperIcon, label: t('shell.changelog') },
    { tab: 'help', icon: BookOpenIcon, label: t('shell.help') },
  ]

  // Global Escape key handler — close widget from anywhere
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        closeWidget()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [closeWidget])

  return (
    <div className="flex flex-col h-full bg-background text-foreground">
      <div className="flex items-center justify-between px-3 pt-2 pb-0.5 shrink-0">
        <div className="flex items-center gap-1">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-muted transition-colors"
              aria-label={t('shell.goBack')}
            >
              <ArrowLeftIcon className="w-4 h-4 text-muted-foreground" />
            </button>
          ) : (
            <h2 className="text-sm font-semibold text-foreground pl-0.5">
              {activeTab === 'feedback'
                ? t('shell.shareIdeas')
                : activeTab === 'help'
                  ? t('shell.helpCenter')
                  : t('shell.whatsNew')}
            </h2>
          )}
        </div>
        <div className="flex items-center gap-1">
          {user && <UserAvatarPopover user={user} />}
          {showCloseButton && (
            <button
              type="button"
              onClick={closeWidget}
              className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-muted transition-colors"
              aria-label={t('shell.closeWidget')}
            >
              <XMarkIcon className="w-4 h-4 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-hidden min-h-0">{children}</div>

      {/* Bottom tab bar + footer */}
      <div className="border-t border-border/40 shrink-0">
        {showTabBar && (
          <div className="flex">
            {tabConfig
              .filter(({ tab }) => enabledTabs[tab])
              .map(({ tab, icon: Icon, label }) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => onTabChange(tab)}
                  className={cn(
                    'flex-1 flex flex-col items-center gap-0.5 py-2 transition-colors',
                    activeTab === tab
                      ? 'text-primary'
                      : 'text-muted-foreground/60 hover:text-muted-foreground'
                  )}
                >
                  <Icon className="w-5 h-5" />
                  <span className="text-xs font-medium">{label}</span>
                </button>
              ))}
          </div>
        )}
      </div>
    </div>
  )
}

function UserAvatarPopover({
  user,
}: {
  user: { name: string; email: string; avatarUrl: string | null }
}) {
  const [open, setOpen] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  return (
    <div className="relative" ref={popoverRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-7 h-7 flex items-center justify-center rounded-full hover:ring-2 hover:ring-primary/20 transition-all"
        aria-label={t('shell.userMenu')}
      >
        <Avatar src={user.avatarUrl} name={user.name} className="size-6 text-[10px]" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 z-50 w-56 rounded-lg border border-border bg-card shadow-lg">
          <div className="px-3 py-3">
            <div className="flex items-center gap-2.5">
              <Avatar src={user.avatarUrl} name={user.name} className="size-9 text-sm" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground truncate">{user.name}</p>
                <p className="text-[11px] text-muted-foreground truncate">{user.email}</p>
              </div>
            </div>
          </div>
          <div className="border-t border-border px-3 py-2.5">
            <UserStatsBar compact headers={getWidgetAuthHeaders()} />
          </div>
        </div>
      )}
    </div>
  )
}
