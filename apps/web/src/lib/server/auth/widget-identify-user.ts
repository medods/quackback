import { generateId } from '@quackback/ids'
import type { UserId } from '@quackback/ids'
import { db, user, principal, eq } from '@/lib/server/db'
import { isTeamMember } from '@/lib/shared/roles'

export interface WidgetIdentifiedUser {
  externalId: string
  email: string
  name?: string
  avatarURL?: string
}

type UserRecord = NonNullable<Awaited<ReturnType<typeof db.query.user.findFirst>>>

interface UpsertWidgetIdentifiedUserOptions {
  /**
   * Optional userId derived from an owned previous session token.
   * Used for transition from old records that don't have externalId yet.
   */
  sessionHintUserId?: UserId | null
}

export class WidgetIdentifyExternalIdConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WidgetIdentifyExternalIdConflictError'
  }
}

/**
 * Upsert widget user using externalId as the primary identity key.
 * Email remains mutable profile data and may be skipped on collision.
 */
export async function upsertWidgetIdentifiedUser(
  identified: WidgetIdentifiedUser,
  options: UpsertWidgetIdentifiedUserOptions = {}
): Promise<UserRecord> {
  const [userByExternalId, userBySessionHint, userByEmail] = await Promise.all([
    db.query.user.findFirst({ where: eq(user.externalId, identified.externalId) }),
    options.sessionHintUserId
      ? db.query.user.findFirst({ where: eq(user.id, options.sessionHintUserId) })
      : Promise.resolve(null),
    db.query.user.findFirst({ where: eq(user.email, identified.email) }),
  ])

  // Guard against taking over team/admin accounts by email when externalId
  // does not match anything yet. externalId must stay the primary identity key.
  let emailFallbackBlocked = false
  if (!userByExternalId && !userBySessionHint && userByEmail) {
    const emailOwnerPrincipal = await db.query.principal.findFirst({
      where: eq(principal.userId, userByEmail.id as UserId),
      columns: { role: true },
    })
    if (isTeamMember(emailOwnerPrincipal?.role)) {
      emailFallbackBlocked = true
    }
  }

  if (
    userBySessionHint?.externalId &&
    userBySessionHint.externalId !== identified.externalId &&
    !userByExternalId
  ) {
    throw new WidgetIdentifyExternalIdConflictError(
      `Session user ${userBySessionHint.id} is already linked to a different externalId`
    )
  }

  if (
    !userByExternalId &&
    userByEmail?.externalId &&
    userByEmail.externalId !== identified.externalId
  ) {
    throw new WidgetIdentifyExternalIdConflictError(
      `Email ${identified.email} is already bound to a different externalId`
    )
  }

  if (emailFallbackBlocked) {
    throw new WidgetIdentifyExternalIdConflictError(
      `Email ${identified.email} belongs to a team account and cannot be linked by fallback`
    )
  }

  let userRecord = userByExternalId ?? userBySessionHint ?? userByEmail

  if (!userRecord) {
    const [created] = await db
      .insert(user)
      .values({
        id: generateId('user'),
        name: identified.name || identified.email.split('@')[0],
        email: identified.email,
        externalId: identified.externalId,
        emailVerified: false,
        image: identified.avatarURL ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning()
    return created as UserRecord
  }

  const updates: {
    externalId?: string
    email?: string
    name?: string
    image?: string
  } = {}

  if (identified.externalId !== (userRecord.externalId ?? null)) {
    updates.externalId = identified.externalId
  }

  if (identified.name && identified.name !== userRecord.name) {
    updates.name = identified.name
  }

  if (identified.avatarURL && identified.avatarURL !== userRecord.image) {
    updates.image = identified.avatarURL
  }

  const emailBelongsToAnotherUser = !!userByEmail && userByEmail.id !== userRecord.id
  if (identified.email !== userRecord.email && !emailBelongsToAnotherUser) {
    updates.email = identified.email
  }

  if (emailBelongsToAnotherUser) {
    console.warn(
      `[widget-identify] Email collision for externalId=${identified.externalId}: email=${identified.email} is already used by userId=${userByEmail?.id}; keeping userId=${userRecord.id}`
    )
  }

  if (Object.keys(updates).length > 0) {
    await db.update(user).set(updates).where(eq(user.id, userRecord.id))
    userRecord = { ...userRecord, ...updates } as UserRecord
  }

  return userRecord as UserRecord
}
