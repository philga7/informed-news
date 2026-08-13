import { Loader2 } from 'lucide-react';

interface LoadingSpinnerProps {
  message?: string;
}

export function LoadingSpinner({ message = 'Loading...' }: LoadingSpinnerProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <Loader2 className="animate-spin text-amber-500 mb-4" size={48} />
      <p className="text-stone-400">{message}</p>
    </div>
  );
}
