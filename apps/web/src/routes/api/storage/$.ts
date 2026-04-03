import { createFileRoute } from '@tanstack/react-router'

// In-memory cache for proxied assets (e.g. email logos) to avoid S3 round-trips.
// Entries expire after 1 hour. Logo images are typically < 50 KB so memory is negligible.
const proxyCache = new Map<string, { data: ArrayBuffer; contentType: string; cachedAt: number }>()
const PROXY_CACHE_TTL = 60 * 60 * 1000 // 1 hour

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split('.')
  if (parts.length !== 4) return false
  const nums = parts.map((part) => Number(part))
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false

  const [a, b] = nums
  if (a === 10) return true
  if (a === 127) return true
  if (a === 192 && b === 168) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 169 && b === 254) return true
  return false
}

function isLikelyPrivateStorageHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase()
  if (!host) return false
  if (host === 'localhost' || host === '::1' || host === 'host.docker.internal') return true
  if (host.endsWith('.local')) return true
  if (host === 'minio') return true
  if (isPrivateIpv4(host)) return true

  // Single-label hostnames (e.g. "minio", "bucket") are usually internal DNS.
  return !host.includes('.')
}

function shouldProxyPresignedUrl(presignedUrl: string): boolean {
  try {
    const url = new URL(presignedUrl)
    return isLikelyPrivateStorageHost(url.hostname)
  } catch {
    return false
  }
}

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
          const serveViaProxy = async (): Promise<Response> => {
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
          if (config.s3Proxy || forceProxy) {
            return serveViaProxy()
          }

          const presignedUrl = await generatePresignedGetUrl(key)

          // If presigned URL points to an internal host (e.g. "minio:9000"),
          // the browser on a public domain can't resolve it. Fall back to proxy mode.
          if (shouldProxyPresignedUrl(presignedUrl)) {
            return serveViaProxy()
          }

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
