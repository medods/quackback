import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowUturnLeftIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  FaceSmileIcon,
  MapPinIcon,
} from '@heroicons/react/24/solid'
import { PencilSquareIcon, TrashIcon } from '@heroicons/react/24/outline'
import { FormattedMessage, useIntl } from 'react-intl'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { TimeAgo } from '@/components/ui/time-ago'
import { REACTION_EMOJIS } from '@/lib/shared/db-types'
import { addReactionFn, removeReactionFn } from '@/lib/server/functions/comments'
import { getWidgetAuthHeaders } from '@/lib/client/widget-auth'
import { cn, getInitials } from '@/lib/shared/utils'
import type { PublicCommentView } from '@/lib/client/queries/portal-detail'
import type { CommentReactionCount } from '@/lib/shared'
import { RichTextContent, RichTextEditor } from '@/components/ui/rich-text-editor'
import type { JSONContent } from '@tiptap/react'
import {
  parseWidgetCommentMarkdown,
  serializeWidgetCommentMarkdown,
} from './widget-comment-markdown'

const MAX_WIDGET_DEPTH = 2

function getInitialCommentEditorJson(content: string): JSONContent | null {
  const parsed = parseWidgetCommentMarkdown(content)
  if (parsed) return parsed
  if (!content) return null
  return {
    type: 'doc',
    content: content.split('\n').map((line) => ({
      type: 'paragraph',
      content: line ? [{ type: 'text', text: line }] : [],
    })),
  }
}

export function canManageWidgetComment(
  commentPrincipalId: string | null | undefined,
  viewerPrincipalId: string | null | undefined
): boolean {
  return !!commentPrincipalId && !!viewerPrincipalId && commentPrincipalId === viewerPrincipalId
}

interface WidgetCommentListProps {
  comments: PublicCommentView[]
  pinnedCommentId: string | null
  viewerPrincipalId?: string | null
  canComment?: boolean
  onSubmitComment?: (content: string, parentId: string) => Promise<void>
  onEditComment?: (commentId: string, content: string) => Promise<void>
  onDeleteComment?: (commentId: string) => Promise<void>
  canUploadImages?: boolean
  onImageUpload?: (file: File) => Promise<string>
}

export function WidgetCommentList({
  comments,
  pinnedCommentId,
  viewerPrincipalId = null,
  canComment = false,
  onSubmitComment,
  onEditComment,
  onDeleteComment,
  canUploadImages = false,
  onImageUpload,
}: WidgetCommentListProps) {
  const sortedComments = [...comments].sort((a, b) => {
    if (pinnedCommentId) {
      if (a.id === pinnedCommentId) return -1
      if (b.id === pinnedCommentId) return 1
    }
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })

  if (comments.length === 0) {
    return (
      <p className="text-xs text-muted-foreground/60 text-center py-4">
        <FormattedMessage
          id="widget.commentList.empty"
          defaultMessage="No comments yet. Be the first to share your thoughts!"
        />
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {sortedComments.map((comment) => (
        <WidgetCommentItem
          key={comment.id}
          comment={comment}
          pinnedCommentId={pinnedCommentId}
          viewerPrincipalId={viewerPrincipalId}
          depth={0}
          canComment={canComment}
          onSubmitComment={onSubmitComment}
          onEditComment={onEditComment}
          onDeleteComment={onDeleteComment}
          canUploadImages={canUploadImages}
          onImageUpload={onImageUpload}
        />
      ))}
    </div>
  )
}

interface WidgetCommentItemProps {
  comment: PublicCommentView
  pinnedCommentId: string | null
  viewerPrincipalId: string | null
  depth: number
  canComment: boolean
  onSubmitComment?: (content: string, parentId: string) => Promise<void>
  onEditComment?: (commentId: string, content: string) => Promise<void>
  onDeleteComment?: (commentId: string) => Promise<void>
  canUploadImages: boolean
  onImageUpload?: (file: File) => Promise<string>
}

function WidgetCommentItem({
  comment,
  pinnedCommentId,
  viewerPrincipalId,
  depth,
  canComment,
  onSubmitComment,
  onEditComment,
  onDeleteComment,
  canUploadImages,
  onImageUpload,
}: WidgetCommentItemProps) {
  const intl = useIntl()
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [showReplyForm, setShowReplyForm] = useState(false)
  const [showEditForm, setShowEditForm] = useState(false)
  const [replyJson, setReplyJson] = useState<JSONContent | null>(null)
  const [replyText, setReplyText] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [editJson, setEditJson] = useState<JSONContent | null>(null)
  const [editText, setEditText] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [reactions, setReactions] = useState<CommentReactionCount[]>(comment.reactions)
  const [reactionPending, setReactionPending] = useState(false)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)

  useEffect(() => {
    setReactions(comment.reactions)
  }, [comment.reactions])

  const handleReplyEditorChange = useCallback((json: JSONContent) => {
    setReplyJson(json)
    setReplyText(serializeWidgetCommentMarkdown(json))
  }, [])

  const handleEditEditorChange = useCallback((json: JSONContent) => {
    setEditJson(json)
    setEditText(serializeWidgetCommentMarkdown(json))
  }, [])

  const isDeleted = !!comment.deletedAt
  const isPinned = pinnedCommentId === comment.id
  const hasReplies = comment.replies.length > 0
  const canShowReplies = depth < MAX_WIDGET_DEPTH
  const canManageComment =
    !isDeleted &&
    canManageWidgetComment(comment.principalId, viewerPrincipalId) &&
    (!!onEditComment || !!onDeleteComment)

  async function handleReaction(emoji: string) {
    setShowEmojiPicker(false)
    setReactionPending(true)
    try {
      const hasReacted = reactions.some((r) => r.emoji === emoji && r.hasReacted)
      const fn = hasReacted ? removeReactionFn : addReactionFn
      const result = await fn({
        data: { commentId: comment.id, emoji },
        headers: getWidgetAuthHeaders(),
      })
      setReactions(result.reactions)
    } catch (error) {
      console.error('Failed to update reaction:', error)
    } finally {
      setReactionPending(false)
    }
  }

  async function handleSubmitReply() {
    const content = replyText.trim()
    if (!content || isSubmitting || !onSubmitComment) return
    setIsSubmitting(true)
    try {
      await onSubmitComment(content, comment.id)
      setReplyJson(null)
      setReplyText('')
      setShowReplyForm(false)
    } catch {
      // Error handled by parent
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleSubmitEdit() {
    const content = editText.trim()
    if (!content || isEditing || !onEditComment) return

    setIsEditing(true)
    setActionError(null)
    try {
      await onEditComment(comment.id, content)
      setShowEditForm(false)
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : intl.formatMessage({
              id: 'widget.commentList.errorAction',
              defaultMessage: 'Could not update comment. Please try again.',
            })
      )
    } finally {
      setIsEditing(false)
    }
  }

  async function handleDelete() {
    if (!onDeleteComment || isDeleting) return

    setIsDeleting(true)
    setActionError(null)
    try {
      await onDeleteComment(comment.id)
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : intl.formatMessage({
              id: 'widget.commentList.errorAction',
              defaultMessage: 'Could not update comment. Please try again.',
            })
      )
    } finally {
      setIsDeleting(false)
      setShowDeleteConfirm(false)
    }
  }

  const authorName =
    comment.authorName ||
    intl.formatMessage({ id: 'widget.commentList.authorFallback', defaultMessage: 'Anonymous' })
  const renderedContent = useMemo(() => {
    return parseWidgetCommentMarkdown(comment.content)
  }, [comment.content])

  if (isDeleted) {
    return (
      <div
        className={cn(
          'relative',
          depth > 0 &&
            'ms-4 ps-3 before:absolute before:start-0 before:top-0 before:bottom-0 before:w-px before:bg-border/40'
        )}
      >
        <div className="py-1.5">
          <div className="flex items-center gap-1.5">
            <Avatar className="h-5 w-5 shrink-0 opacity-40">
              <AvatarFallback className="text-[9px]">?</AvatarFallback>
            </Avatar>
            <span className="text-xs text-muted-foreground/60 italic">
              {comment.isRemovedByTeam ? (
                <FormattedMessage id="widget.commentList.removed" defaultMessage="[removed]" />
              ) : (
                <FormattedMessage id="widget.commentList.deleted" defaultMessage="[deleted]" />
              )}
            </span>
            <span className="text-muted-foreground/50 text-[10px]">&middot;</span>
            <TimeAgo date={comment.createdAt} className="text-[10px] text-muted-foreground/60" />
          </div>
          {hasReplies && (
            <div className="flex items-center gap-1 mt-1.5 ms-7">
              <button
                type="button"
                onClick={() => setIsCollapsed(!isCollapsed)}
                className="h-5 w-5 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
              >
                {isCollapsed ? (
                  <ChevronRightIcon className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDownIcon className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          )}
        </div>
        {/* Animated nested replies */}
        <div
          className="grid transition-all duration-200 ease-out"
          style={{
            gridTemplateRows: !isCollapsed && hasReplies && canShowReplies ? '1fr' : '0fr',
            opacity: !isCollapsed && hasReplies && canShowReplies ? 1 : 0,
          }}
        >
          <div className="overflow-hidden">
            <div className="space-y-2">
              {comment.replies.map((reply) => (
                <WidgetCommentItem
                  key={reply.id}
                  comment={reply}
                  pinnedCommentId={pinnedCommentId}
                  viewerPrincipalId={viewerPrincipalId}
                  depth={depth + 1}
                  canComment={canComment}
                  onSubmitComment={onSubmitComment}
                  onEditComment={onEditComment}
                  onDeleteComment={onDeleteComment}
                  canUploadImages={canUploadImages}
                  onImageUpload={onImageUpload}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'relative',
        depth > 0 &&
          'ms-4 ps-3 before:absolute before:start-0 before:top-0 before:bottom-0 before:w-px before:bg-border/40'
      )}
    >
      <div
        className={cn(
          'py-1.5',
          isPinned && 'bg-primary/[0.04] border border-primary/15 rounded-md px-2 -mx-2'
        )}
      >
        {/* Header */}
        <div className="flex items-center gap-1.5">
          <Avatar className="h-5 w-5 shrink-0">
            {comment.avatarUrl && (
              <AvatarImage src={comment.avatarUrl} alt={comment.authorName || ''} />
            )}
            <AvatarFallback className="text-[9px]">
              {getInitials(comment.authorName)}
            </AvatarFallback>
          </Avatar>
          <span className="text-xs font-medium text-foreground truncate">{authorName}</span>
          {comment.isTeamMember && (
            <span className="text-[9px] px-1 py-px rounded bg-primary/15 text-primary font-medium shrink-0">
              <FormattedMessage id="widget.commentList.teamBadge" defaultMessage="Team" />
            </span>
          )}
          {isPinned && (
            <span className="text-[9px] px-1 py-px rounded bg-primary/15 text-primary font-medium shrink-0 inline-flex items-center gap-0.5">
              <MapPinIcon className="h-2.5 w-2.5" />
              <FormattedMessage id="widget.commentList.pinnedBadge" defaultMessage="Pinned" />
            </span>
          )}
          <span className="text-muted-foreground/50 text-[10px]">&middot;</span>
          <TimeAgo
            date={comment.createdAt}
            className="text-[10px] text-muted-foreground/60 shrink-0"
          />
        </div>

        {/* Content */}
        {showEditForm ? (
          <div className="mt-2 ms-7 p-2 bg-muted/30 rounded-md border border-border/30">
            <div className="flex gap-2">
              <RichTextEditor
                value={editJson || ''}
                onChange={handleEditEditorChange}
                placeholder={intl.formatMessage({
                  id: 'widget.commentList.editPlaceholder',
                  defaultMessage: 'Edit your comment...',
                })}
                minHeight="64px"
                disabled={isEditing || isDeleting}
                className="flex-1 text-xs"
                toolbarVariant="media-history"
                defaultImageWidth={220}
                features={{
                  images: canUploadImages,
                  bubbleMenu: false,
                  slashMenu: false,
                }}
                onImageUpload={canUploadImages ? onImageUpload : undefined}
              />
              <button
                type="button"
                onClick={handleSubmitEdit}
                disabled={isEditing || isDeleting || !editText.trim()}
                className="self-end px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
              >
                {isEditing ? (
                  <FormattedMessage id="widget.commentList.saving" defaultMessage="Saving..." />
                ) : (
                  <FormattedMessage id="widget.commentList.save" defaultMessage="Save" />
                )}
              </button>
            </div>
          </div>
        ) : renderedContent ? (
          <RichTextContent
            content={renderedContent}
            className="mt-1 ms-7 text-xs leading-relaxed text-foreground/90 [&_p]:my-0 [&_ul]:my-1 [&_ol]:my-1 [&_pre]:my-1 [&_blockquote]:my-1 [&_img]:my-1 [&_img]:max-w-[220px] [&_img]:h-auto"
          />
        ) : (
          <p className="text-xs text-foreground/90 whitespace-pre-wrap mt-1 ms-7 leading-relaxed">
            {comment.content}
          </p>
        )}

        {/* Actions row: collapse, reactions, emoji picker, reply */}
        <div className="flex items-center gap-1 mt-1.5 ms-7">
          {/* Collapse toggle */}
          {hasReplies && canShowReplies && (
            <button
              type="button"
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="h-5 w-5 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            >
              {isCollapsed ? (
                <ChevronRightIcon className="h-3.5 w-3.5" />
              ) : (
                <ChevronDownIcon className="h-3.5 w-3.5" />
              )}
            </button>
          )}

          {/* Existing reactions */}
          {!showEditForm &&
            reactions.map((reaction) => (
              <button
                key={reaction.emoji}
                onClick={() => handleReaction(reaction.emoji)}
                disabled={reactionPending}
                className={cn(
                  'inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] transition-all duration-150',
                  'border hover:bg-muted bg-muted/50',
                  reaction.hasReacted
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground'
                )}
              >
                <span>{reaction.emoji}</span>
                <span>{reaction.count}</span>
              </button>
            ))}

          {/* Add reaction button */}
          {!showEditForm && (
            <Popover open={showEmojiPicker} onOpenChange={setShowEmojiPicker}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  disabled={reactionPending}
                  className="h-5 w-5 flex items-center justify-center text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                >
                  <FaceSmileIcon className="h-3.5 w-3.5" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-1.5" align="start">
                <div className="flex gap-0.5">
                  {REACTION_EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      onClick={() => handleReaction(emoji)}
                      className="h-7 w-7 flex items-center justify-center rounded hover:bg-muted text-sm transition-colors"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          )}

          {/* Reply button */}
          {canComment && canShowReplies && !showEditForm && (
            <button
              type="button"
              onClick={() => {
                setActionError(null)
                setShowEditForm(false)
                setShowDeleteConfirm(false)
                setShowReplyForm(!showReplyForm)
              }}
              className="inline-flex items-center gap-0.5 h-5 px-1 text-[10px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
            >
              <ArrowUturnLeftIcon className="h-2.5 w-2.5" />
              <FormattedMessage id="widget.commentList.reply" defaultMessage="Reply" />
            </button>
          )}

          {canManageComment && !!onEditComment && (
            <button
              type="button"
              onClick={() => {
                setActionError(null)
                if (showEditForm) {
                  setShowEditForm(false)
                  return
                }
                const initialJson = getInitialCommentEditorJson(comment.content)
                setEditJson(initialJson)
                setEditText(comment.content)
                setShowReplyForm(false)
                setShowDeleteConfirm(false)
                setShowEditForm(true)
              }}
              disabled={isEditing || isDeleting}
              className="inline-flex items-center gap-0.5 h-5 px-1 text-[10px] text-muted-foreground/60 hover:text-muted-foreground transition-colors disabled:opacity-50"
            >
              <PencilSquareIcon className="h-2.5 w-2.5" />
              {showEditForm ? (
                <FormattedMessage id="widget.commentList.cancel" defaultMessage="Cancel" />
              ) : (
                <FormattedMessage id="widget.commentList.edit" defaultMessage="Edit" />
              )}
            </button>
          )}

          {canManageComment && !!onDeleteComment && (
            <Popover
              open={showDeleteConfirm}
              onOpenChange={(open) => {
                if (isDeleting) return
                if (open) {
                  setActionError(null)
                  setShowEditForm(false)
                  setShowReplyForm(false)
                }
                setShowDeleteConfirm(open)
              }}
            >
              <PopoverTrigger asChild>
                <button
                  type="button"
                  disabled={isDeleting || isEditing}
                  className="inline-flex items-center gap-0.5 h-5 px-1 text-[10px] text-muted-foreground/60 hover:text-destructive transition-colors disabled:opacity-50"
                >
                  <TrashIcon className="h-2.5 w-2.5" />
                  {isDeleting ? (
                    <FormattedMessage
                      id="widget.commentList.deleting"
                      defaultMessage="Deleting..."
                    />
                  ) : (
                    <FormattedMessage id="widget.commentList.delete" defaultMessage="Delete" />
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-52 p-2">
                <p className="text-[10px] text-destructive">
                  <FormattedMessage
                    id="widget.commentList.deleteConfirm"
                    defaultMessage="Delete this comment?"
                  />
                </p>
                <div className="mt-1.5 flex items-center justify-end gap-1.5">
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(false)}
                    disabled={isDeleting}
                    className="rounded px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted/40 disabled:opacity-50"
                  >
                    <FormattedMessage id="widget.commentList.cancel" defaultMessage="Cancel" />
                  </button>
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={isDeleting || isEditing}
                    className="rounded px-2 py-1 text-[10px] bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
                  >
                    {isDeleting ? (
                      <FormattedMessage
                        id="widget.commentList.deleting"
                        defaultMessage="Deleting..."
                      />
                    ) : (
                      <FormattedMessage id="widget.commentList.delete" defaultMessage="Delete" />
                    )}
                  </button>
                </div>
              </PopoverContent>
            </Popover>
          )}
        </div>

        {actionError && <p className="ms-7 mt-1 text-[10px] text-destructive">{actionError}</p>}

        {/* Inline reply form — animated expand */}
        <div
          className="grid transition-all duration-200 ease-out"
          style={{
            gridTemplateRows: showReplyForm ? '1fr' : '0fr',
            opacity: showReplyForm ? 1 : 0,
          }}
        >
          <div className="overflow-hidden">
            <div className="mt-2 ms-7 p-2 bg-muted/30 rounded-md border border-border/30">
              <div className="flex gap-2">
                <RichTextEditor
                  value={replyJson || ''}
                  onChange={handleReplyEditorChange}
                  placeholder={intl.formatMessage(
                    {
                      id: 'widget.commentList.replyPlaceholder',
                      defaultMessage: 'Reply to {name}...',
                    },
                    { name: authorName }
                  )}
                  minHeight="64px"
                  disabled={isSubmitting}
                  className="flex-1 text-xs"
                  toolbarVariant="media-history"
                  defaultImageWidth={220}
                  features={{
                    images: canUploadImages,
                    bubbleMenu: false,
                    slashMenu: false,
                  }}
                  onImageUpload={canUploadImages ? onImageUpload : undefined}
                />
                <button
                  type="button"
                  onClick={handleSubmitReply}
                  disabled={isSubmitting || !replyText.trim()}
                  className="self-end px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
                >
                  {isSubmitting ? (
                    '...'
                  ) : (
                    <FormattedMessage id="widget.commentList.post" defaultMessage="Post" />
                  )}
                </button>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowReplyForm(false)
                  setReplyJson(null)
                  setReplyText('')
                }}
                className="mt-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              >
                <FormattedMessage id="widget.commentList.cancel" defaultMessage="Cancel" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Animated nested replies */}
      <div
        className="grid transition-all duration-200 ease-out"
        style={{
          gridTemplateRows: !isCollapsed && hasReplies && canShowReplies ? '1fr' : '0fr',
          opacity: !isCollapsed && hasReplies && canShowReplies ? 1 : 0,
        }}
      >
        <div className="overflow-hidden">
          <div className="space-y-2 mt-1">
            {comment.replies.map((reply) => (
              <WidgetCommentItem
                key={reply.id}
                comment={reply}
                pinnedCommentId={pinnedCommentId}
                viewerPrincipalId={viewerPrincipalId}
                depth={depth + 1}
                canComment={canComment}
                onSubmitComment={onSubmitComment}
                onEditComment={onEditComment}
                onDeleteComment={onDeleteComment}
                canUploadImages={canUploadImages}
                onImageUpload={onImageUpload}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
