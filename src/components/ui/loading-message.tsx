import { Loader2 } from 'lucide-react';

interface LoadingMessageProps {
  className?: string;
}

const LoadingMessage = ({ className = '' }: LoadingMessageProps) => (
  <div className={`flex items-center gap-2 text-sm text-muted-foreground ${className}`} role="status" aria-live="polite">
    <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden="true" />
    <span>Yükleniyor, lütfen bekleyiniz...</span>
  </div>
);

export default LoadingMessage;
