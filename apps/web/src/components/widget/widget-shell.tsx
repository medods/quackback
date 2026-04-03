import { type ReactNode } from 'react'
import {
  ArrowLeftIcon,
  BookOpenIcon,
  LightBulbIcon,
  NewspaperIcon,
} from '@heroicons/react/24/solid'
import { FormattedMessage, useIntl } from 'react-intl'
import { cn } from '@/lib/shared/utils'

export type WidgetTab = 'feedback' | 'changelog' | 'help'

const TAB_CONFIG: {
  tab: WidgetTab
  icon: typeof LightBulbIcon
  labelId: string
  defaultLabel: string
}[] = [
  {
    tab: 'feedback',
    icon: LightBulbIcon,
    labelId: 'widget.shell.tab.feedback',
    defaultLabel: 'Feedback',
  },
  {
    tab: 'changelog',
    icon: NewspaperIcon,
    labelId: 'widget.shell.tab.changelog',
    defaultLabel: 'Changelog',
  },
  { tab: 'help', icon: BookOpenIcon, labelId: 'widget.shell.tab.help', defaultLabel: 'Help' },
]

interface WidgetShellProps {
  orgSlug: string
  activeTab: WidgetTab
  onTabChange: (tab: WidgetTab) => void
  onBack?: () => void
  enabledTabs?: { feedback?: boolean; changelog?: boolean; help?: boolean }
  children: ReactNode
}

export function WidgetShell({
  // orgSlug,
  activeTab,
  onTabChange,
  onBack,
  enabledTabs = { feedback: true, changelog: false, help: false },
  children,
}: WidgetShellProps) {
  const intl = useIntl()
  const enabledCount = [enabledTabs.feedback, enabledTabs.changelog, enabledTabs.help].filter(
    Boolean
  ).length
  const showTabBar = enabledCount > 1

  return (
    <div className="flex flex-col h-full bg-background text-foreground overflow-x-hidden">
      <div className="flex items-center justify-between px-3 pt-2 pb-0.5 shrink-0">
        <div className="flex items-center gap-1">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-muted transition-colors"
              aria-label={intl.formatMessage({
                id: 'widget.shell.aria.goBack',
                defaultMessage: 'Go back',
              })}
            >
              <ArrowLeftIcon className="w-4 h-4 text-muted-foreground" />
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex-1 overflow-hidden min-h-0">{children}</div>

      {/* Bottom tab bar + footer */}
      <div className="border-t border-border/40 shrink-0">
        {showTabBar && (
          <div className="flex">
            {TAB_CONFIG.filter(({ tab }) => enabledTabs[tab]).map(
              ({ tab, icon: Icon, labelId, defaultLabel }) => (
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
                  <span className="text-xs font-medium">
                    <FormattedMessage id={labelId} defaultMessage={defaultLabel} />
                  </span>
                </button>
              )
            )}
          </div>
        )}
      </div>
    </div>
  )
}
