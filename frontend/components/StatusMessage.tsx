import type { Status } from '../types/models';

interface StatusMessageProps {
  status: Status | null;
  className?: string;
}

const STYLES: Record<Status['type'], string> = {
  success: 'bg-emerald-50 text-emerald-700 border border-emerald-100',
  error: 'bg-rose-50 text-rose-700 border border-rose-100',
};

/** An inline success or error message, announced to screen readers. */
export default function StatusMessage({ status, className = '' }: StatusMessageProps) {
  if (!status) return null;
  return (
    <div
      role={status.type === 'error' ? 'alert' : 'status'}
      className={`p-3 rounded-xl text-sm font-medium ${STYLES[status.type]} ${className}`}
    >
      {status.text}
    </div>
  );
}
