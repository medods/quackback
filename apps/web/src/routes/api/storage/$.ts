import { createFileRoute } from '@tanstack/react-router'

// In-memory cache for proxied assets (e.g. email logos) to avoid S3 round-trips.
// Entries expire after 1 hour. Logo images are typically < 50 KB so memory is negligible.
const proxyCache = new Map<string, { data: ArrayBuffer; contentType: string; cachedAt: number }>()
const PROXY_CACHE_TTL = 60 * 60 * 1000 // 1 hour

export const Route = createFileRoute('/api/storage/$')({
  server: {
    handlers: {
      /**
       * GET /api/storage/*
       * Serve files from S3 storage.
       *
       * When S3_PROXY is enabled, streams file bytes through the server — useful when
       * the browser can't reach the S3 endpoint directly (e.g., ngrok, mixed content).
       *
       * Otherwise, redirects to a presigned S3 URL (302) so the browser fetches
       * directly from S3 — no bytes are proxied through the server.
       */
      GET: async ({ request }) => {
        const { isS3Configured, generatePresignedGetUrl, getS3Object } =
          await import('@/lib/server/storage/s3')
        const { config } = await import('@/lib/server/config')

        if (!isS3Configured()) {
          return Response.json({ error: 'Storage not configured' }, { status: 503 })
        }

        const url = new URL(request.url)
        const prefix = '/api/storage/'
        const key = decodeURIComponent(url.pathname.slice(prefix.length))

        if (!key || key.includes('..')) {
          return Response.json({ error: 'Invalid storage key' }, { status: 400 })
        }

        // Force proxy for email embeds (?email=1) since email clients don't follow redirects
        const forceProxy = url.searchParams.has('email')

        try {
          if (config.s3Proxy || forceProxy) {
            // Serve from cache if fresh
            const cached = proxyCache.get(key)
            if (cached && Date.now() - cached.cachedAt < PROXY_CACHE_TTL) {
              return new Response(cached.data, {
                status: 200,
                headers: {
                  'Content-Type': cached.contentType,
                  'Cache-Control': 'public, max-age=31536000, immutable',
                },
              })
            }

            const { body, contentType } = await getS3Object(key)
            const data = await new Response(body).arrayBuffer()

            proxyCache.set(key, { data, contentType, cachedAt: Date.now() })

            return new Response(data, {
              status: 200,
              headers: {
                'Content-Type': contentType,
                'Cache-Control': 'public, max-age=31536000, immutable',
              },
            })
          }

          const presignedUrl = await generatePresignedGetUrl(key)

          return new Response(null, {
            status: 302,
            headers: {
              Location: presignedUrl,
              'Cache-Control': 'public, max-age=86400',
            },
          })
        } catch (error) {
          console.error('Error serving storage object:', error)
          return Response.json({ error: 'Failed to resolve storage URL' }, { status: 500 })
        }
      },
    },
  },
})
