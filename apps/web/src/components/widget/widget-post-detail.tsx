import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChatBubbleLeftIcon, Squares2X2Icon } from '@heroicons/react/24/solid'
import { PencilSquareIcon, TrashIcon } from '@heroicons/react/24/outline'
import { FormattedMessage, useIntl } from 'react-intl'
import { TimeAgo } from '@/components/ui/time-ago'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { RichTextEditor } from '@/components/ui/rich-text-editor'
import { PostContent } from '@/components/public/post-content'
import { fetchPublicPostDetail } from '@/lib/server/functions/portal'
import {
  createCommentFn,
  userDeleteCommentFn,
  userEditCommentFn,
} from '@/lib/server/functions/comments'
import { userDeletePostFn, userEditPostFn } from '@/lib/server/functions/public-posts'
import { generateOneTimeToken, getWidgetAuthHeaders } from '@/lib/client/widget-auth'
import { buildPortalUrl } from './build-portal-url'
import { widgetQueryKeys } from '@/lib/client/hooks/use-widget-vote'
import type { PublicPostDetailView } from '@/lib/client/queries/portal-detail'
import { WidgetVoteButton } from './widget-vote-button'
import { WidgetCommentList } from './widget-comment-list'
import { useWidgetAuth } from './widget-auth-provider'
import { sendToHost } from '@/lib/client/widget-bridge'
import { WidgetCommentForm } from './widget-comment-form'
import { WidgetPortalTitle } from './widget-portal-title'
import type { CommentId, PostId } from '@quackback/ids'
import { useWidgetImageUpload } from '@/lib/client/hooks/use-image-upload'
import type { JSONContent } from '@tiptap/react'

interface StatusInfo {
  id: string
  name: string
  color: string
}

interface WidgetPostDetailProps {
  postId: string
  statuses: StatusInfo[]
  anonymousVotingEnabled?: boolean
  anonymousCommentingEnabled?: boolean
  imageUploadsInWidget?: boolean
  onBackToList?: () => void
}

function getInitialPostContentJson(post: {
  contentJson: unknown
  content: string
}): JSONContent | null {
  if (post.contentJson && typeof post.contentJson === 'object') {
    return post.contentJson as JSONContent
  }
  if (!post.content) {
    return null
  }
  return {
    type: 'doc',
    content: post.content.split('\n').map((line) => ({
      type: 'paragraph',
      content: line ? [{ type: 'text', text: line }] : [],
    })),
  }
}

export function canManageWidgetPost(
  postPrincipalId: string | null | undefined,
  viewerPrincipalId: string | null | undefined
): boolean {
  return !!postPrincipalId && !!viewerPrincipalId && postPrincipalId === viewerPrincipalId
}

export function WidgetPostDetail({
  postId,
  statuses,
  anonymousVotingEnabled = true,
  anonymousCommentingEnabled = false,
  imageUploadsInWidget = true,
  onBackToList,
}: WidgetPostDetailProps) {
  const intl = useIntl()
  const {
    isIdentified,
    hmacRequired,
    user,
    ensureSessionThen,
    identifyWithEmail,
    emitEvent,
    sessionVersion,
  } = useWidgetAuth()
  const { upload: uploadImage } = useWidgetImageUpload()
  const queryClient = useQueryClient()

  // Widget-specific post detail query that injects Bearer headers so the server
  // can resolve principalId for reaction hasReacted highlights.
  // Re-keyed on sessionVersion so it refetches after identify.
  const {
    data: post,
    isLoading,
    error,
  } = useQuery({
    queryKey: widgetQueryKeys.postDetail.byId(postId, sessionVersion),
    queryFn: async (): Promise<PublicPostDetailView> => {
      const result = await fetchPublicPostDetail({
        data: { postId },
        headers: getWidgetAuthHeaders(),
      })
      if (!result) throw new Error('Post not found')
      return result as PublicPostDetailView
    },
    staleTime: 30 * 1000,
  })

  const [isEditingPost, setIsEditingPost] = useState(false)
  const [postEditTitle, setPostEditTitle] = useState('')
  const [postEditContentJson, setPostEditContentJson] = useState<JSONContent | null>(null)
  const [postEditMarkdown, setPostEditMarkdown] = useState('')
  const [postActionError, setPostActionError] = useState<string | null>(null)
  const [isSavingPost, setIsSavingPost] = useState(false)
  const [isDeletingPost, setIsDeletingPost] = useState(false)
  const [showDeletePostConfirm, setShowDeletePostConfirm] = useState(false)
  const [isPostDeleted, setIsPostDeleted] = useState(false)

  useEffect(() => {
    setIsEditingPost(false)
    setPostActionError(null)
    setShowDeletePostConfirm(false)
    setIsPostDeleted(false)
  }, [postId])

  const status = post?.statusId ? (statuses.find((s) => s.id === post.statusId) ?? null) : null
  const viewerPrincipalId = post?.viewerPrincipalId ?? null
  const canManagePost = canManageWidgetPost(post?.principalId, viewerPrincipalId)

  const handleViewOnPortal = useCallback(async () => {
    if (!post) return
    const ott = isIdentified ? await generateOneTimeToken() : null
    const url = buildPortalUrl({
      origin: window.location.origin,
      boardSlug: post.board.slug,
      postId: post.id,
      isIdentified,
      ott,
    })
    sendToHost({ type: 'quackback:navigate', url })
  }, [post, isIdentified])

  /** Submit a comment (root or reply). */
  const submitComment = useCallback(
    async (content: string, parentId?: string) => {
      await ensureSessionThen(async () => {
        const result = await createCommentFn({
          data: { postId, content, parentId },
          headers: getWidgetAuthHeaders(),
        })
        emitEvent('comment:created', {
          postId,
          commentId: result.comment.id,
          parentId: parentId ?? null,
        })
        queryClient.invalidateQueries({ queryKey: widgetQueryKeys.postDetail.all })
      })
    },
    [ensureSessionThen, emitEvent, postId, queryClient]
  )

  const handleSubmitReply = useCallback(
    async (content: string, parentId: string) => {
      await submitComment(content, parentId)
    },
    [submitComment]
  )

  const handleEditComment = useCallback(
    async (commentId: string, content: string) => {
      await ensureSessionThen(async () => {
        await userEditCommentFn({
          data: { commentId, content },
          headers: getWidgetAuthHeaders(),
        })
        queryClient.invalidateQueries({ queryKey: widgetQueryKeys.postDetail.all })
      })
    },
    [ensureSessionThen, queryClient]
  )

  const handleDeleteComment = useCallback(
    async (commentId: string) => {
      await ensureSessionThen(async () => {
        await userDeleteCommentFn({
          data: { commentId: commentId as CommentId },
          headers: getWidgetAuthHeaders(),
        })
        queryClient.invalidateQueries({ queryKey: widgetQueryKeys.postDetail.all })
      })
    },
    [ensureSessionThen, queryClient]
  )

  const startPostEdit = useCallback(() => {
    if (!post) return
    setPostEditTitle(post.title)
    setPostEditContentJson(
      getInitialPostContentJson({ contentJson: post.contentJson, content: post.content })
    )
    setPostEditMarkdown(post.content ?? '')
    setShowDeletePostConfirm(false)
    setPostActionError(null)
    setIsEditingPost(true)
  }, [post])

  const cancelPostEdit = useCallback(() => {
    setIsEditingPost(false)
    setPostActionError(null)
  }, [])

  const handlePostEditorChange = useCallback(
    (_json: JSONContent, _html: string, markdown: string) => {
      setPostEditContentJson(_json)
      setPostEditMarkdown(markdown)
    },
    []
  )

  const savePost = useCallback(async () => {
    if (!post || !postEditTitle.trim() || isSavingPost || isDeletingPost) {
      return
    }

    setIsSavingPost(true)
    setPostActionError(null)

    try {
      await ensureSessionThen(async () => {
        await userEditPostFn({
          data: {
            postId,
            title: postEditTitle.trim(),
            content: postEditMarkdown,
            contentJson: postEditContentJson ?? undefined,
          },
          headers: getWidgetAuthHeaders(),
        })
        setIsEditingPost(false)
        queryClient.invalidateQueries({ queryKey: widgetQueryKeys.postDetail.all })
      })
    } catch (err) {
      setPostActionError(
        err instanceof Error
          ? err.message
          : intl.formatMessage({
              id: 'widget.postDetail.error.somethingWrong',
              defaultMessage: 'Something went wrong',
            })
      )
    } finally {
      setIsSavingPost(false)
    }
  }, [
    ensureSessionThen,
    intl,
    isDeletingPost,
    isSavingPost,
    post,
    postEditContentJson,
    postEditMarkdown,
    postEditTitle,
    postId,
    queryClient,
  ])

  const deletePost = useCallback(async () => {
    if (isSavingPost || isDeletingPost) return

    setIsDeletingPost(true)
    setPostActionError(null)

    try {
      await ensureSessionThen(async () => {
        await userDeletePostFn({
          data: { postId },
          headers: getWidgetAuthHeaders(),
        })
        setShowDeletePostConfirm(false)
        setIsEditingPost(false)
        setIsPostDeleted(true)
        queryClient.invalidateQueries({ queryKey: widgetQueryKeys.postDetail.all })
      })
    } catch (err) {
      setPostActionError(
        err instanceof Error
          ? err.message
          : intl.formatMessage({
              id: 'widget.postDetail.error.somethingWrong',
              defaultMessage: 'Something went wrong',
            })
      )
    } finally {
      setIsDeletingPost(false)
    }
  }, [ensureSessionThen, intl, isDeletingPost, isSavingPost, postId, queryClient])

  // Identified users can always vote/comment; anonymous users only if the setting is enabled
  const canVote = isIdentified || anonymousVotingEnabled
  const canComment = isIdentified || anonymousCommentingEnabled
  const canUploadImages = isIdentified && imageUploadsInWidget

  const scrollAreaRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const viewport = scrollAreaRef.current?.querySelector('[data-slot="scroll-area-viewport"]')
    if (viewport) viewport.scrollTop = 0
  }, [postId])

  const liveCommentCount = post?.comments ? countLiveComments(post.comments) : 0

  if (isLoading) {
    return (
      <div className="flex flex-col h-full px-3 pt-3">
        <div className="space-y-3 animate-pulse">
          <div className="h-5 bg-muted/50 rounded w-3/4" />
          <div className="h-3 bg-muted/30 rounded w-1/3" />
          <div className="h-20 bg-muted/30 rounded mt-2" />
          <div className="h-3 bg-muted/30 rounded w-1/2 mt-4" />
          <div className="space-y-2 mt-2">
            <div className="h-12 bg-muted/20 rounded" />
            <div className="h-12 bg-muted/20 rounded" />
          </div>
        </div>
      </div>
    )
  }

  if (isPostDeleted) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-4 text-center">
        <p className="text-sm text-muted-foreground">
          <FormattedMessage id="widget.postDetail.deleted" defaultMessage="Post deleted" />
        </p>
        {onBackToList && (
          <button
            type="button"
            onClick={onBackToList}
            className="mt-3 inline-flex items-center justify-center rounded-md border border-border/60 bg-muted/30 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/50 transition-colors"
          >
            <FormattedMessage
              id="widget.postDetail.backToList"
              defaultMessage="Back to posts list"
            />
          </button>
        )}
      </div>
    )
  }

  if (error || !post) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-4 text-center">
        <p className="text-sm text-muted-foreground">
          <FormattedMessage
            id="widget.postDetail.notFoundOrDeleted"
            defaultMessage="This post does not exist or has been deleted"
          />
        </p>
        {onBackToList && (
          <button
            type="button"
            onClick={onBackToList}
            className="mt-3 inline-flex items-center justify-center rounded-md border border-border/60 bg-muted/30 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/50 transition-colors"
          >
            <FormattedMessage
              id="widget.postDetail.backToList"
              defaultMessage="Back to posts list"
            />
          </button>
        )}
      </div>
    )
  }

  return (
    <ScrollArea ref={scrollAreaRef} scrollBarClassName="w-1.5" className="flex-1 h-full">
      <div className="px-3 pt-3 pb-4 space-y-3">
        {/* Header: mirrors widget listing layout (vote left, status/title right) */}
        <div className="flex items-start gap-3">
          <div className="shrink-0 mt-0.5">
            <WidgetVoteButton
              postId={postId as PostId}
              voteCount={post.voteCount}
              onBeforeVote={
                canVote
                  ? async () => {
                      let success = false
                      await ensureSessionThen(() => {
                        success = true
                      })
                      return success
                    }
                  : undefined
              }
              onAuthRequired={!canVote ? handleViewOnPortal : undefined}
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-1.5">
                {status && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                    <span
                      className="size-2 rounded-full shrink-0"
                      style={{ backgroundColor: status.color }}
                    />
                    {status.name}
                  </span>
                )}
              </div>
              {canManagePost && !isEditingPost && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={startPostEdit}
                    disabled={isDeletingPost || isSavingPost}
                    className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted/40 disabled:opacity-50"
                  >
                    <PencilSquareIcon className="h-3 w-3" />
                    <FormattedMessage id="widget.postDetail.edit" defaultMessage="Edit" />
                  </button>
                  <Popover
                    open={showDeletePostConfirm}
                    onOpenChange={(open) => {
                      if (isDeletingPost) return
                      if (open) {
                        setPostActionError(null)
                      }
                      setShowDeletePostConfirm(open)
                    }}
                  >
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        disabled={isDeletingPost || isSavingPost}
                        className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[10px] text-muted-foreground hover:text-destructive hover:bg-muted/40 disabled:opacity-50"
                      >
                        <TrashIcon className="h-3 w-3" />
                        {isDeletingPost ? (
                          <FormattedMessage
                            id="widget.postDetail.deleting"
                            defaultMessage="Deleting..."
                          />
                        ) : (
                          <FormattedMessage id="widget.postDetail.delete" defaultMessage="Delete" />
                        )}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-60 p-2">
                      <p className="text-[10px] text-destructive">
                        <FormattedMessage
                          id="widget.postDetail.deleteConfirm"
                          defaultMessage="Delete this post? This action cannot be undone."
                        />
                      </p>
                      <div className="mt-1.5 flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => setShowDeletePostConfirm(false)}
                          disabled={isDeletingPost || isSavingPost}
                          className="rounded px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted/40 disabled:opacity-50"
                        >
                          <FormattedMessage id="widget.postDetail.cancel" defaultMessage="Cancel" />
                        </button>
                        <button
                          type="button"
                          onClick={deletePost}
                          disabled={isDeletingPost || isSavingPost}
                          className="rounded px-2 py-1 text-[10px] bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
                        >
                          {isDeletingPost ? (
                            <FormattedMessage
                              id="widget.postDetail.deleting"
                              defaultMessage="Deleting..."
                            />
                          ) : (
                            <FormattedMessage
                              id="widget.postDetail.delete"
                              defaultMessage="Delete"
                            />
                          )}
                        </button>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              )}
            </div>
            {isEditingPost ? (
              <input
                type="text"
                value={postEditTitle}
                onChange={(e) => setPostEditTitle(e.target.value)}
                maxLength={200}
                autoFocus
                disabled={isSavingPost || isDeletingPost}
                placeholder={intl.formatMessage({
                  id: 'widget.postDetail.editTitlePlaceholder',
                  defaultMessage: "What's your idea?",
                })}
                className="w-full mt-1 bg-transparent border-0 outline-none text-base font-semibold text-foreground placeholder:text-muted-foreground/60"
              />
            ) : (
              <WidgetPortalTitle title={post.title} onClick={handleViewOnPortal} hideLink={true} />
            )}
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60 mt-1">
              <span>
                {post.authorName ||
                  intl.formatMessage({
                    id: 'widget.postDetail.authorFallback',
                    defaultMessage: 'Anonymous',
                  })}
              </span>
              <span className="text-muted-foreground/30">&middot;</span>
              <TimeAgo date={post.createdAt} />
              <span className="text-muted-foreground/30">&middot;</span>
              <span className="inline-flex items-center gap-0.5">
                <Squares2X2Icon className="h-3 w-3 text-muted-foreground/40" />
                {post.board.name}
              </span>
            </div>
            {canManagePost && isEditingPost && (
              <div className="flex items-center justify-end gap-1.5 mt-2">
                <button
                  type="button"
                  onClick={cancelPostEdit}
                  disabled={isSavingPost || isDeletingPost}
                  className="rounded px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted/40 disabled:opacity-50"
                >
                  <FormattedMessage id="widget.postDetail.cancel" defaultMessage="Cancel" />
                </button>
                <button
                  type="button"
                  onClick={savePost}
                  disabled={!postEditTitle.trim() || isSavingPost || isDeletingPost}
                  className="rounded px-2 py-1 text-[10px] bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {isSavingPost ? (
                    <FormattedMessage id="widget.postDetail.saving" defaultMessage="Saving..." />
                  ) : (
                    <FormattedMessage id="widget.postDetail.save" defaultMessage="Save" />
                  )}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Post body */}
        {isEditingPost ? (
          <RichTextEditor
            value={postEditContentJson || ''}
            onChange={handlePostEditorChange}
            placeholder={intl.formatMessage({
              id: 'widget.postDetail.editContentPlaceholder',
              defaultMessage: 'Add more details...',
            })}
            minHeight="120px"
            disabled={isSavingPost || isDeletingPost}
            className="text-[13px]"
            toolbarVariant="media-history"
            defaultImageWidth={320}
            features={{
              images: canUploadImages,
              bubbleMenu: false,
              slashMenu: false,
            }}
            onImageUpload={canUploadImages ? uploadImage : undefined}
          />
        ) : (
          post.content && (
            <PostContent
              content={post.content}
              contentJson={post.contentJson}
              className="text-[13px] text-foreground/80 leading-relaxed [&_img]:max-w-[320px] [&_img]:h-auto"
            />
          )
        )}

        {postActionError && <p className="text-[11px] text-destructive">{postActionError}</p>}

        {/* Pinned comment / official response */}
        {!isEditingPost && post.pinnedComment && (
          <div className="rounded-md border border-primary/20 bg-primary/[0.03] p-2.5">
            <p className="text-[10px] font-medium text-primary mb-1">
              <FormattedMessage
                id="widget.postDetail.officialResponse"
                defaultMessage="Official response"
              />
            </p>
            <p className="text-xs text-foreground/80 whitespace-pre-wrap leading-relaxed">
              {post.pinnedComment.content}
            </p>
            <p className="text-[10px] text-muted-foreground/60 mt-1">
              &mdash;{' '}
              {post.pinnedComment.authorName ||
                intl.formatMessage({
                  id: 'widget.postDetail.teamAuthorFallback',
                  defaultMessage: 'Team',
                })}
            </p>
          </div>
        )}

        {/* Comments section */}
        {!isEditingPost && (
          <div className="border-t border-border/50 pt-3">
            <div className="flex items-center gap-1.5 mb-3">
              <ChatBubbleLeftIcon className="h-3.5 w-3.5 text-muted-foreground/50" />
              <span className="text-xs font-medium text-muted-foreground">
                <FormattedMessage
                  id="widget.postDetail.comments"
                  defaultMessage="{count, plural, one {# comment} other {# comments}}"
                  values={{ count: liveCommentCount }}
                />
              </span>
            </div>

            {/* Root comment form — unified: textarea + email (when anonymous) + single Post */}
            {!post.isCommentsLocked && (!hmacRequired || canComment) && (
              <WidgetCommentForm
                isIdentified={isIdentified}
                user={user}
                onSubmit={submitComment}
                identifyWithEmail={identifyWithEmail}
                canUploadImages={canUploadImages}
                onImageUpload={canUploadImages ? uploadImage : undefined}
              />
            )}

            {!post.isCommentsLocked && hmacRequired && !canComment && (
              <button
                type="button"
                onClick={handleViewOnPortal}
                className="text-[10px] text-primary hover:text-primary/80 transition-colors mb-3"
              >
                <FormattedMessage
                  id="widget.postDetail.loginToComment"
                  defaultMessage="Log in to join the conversation"
                />
              </button>
            )}

            {post.isCommentsLocked && (
              <p className="text-[10px] text-muted-foreground/50 mb-3">
                <FormattedMessage
                  id="widget.postDetail.commentsLocked"
                  defaultMessage="Comments are locked on this post"
                />
              </p>
            )}

            <WidgetCommentList
              comments={post.comments}
              pinnedCommentId={post.pinnedCommentId}
              viewerPrincipalId={viewerPrincipalId}
              canComment={canComment && !post.isCommentsLocked}
              onSubmitComment={handleSubmitReply}
              onEditComment={handleEditComment}
              onDeleteComment={handleDeleteComment}
              canUploadImages={canUploadImages}
              onImageUpload={canUploadImages ? uploadImage : undefined}
            />
          </div>
        )}
      </div>
    </ScrollArea>
  )
}

/** Count non-deleted comments recursively */
export function countLiveComments(
  comments: { deletedAt?: Date | string | null; replies: typeof comments }[]
): number {
  let count = 0
  for (const c of comments) {
    if (!c.deletedAt) count++
    count += countLiveComments(c.replies)
  }
  return count
}
