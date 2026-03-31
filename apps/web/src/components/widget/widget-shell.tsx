import { type ReactNode, useEffect } from 'react'
import { BookOpenIcon, LightBulbIcon, NewspaperIcon } from '@heroicons/react/24/solid'
import { cn } from '@/lib/shared/utils'
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
  enabledTabs = { feedback: true, changelog: false, help: false },
  children,
}: WidgetShellProps) {
  const enabledCount = [enabledTabs.feedback, enabledTabs.changelog, enabledTabs.help].filter(
    Boolean
  ).length
  const showTabBar = enabledCount > 1
  const { closeWidget } = useWidgetAuth()
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
