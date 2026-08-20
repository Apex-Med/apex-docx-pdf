"use client"

import {
  AlertCircleIcon,
  FileEmpty02Icon,
  MultiplicationSignIcon,
  PlusSignIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"
import {
  formatBytes,
  useFileUpload,
  type FileMetadata,
  type FileWithPreview,
} from "@workspace/ui/hooks/use-file-upload"
import { cn } from "@workspace/ui/lib/utils"

export type FileUploadProps = Readonly<{
  maxFiles?: number
  maxSize?: number
  accept?: string
  multiple?: boolean
  disabled?: boolean
  className?: string
  onFilesChange?: (files: FileWithPreview[]) => void
}>

function isImageFile(file: File | FileMetadata): boolean {
  const type = file instanceof File ? file.type : file.type
  return type.startsWith("image/")
}

export function FileUpload({
  maxFiles = 3,
  maxSize = 2 * 1024 * 1024,
  accept = "image/*",
  multiple = true,
  disabled = false,
  className,
  onFilesChange,
}: FileUploadProps) {
  const [
    { files, isDragging, errors },
    {
      removeFile,
      handleDragEnter,
      handleDragLeave,
      handleDragOver,
      handleDrop,
      openFileDialog,
      getInputProps,
    },
  ] = useFileUpload({
    maxFiles,
    maxSize,
    accept,
    multiple,
    onFilesChange,
  })

  return (
    <div className={cn("w-full min-w-0", className)}>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: drag-and-drop zone */}
      <div
        className={cn(
          "flex min-w-0 items-center gap-3 rounded-lg border border-dashed border-border p-4 transition-colors",
          isDragging
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25 hover:border-muted-foreground/50",
          disabled && "pointer-events-none opacity-50"
        )}
        onDragEnter={disabled ? undefined : handleDragEnter}
        onDragLeave={disabled ? undefined : handleDragLeave}
        onDragOver={disabled ? undefined : handleDragOver}
        onDrop={disabled ? undefined : handleDrop}
      >
        <input {...getInputProps({ disabled })} className="sr-only" aria-hidden />

        <Button
          type="button"
          onClick={openFileDialog}
          size="sm"
          disabled={disabled}
          className={cn("shrink-0", isDragging && "animate-bounce")}
        >
          <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} data-icon="inline-start" />
          Add files
        </Button>

        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
          {files.length === 0 ? (
            <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
              Drop files here or click to browse (max {maxFiles} files)
            </p>
          ) : (
            <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
              {files.map((fileItem) => (
                <div key={fileItem.id} className="group/item relative shrink-0">
                  {isImageFile(fileItem.file) && fileItem.preview ? (
                    <img
                      src={fileItem.preview}
                      alt={fileItem.file.name}
                      className="size-12 rounded-lg border object-cover"
                      title={`${fileItem.file.name} (${formatBytes(fileItem.file.size)})`}
                    />
                  ) : (
                    <div
                      className="flex size-12 items-center justify-center rounded-lg border bg-muted"
                      title={`${fileItem.file.name} (${formatBytes(fileItem.file.size)})`}
                    >
                      <HugeiconsIcon
                        icon={FileEmpty02Icon}
                        strokeWidth={2}
                        className="size-5 text-muted-foreground"
                      />
                    </div>
                  )}

                  {!disabled ? (
                    <Button
                      type="button"
                      onClick={() => removeFile(fileItem.id)}
                      variant="outline"
                      size="icon-xs"
                      className="absolute -end-2 -top-2 rounded-full opacity-0 shadow-md transition-opacity group-hover/item:opacity-100"
                      aria-label={`Remove ${fileItem.file.name}`}
                    >
                      <HugeiconsIcon icon={MultiplicationSignIcon} strokeWidth={2} />
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>

        {files.length > 0 ? (
          <div className="shrink-0 text-xs text-muted-foreground">
            {files.length}/{maxFiles}
          </div>
        ) : null}
      </div>

      {errors.length > 0 ? (
        <Alert variant="destructive" className="mt-3">
          <HugeiconsIcon icon={AlertCircleIcon} strokeWidth={2} />
          <AlertTitle>File upload error(s)</AlertTitle>
          <AlertDescription>
            {errors.map((error) => (
              <p key={error} className="last:mb-0">
                {error}
              </p>
            ))}
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  )
}
