import React from 'react';
import { Newspaper } from 'lucide-react';

interface EmptyStateProps {
  title: string;
  description: string;
  icon?: React.ReactNode;
}

export function EmptyState({ title, description, icon }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="text-stone-500 mb-4">
        {icon || <Newspaper size={64} />}
      </div>
      <h3 className="text-xl font-semibold text-stone-200 mb-2">{title}</h3>
      <p className="text-stone-400 text-center max-w-md">{description}</p>
    </div>
  );
}
