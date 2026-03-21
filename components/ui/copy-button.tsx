'use client';

import * as React from 'react';
import { toast } from 'sonner';

import {
  CopyButton as AnimateCopyButton,
  type CopyButtonProps as AnimateCopyButtonProps,
} from '@/components/animate-ui/components/buttons/copy';
import { cn } from '@/lib/utils';

export type CopyButtonProps = AnimateCopyButtonProps & {
  /** Sonner message on successful copy (omit for silent). */
  copyToast?: string;
  /** When true (default), show sonner error if clipboard write fails. */
  toastOnError?: boolean;
};

/**
 * App-wide copy control: motion + copy/check icons from animate-ui, optional toasts.
 * Prefer importing from here instead of `@/components/animate-ui/components/buttons/copy`.
 */
function CopyButton({
  copyToast,
  toastOnError = true,
  onCopiedChange,
  onCopyError,
  variant = 'ghost',
  size = 'sm',
  className,
  ...props
}: CopyButtonProps) {
  const handleCopied = React.useCallback(
    (copied: boolean, content?: string) => {
      if (copied && copyToast) toast.success(copyToast);
      onCopiedChange?.(copied, content);
    },
    [copyToast, onCopiedChange],
  );

  const handleError = React.useCallback(
    (error: unknown) => {
      if (toastOnError) toast.error('Failed to copy');
      onCopyError?.(error);
    },
    [toastOnError, onCopyError],
  );

  return (
    <AnimateCopyButton
      variant={variant}
      size={size}
      className={cn('shrink-0', className)}
      {...props}
      onCopiedChange={copyToast || onCopiedChange ? handleCopied : undefined}
      onCopyError={toastOnError || onCopyError ? handleError : undefined}
    />
  );
}

export { CopyButton };
