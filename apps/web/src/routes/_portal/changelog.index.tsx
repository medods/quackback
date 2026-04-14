import { createFileRoute } from '@tanstack/react-router'
import { useIntl } from 'react-intl'
import { RssIcon } from '@heroicons/react/24/outline'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/shared/page-header'
import { ChangelogListPublic } from '@/components/portal/changelog'
import { PortalModuleUnavailable } from '@/components/public/portal-module-unavailable'
import { areAllPortalModulesDisabled, resolvePortalModules } from '@/lib/shared/portal-modules'

export const Route = createFileRoute('/_portal/changelog/')({
  loader: async ({ context }) => {
    const modules = resolvePortalModules(context.settings?.publicPortalConfig?.modules)
    const allModulesDisabled = areAllPortalModulesDisabled(modules)

    return {
      workspaceName: context.settings?.name ?? 'Quackback',
      baseUrl: context.baseUrl ?? '',
      moduleUnavailable: !modules.changelog,
      allModulesDisabled,
    }
  },
  head: ({ loaderData }) => {
    if (!loaderData) return {}
    if (loaderData.moduleUnavailable) {
      const { workspaceName, baseUrl } = loaderData
      const title = loaderData.allModulesDisabled
        ? `${workspaceName} - Sections unavailable`
        : `Changelog unavailable - ${workspaceName}`
      const description = loaderData.allModulesDisabled
        ? 'Feedback, Roadmap, and Changelog are currently unavailable for this workspace.'
        : 'The changelog section is currently unavailable for this workspace.'
      const canonicalUrl = baseUrl ? `${baseUrl}/changelog` : ''
      return {
        meta: [
          { title },
          { name: 'description', content: description },
          { property: 'og:title', content: title },
          { property: 'og:description', content: description },
          ...(canonicalUrl ? [{ property: 'og:url', content: canonicalUrl }] : []),
          { name: 'twitter:title', content: title },
          { name: 'twitter:description', content: description },
        ],
        links: canonicalUrl ? [{ rel: 'canonical', href: canonicalUrl }] : [],
      }
    }
    const { workspaceName, baseUrl } = loaderData
    const title = `Changelog - ${workspaceName}`
    const description = `Stay up to date with the latest ${workspaceName} product updates and shipped features.`
    const canonicalUrl = baseUrl ? `${baseUrl}/changelog` : ''
    return {
      meta: [
        { title },
        { name: 'description', content: description },
        { property: 'og:title', content: title },
        { property: 'og:description', content: description },
        ...(canonicalUrl ? [{ property: 'og:url', content: canonicalUrl }] : []),
        { name: 'twitter:title', content: title },
        { name: 'twitter:description', content: description },
      ],
      links: canonicalUrl ? [{ rel: 'canonical', href: canonicalUrl }] : [],
    }
  },
  component: ChangelogPage,
})

function ChangelogPage() {
  const { moduleUnavailable, allModulesDisabled } = Route.useLoaderData()

  if (moduleUnavailable) {
    return (
      <PortalModuleUnavailable moduleName="Changelog" allModulesDisabled={allModulesDisabled} />
    )
  }

  return <ChangelogContent />
}

function ChangelogContent() {
  const intl = useIntl()

  return (
    <div className="py-8">
      <PageHeader
        size="large"
        title={intl.formatMessage({ id: 'portal.changelog.title', defaultMessage: 'Changelog' })}
        description={intl.formatMessage({
          id: 'portal.changelog.description',
          defaultMessage: 'Stay up to date with the latest product updates and shipped features.',
        })}
        action={
          <Button variant="outline" size="sm" asChild className="shrink-0 gap-1.5">
            <a href="/changelog/feed" target="_blank" rel="noopener noreferrer">
              <RssIcon className="h-4 w-4" />
              <span className="hidden sm:inline">
                {intl.formatMessage({ id: 'portal.changelog.rssFeed', defaultMessage: 'RSS Feed' })}
              </span>
            </a>
          </Button>
        }
        animate
        className="mb-8"
      />

      <div
        className="animate-in fade-in duration-300 fill-mode-backwards"
        style={{ animationDelay: '100ms' }}
      >
        <ChangelogListPublic />
      </div>
    </div>
  )
}
