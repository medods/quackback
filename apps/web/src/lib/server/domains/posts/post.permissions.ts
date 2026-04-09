/**
 * Post Permissions Service
 *
 * Handles user permission checks for editing and deleting their own posts.
 * Write operations (userEditPost, softDeletePost, restorePost, permanentDeletePost)
 * live in post.user-actions.ts.
 */

import { db, posts, comments, votes, eq, and, sql, isNull } from '@/lib/server/db'
import { toUuid, type PostId, type PrincipalId, type StatusId } from '@quackback/ids'
import { NotFoundError } from '@/lib/shared/errors'
import { isTeamMember } from '@/lib/shared/roles'
import { DEFAULT_PORTAL_CONFIG, type PortalConfig } from '@/lib/server/domains/settings'
import type { PermissionCheckResult } from './post.types'

// ============================================================================
// Permission Checks
// ============================================================================

/**
 * Check if a user can edit a post
 *
 * @param postId - Post ID to check
 * @param actor - Actor information (principalId, role)
 * @param portalConfig - Optional portal config (will fetch if not provided)
 * @returns Permission check result
 */
export async function canEditPost(
  postId: PostId,
  actor: { principalId: PrincipalId; role: 'admin' | 'member' | 'user' },
  portalConfig?: PortalConfig
): Promise<PermissionCheckResult> {
  console.log(
    `[domain:post-permissions] canEditPost: postId=${postId} principalId=${actor.principalId} role=${actor.role}`
  )
  // Get the post
  const post = await db.query.posts.findFirst({
    where: eq(posts.id, postId),
  })

  if (!post) {
    throw new NotFoundError('POST_NOT_FOUND', `Post with ID ${postId} not found`)
  }

  // Check if post is deleted
  if (post.deletedAt) {
    return { allowed: false, reason: 'Cannot edit a deleted post' }
  }

  // Team members (admin, member) can always edit
  if (isTeamMember(actor.role)) {
    return { allowed: true }
  }

  // Must be the author
  if (post.principalId !== actor.principalId) {
    return { allowed: false, reason: 'You can only edit your own posts' }
  }

  // Get portal config if not provided
  const config = portalConfig ?? (await getPortalConfig())

  // Check if status is default (Open)
  const isDefault = await isDefaultStatus(post.statusId)
  if (!isDefault && !config.features.allowEditAfterEngagement) {
    return { allowed: false, reason: 'Cannot edit posts that have been reviewed by the team' }
  }

  // Check for engagement (votes, comments from others)
  if (!config.features.allowEditAfterEngagement) {
    if (post.voteCount > 0) {
      const hasOtherVotes = await hasVotesFromOthers(postId, actor.principalId)
      if (hasOtherVotes) {
        return { allowed: false, reason: 'Cannot edit posts that have received votes' }
      }
    }

    const hasOtherComments = await hasCommentsFromOthers(postId, actor.principalId)
    if (hasOtherComments) {
      return {
        allowed: false,
        reason: 'Cannot edit posts that have comments from other users',
      }
    }
  }

  return { allowed: true }
}

/**
 * Check if a user can delete a post
 *
 * @param postId - Post ID to check
 * @param actor - Actor information (principalId, role)
 * @param portalConfig - Optional portal config (will fetch if not provided)
 * @returns Permission check result
 */
export async function canDeletePost(
  postId: PostId,
  actor: { principalId: PrincipalId; role: 'admin' | 'member' | 'user' },
  portalConfig?: PortalConfig
): Promise<PermissionCheckResult> {
  console.log(
    `[domain:post-permissions] canDeletePost: postId=${postId} principalId=${actor.principalId} role=${actor.role}`
  )
  // Get the post
  const post = await db.query.posts.findFirst({
    where: eq(posts.id, postId),
  })

  if (!post) {
    throw new NotFoundError('POST_NOT_FOUND', `Post with ID ${postId} not found`)
  }

  // Check if post is already deleted
  if (post.deletedAt) {
    return { allowed: false, reason: 'Post has already been deleted' }
  }

  // Team members (admin, member) can always delete
  if (isTeamMember(actor.role)) {
    return { allowed: true }
  }

  // Must be the author
  if (post.principalId !== actor.principalId) {
    return { allowed: false, reason: 'You can only delete your own posts' }
  }

  // Get portal config if not provided
  const config = portalConfig ?? (await getPortalConfig())

  // Check if status is default (Open)
  const isDefault = await isDefaultStatus(post.statusId)
  if (!isDefault && !config.features.allowDeleteAfterEngagement) {
    return {
      allowed: false,
      reason: 'Cannot delete posts that have been reviewed by the team',
    }
  }

  // Check for engagement (votes, comments)
  if (!config.features.allowDeleteAfterEngagement) {
    if (post.voteCount > 0) {
      const hasOtherVotes = await hasVotesFromOthers(postId, actor.principalId)
      if (hasOtherVotes) {
        return { allowed: false, reason: 'Cannot delete posts that have received votes' }
      }
    }
  }

  return { allowed: true }
}

/**
 * Combined permission check for edit and delete operations.
 * This is more efficient than calling canEditPost and canDeletePost separately
 * because it queries the post, portal config, and status only once.
 *
 * @param postId - Post ID to check
 * @param actor - Actor information (principalId, role)
 * @returns Both edit and delete permission results
 */
export async function getPostPermissions(
  postId: PostId,
  actor: { principalId: PrincipalId; role: 'admin' | 'member' | 'user' }
): Promise<{
  canEdit: PermissionCheckResult
  canDelete: PermissionCheckResult
}> {
  console.log(
    `[domain:post-permissions] getPostPermissions: postId=${postId} principalId=${actor.principalId} role=${actor.role}`
  )
  // Get the post with status in single query (eliminates separate isDefaultStatus query)
  const post = await db.query.posts.findFirst({
    where: eq(posts.id, postId),
    with: { postStatus: { columns: { isDefault: true } } },
  })

  if (!post) {
    throw new NotFoundError('POST_NOT_FOUND', `Post with ID ${postId} not found`)
  }

  // Check if post is deleted - affects both permissions
  if (post.deletedAt) {
    return {
      canEdit: { allowed: false, reason: 'Cannot edit a deleted post' },
      canDelete: { allowed: false, reason: 'Post has already been deleted' },
    }
  }

  // Team members (admin, member) can always edit and delete
  if (isTeamMember(actor.role)) {
    return {
      canEdit: { allowed: true },
      canDelete: { allowed: true },
    }
  }

  // For regular users, must be the author
  if (post.principalId !== actor.principalId) {
    return {
      canEdit: { allowed: false, reason: 'You can only edit your own posts' },
      canDelete: { allowed: false, reason: 'You can only delete your own posts' },
    }
  }

  // Get portal config once for both checks
  const config = await getPortalConfig()

  // Status is default if no statusId or the status has isDefault=true
  const isDefault = !post.statusId || post.postStatus?.isDefault === true

  // Initialize results
  let canEdit: PermissionCheckResult = { allowed: true }
  let canDelete: PermissionCheckResult = { allowed: true }

  // Status check for edit
  if (!isDefault && !config.features.allowEditAfterEngagement) {
    canEdit = { allowed: false, reason: 'Cannot edit posts that have been reviewed by the team' }
  }

  // Status check for delete
  if (!isDefault && !config.features.allowDeleteAfterEngagement) {
    canDelete = {
      allowed: false,
      reason: 'Cannot delete posts that have been reviewed by the team',
    }
  }

  // Vote check affects both only when there are votes from non-author users.
  const needsVoteCheck =
    post.voteCount > 0 &&
    ((canEdit.allowed && !config.features.allowEditAfterEngagement) ||
      (canDelete.allowed && !config.features.allowDeleteAfterEngagement))

  if (needsVoteCheck) {
    const hasOtherVotes = await hasVotesFromOthers(postId, actor.principalId)
    if (hasOtherVotes) {
      if (canEdit.allowed && !config.features.allowEditAfterEngagement) {
        canEdit = { allowed: false, reason: 'Cannot edit posts that have received votes' }
      }
      if (canDelete.allowed && !config.features.allowDeleteAfterEngagement) {
        canDelete = { allowed: false, reason: 'Cannot delete posts that have received votes' }
      }
    }
  }

  // Comment checks for edit only
  const needsEditCommentCheck = canEdit.allowed && !config.features.allowEditAfterEngagement
  if (needsEditCommentCheck) {
    const hasOtherComments = await hasCommentsFromOthers(postId, actor.principalId)

    if (hasOtherComments) {
      canEdit = {
        allowed: false,
        reason: 'Cannot edit posts that have comments from other users',
      }
    }
  }

  return { canEdit, canDelete }
}

// ============================================================================
// Helper Methods
// ============================================================================

/**
 * Check if a status is the default "open" status
 */
async function isDefaultStatus(statusId: StatusId | null): Promise<boolean> {
  if (!statusId) return true // No status = treat as default

  const { postStatuses, eq, and } = await import('@/lib/server/db')

  const status = await db.query.postStatuses.findFirst({
    where: and(eq(postStatuses.id, statusId), eq(postStatuses.isDefault, true)),
  })

  return !!status
}

/**
 * Check if a post has comments from users other than the author
 */
async function hasCommentsFromOthers(
  postId: PostId,
  authorPrincipalId: PrincipalId | null | undefined
): Promise<boolean> {
  if (!authorPrincipalId) return false // Anonymous author can't have "other" comments
  const authorPrincipalUuid = toUuid(authorPrincipalId)

  // Find any comment not from the author and not deleted (LIMIT 1 is faster than COUNT)
  const otherComment = await db.query.comments.findFirst({
    where: and(
      eq(comments.postId, postId),
      sql`${comments.principalId} != ${authorPrincipalUuid}::uuid`,
      isNull(comments.deletedAt)
    ),
  })

  return !!otherComment
}

/**
 * Check if a post has votes from users other than the author.
 */
async function hasVotesFromOthers(
  postId: PostId,
  authorPrincipalId: PrincipalId | null | undefined
): Promise<boolean> {
  if (!authorPrincipalId) return true
  const authorPrincipalUuid = toUuid(authorPrincipalId)

  const otherVote = await db.query.votes.findFirst({
    where: and(eq(votes.postId, postId), sql`${votes.principalId} != ${authorPrincipalUuid}::uuid`),
    columns: { id: true },
  })

  return !!otherVote
}

/**
 * Get portal config (single workspace mode - returns global config)
 */
async function getPortalConfig(): Promise<PortalConfig> {
  // Get the global settings config
  const org = await db.query.settings.findFirst()

  if (!org?.portalConfig) {
    return DEFAULT_PORTAL_CONFIG
  }

  // Parse the JSON string from database
  let config: Partial<PortalConfig>
  try {
    config = JSON.parse(org.portalConfig) as Partial<PortalConfig>
  } catch {
    return DEFAULT_PORTAL_CONFIG
  }

  // Merge with defaults to ensure all fields exist
  return {
    ...DEFAULT_PORTAL_CONFIG,
    ...config,
    features: {
      ...DEFAULT_PORTAL_CONFIG.features,
      ...(config?.features ?? {}),
    },
  }
}
