import { useEffect, useState } from 'react'
import { PencilIcon, PlusIcon, TagIcon, TrashIcon } from '@heroicons/react/24/solid'
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { EmptyState } from '@/components/shared/empty-state'
import { SettingsCard } from '@/components/admin/settings/settings-card'
import { useCreateTag, useDeleteTag, useUpdateTag } from '@/lib/client/mutations'
import type { Tag } from '@/lib/shared/db-types'
import type { TagId } from '@quackback/ids'

// ─── Tag Form Dialog ──────────────────────────────────────────────────────────

const PRESET_COLORS = [
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#14b8a6',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#6b7280',
  '#1e293b',
]

interface TagFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialValues?: { id?: TagId; name?: string; color?: string }
  existingNames: string[]
  onSubmit: (name: string, color: string) => Promise<void>
  isPending?: boolean
}

function TagFormDialog({
  open,
  onOpenChange,
  initialValues,
  existingNames,
  onSubmit,
  isPending,
}: TagFormDialogProps) {
  const isEditing = !!initialValues?.id
  const [name, setName] = useState(initialValues?.name ?? '')
  const [color, setColor] = useState(initialValues?.color ?? PRESET_COLORS[0])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setName(initialValues?.name ?? '')
      setColor(initialValues?.color ?? PRESET_COLORS[0])
      setError(null)
    }
  }, [open])

  const validate = (value: string): string | null => {
    const trimmed = value.trim()
    if (!trimmed) return 'Tag name is required'
    const duplicate = existingNames
      .filter((n) => n.toLowerCase() !== (initialValues?.name ?? '').toLowerCase())
      .some((n) => n.toLowerCase() === trimmed.toLowerCase())
    if (duplicate) return 'A tag with this name already exists'
    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const validationError = validate(name)
    if (validationError) {
      setError(validationError)
      return
    }
    await onSubmit(name.trim(), color)
  }

  const handleNameChange = (value: string) => {
    setName(value)
    if (error) setError(validate(value))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit tag' : 'Create tag'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="tag-name">Name</Label>
            <Input
              id="tag-name"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="e.g. Bug, Feature, UX…"
              autoFocus
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Color</Label>
            <div className="flex flex-wrap gap-2">
              {PRESET_COLORS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  title={preset}
                  onClick={() => setColor(preset)}
                  className="h-6 w-6 rounded-full border-2 transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
                  style={{
                    backgroundColor: preset,
                    borderColor: color === preset ? 'white' : 'transparent',
                    boxShadow: color === preset ? `0 0 0 2px ${preset}` : undefined,
                  }}
                />
              ))}
              <label
                title="Custom color"
                className="h-6 w-6 rounded-full border-2 border-dashed border-muted-foreground/50 flex items-center justify-center cursor-pointer hover:border-muted-foreground transition-colors overflow-hidden"
                style={
                  !PRESET_COLORS.includes(color)
                    ? {
                        backgroundColor: color,
                        borderColor: 'white',
                        boxShadow: `0 0 0 2px ${color}`,
                      }
                    : {}
                }
              >
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="opacity-0 absolute w-px h-px"
                />
                {PRESET_COLORS.includes(color) && (
                  <span className="text-[10px] text-muted-foreground">+</span>
                )}
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || !name.trim()}>
              {isPending
                ? isEditing
                  ? 'Saving…'
                  : 'Creating…'
                : isEditing
                  ? 'Save'
                  : 'Create tag'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Tag List ─────────────────────────────────────────────────────────────────

interface TagListProps {
  initialTags: Tag[]
}

export function TagList({ initialTags }: TagListProps) {
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Tag | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Tag | null>(null)

  const createTag = useCreateTag()
  const updateTag = useUpdateTag()
  const deleteTag = useDeleteTag()

  const activeTags = initialTags.filter((t) => !t.deletedAt)
  const existingNames = activeTags.map((t) => t.name)

  const filtered = activeTags.filter((t) => t.name.toLowerCase().includes(search.toLowerCase()))

  const handleCreate = async (name: string, color: string) => {
    await createTag.mutateAsync({ name, color })
    setCreateOpen(false)
  }

  const handleUpdate = async (name: string, color: string) => {
    if (!editTarget) return
    await updateTag.mutateAsync({ id: editTarget.id as TagId, name, color })
    setEditTarget(null)
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    await deleteTag.mutateAsync(deleteTarget.id as TagId)
    setDeleteTarget(null)
  }

  return (
    <SettingsCard
      title="Tags"
      action={
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <PlusIcon className="h-3.5 w-3.5 mr-1.5" />
          New tag
        </Button>
      }
      contentClassName="p-0"
    >
      {/* Search */}
      <div className="px-4 py-3 border-b border-border">
        <div className="relative max-w-xs">
          <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tags…"
            className="pl-8 h-8 text-sm"
          />
        </div>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="p-6">
          <EmptyState
            icon={TagIcon}
            title={search ? 'No tags found' : 'No tags yet'}
            description={
              search ? 'Try a different search term' : 'Create your first tag to get started'
            }
          />
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {filtered.map((tag) => (
            <li key={tag.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: tag.color ?? '#6b7280' }}
                />
                <span className="text-sm font-medium truncate">{tag.name}</span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setEditTarget(tag)}
                  title="Edit tag"
                >
                  <PencilIcon className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive hover:text-destructive"
                  onClick={() => setDeleteTarget(tag)}
                  title="Delete tag"
                >
                  <TrashIcon className="h-3.5 w-3.5" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Create dialog */}
      <TagFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        existingNames={existingNames}
        onSubmit={handleCreate}
        isPending={createTag.isPending}
      />

      {/* Edit dialog */}
      <TagFormDialog
        open={!!editTarget}
        onOpenChange={(open) => {
          if (!open) setEditTarget(null)
        }}
        initialValues={
          editTarget
            ? {
                id: editTarget.id as TagId,
                name: editTarget.name,
                color: editTarget.color ?? undefined,
              }
            : undefined
        }
        existingNames={existingNames}
        onSubmit={handleUpdate}
        isPending={updateTag.isPending}
      />

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        title={`Delete "${deleteTarget?.name}"?`}
        description="This tag will be removed from all posts. This action cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        isPending={deleteTag.isPending}
        onConfirm={handleDelete}
      />
    </SettingsCard>
  )
}
