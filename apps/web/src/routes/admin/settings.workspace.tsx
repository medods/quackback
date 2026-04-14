import { useState, useTransition } from 'react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { Squares2X2Icon } from '@heroicons/react/24/solid'
import { BackLink } from '@/components/ui/back-link'
import { PageHeader } from '@/components/shared/page-header'
import { SettingsCard } from '@/components/admin/settings/settings-card'
import { Switch } from '@/components/ui/switch'
import { settingsQueries } from '@/lib/client/queries/settings'
import { updatePortalConfigFn } from '@/lib/server/functions/settings'
import { resolvePortalModules } from '@/lib/shared/portal-modules'

export const Route = createFileRoute('/admin/settings/workspace')({
  loader: async ({ context }) => {
    const { requireWorkspaceRole } = await import('@/lib/server/functions/workspace-utils')
    await requireWorkspaceRole({ data: { allowedRoles: ['admin'] } })

    const { queryClient } = context
    await queryClient.ensureQueryData(settingsQueries.portalConfig())

    return {}
  },
  component: WorkspaceSettingsPage,
})

interface ModuleToggleProps {
  id: string
  label: string
  description: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
}

function ModuleToggle({
  id,
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
}: ModuleToggleProps) {
  return (
    <div className="flex items-center justify-between py-4 first:pt-0 last:pb-0">
      <div className="pr-4">
        <label htmlFor={id} className="text-sm font-medium cursor-pointer">
          {label}
        </label>
        <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
    </div>
  )
}

type ModuleKey = 'feedback' | 'roadmap' | 'changelog'

function WorkspaceSettingsPage() {
  const router = useRouter()
  const portalConfigQuery = useSuspenseQuery(settingsQueries.portalConfig())
  const [isPending, startTransition] = useTransition()

  const modules = resolvePortalModules(portalConfigQuery.data.modules)
  const [feedback, setFeedback] = useState(modules.feedback)
  const [roadmap, setRoadmap] = useState(modules.roadmap)
  const [changelog, setChangelog] = useState(modules.changelog)

  async function updateModule(key: ModuleKey, value: boolean, revert: () => void) {
    try {
      await updatePortalConfigFn({ data: { modules: { [key]: value } } })
      startTransition(() => {
        router.invalidate()
      })
    } catch {
      revert()
    }
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="lg:hidden">
        <BackLink to="/admin/settings">Settings</BackLink>
      </div>

      <PageHeader
        icon={Squares2X2Icon}
        title="Workspace Modules"
        description="Control which portal modules are visible to visitors."
      />

      <SettingsCard
        title="Module Visibility"
        description="Disable modules to hide them from navigation and block direct access links."
      >
        <div className="divide-y divide-border/50">
          <ModuleToggle
            id="workspace-module-feedback"
            label="Feedback"
            description="Show the feedback board and feedback post pages."
            checked={feedback}
            onCheckedChange={(checked) => {
              setFeedback(checked)
              updateModule('feedback', checked, () => setFeedback(!checked))
            }}
            disabled={isPending}
          />
          <ModuleToggle
            id="workspace-module-roadmap"
            label="Roadmap"
            description="Show the public roadmap page."
            checked={roadmap}
            onCheckedChange={(checked) => {
              setRoadmap(checked)
              updateModule('roadmap', checked, () => setRoadmap(!checked))
            }}
            disabled={isPending}
          />
          <ModuleToggle
            id="workspace-module-changelog"
            label="Changelog"
            description="Show the public changelog and changelog entry pages."
            checked={changelog}
            onCheckedChange={(checked) => {
              setChangelog(checked)
              updateModule('changelog', checked, () => setChangelog(!checked))
            }}
            disabled={isPending}
          />
        </div>
      </SettingsCard>
    </div>
  )
}
