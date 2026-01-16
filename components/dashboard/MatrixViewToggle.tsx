"use client";

export type MatrixViewLevel = 'title' | 'function' | 'seniority';

interface MatrixViewToggleProps {
  value: MatrixViewLevel;
  onChange: (level: MatrixViewLevel) => void;
}

export function MatrixViewToggle({ value, onChange }: MatrixViewToggleProps) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">View by:</span>
      <div className="flex rounded-lg border border-border overflow-hidden">
        <button
          onClick={() => onChange('title')}
          className={`px-3 py-1.5 transition-colors ${
            value === 'title' 
              ? 'bg-primary text-primary-foreground' 
              : 'bg-background text-foreground hover:bg-muted'
          }`}
        >
          Title
        </button>
        <button
          onClick={() => onChange('function')}
          className={`px-3 py-1.5 border-l border-border transition-colors ${
            value === 'function' 
              ? 'bg-primary text-primary-foreground' 
              : 'bg-background text-foreground hover:bg-muted'
          }`}
        >
          Function
        </button>
        <button
          onClick={() => onChange('seniority')}
          className={`px-3 py-1.5 border-l border-border transition-colors ${
            value === 'seniority' 
              ? 'bg-primary text-primary-foreground' 
              : 'bg-background text-foreground hover:bg-muted'
          }`}
        >
          Seniority
        </button>
      </div>
    </div>
  );
}
