/**
 * Tag mutations
 *
 * React Query mutations for tag management.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { TagId } from '@quackback/ids'
import { createTagFn, updateTagFn, deleteTagFn } from '@/lib/server/functions/tags'

const TAGS_KEY = ['admin', 'tags']

/** Create a new tag. */
export function useCreateTag() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { name: string; color?: string }) => createTagFn({ data: input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TAGS_KEY })
    },
  })
}

/** Update an existing tag. */
export function useUpdateTag() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { id: TagId; name?: string; color?: string }) =>
      updateTagFn({ data: input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TAGS_KEY })
    },
  })
}

/** Soft-delete a tag. */
export function useDeleteTag() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: TagId) => deleteTagFn({ data: { id } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TAGS_KEY })
    },
  })
}
