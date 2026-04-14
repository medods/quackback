import { DEFAULT_PORTAL_MODULES, type PortalModules } from '@/lib/server/domains/settings'

export function resolvePortalModules(
  modules?: Partial<PortalModules> | null | undefined
): PortalModules {
  return {
    feedback: modules?.feedback ?? DEFAULT_PORTAL_MODULES.feedback,
    roadmap: modules?.roadmap ?? DEFAULT_PORTAL_MODULES.roadmap,
    changelog: modules?.changelog ?? DEFAULT_PORTAL_MODULES.changelog,
  }
}

export function areAllPortalModulesDisabled(modules: PortalModules): boolean {
  return !modules.feedback && !modules.roadmap && !modules.changelog
}
