import { ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import { EmptyState } from '@/components/shared/empty-state'

interface PortalModuleUnavailableProps {
  moduleName: 'Feedback' | 'Roadmap' | 'Changelog'
  allModulesDisabled?: boolean
}

export function PortalModuleUnavailable({
  moduleName,
  allModulesDisabled = false,
}: PortalModuleUnavailableProps) {
  const title = allModulesDisabled ? 'Sections unavailable' : `${moduleName} is unavailable`
  const description = allModulesDisabled
    ? 'Feedback, Roadmap, and Changelog are currently unavailable for this workspace.'
    : `The ${moduleName} section is currently unavailable for this workspace.`

  return (
    <div className="py-6">
      <EmptyState
        icon={ExclamationTriangleIcon}
        title={title}
        description={description}
        className="py-24"
      />
    </div>
  )
}
