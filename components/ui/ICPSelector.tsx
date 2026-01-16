"use client";

import { useState, useMemo } from 'react';
import { 
  FUNCTIONAL_AREAS,
  searchJobTitlesDB,
  getJobTitlesGroupedByFunction,
  JobTitle 
} from '@/lib/job-titles';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChevronDown, ChevronRight, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ICPSelectorProps {
  selected: string[];  // Array of job title strings
  onChange: (titles: string[]) => void;
  maxSelections?: number;
  placeholder?: string;
  disabled?: boolean;
}

export function ICPSelector({ 
  selected, 
  onChange, 
  maxSelections = 5,
  placeholder = "Select ICP targets...",
  disabled = false
}: ICPSelectorProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedFunctions, setExpandedFunctions] = useState<Set<string>>(new Set());
  
  const groupedTitles = useMemo(() => getJobTitlesGroupedByFunction(), []);
  
  const filteredTitles = useMemo(() => {
    if (!searchQuery.trim()) return null;
    return searchJobTitlesDB(searchQuery);
  }, [searchQuery]);
  
  const toggleFunction = (fn: string) => {
    setExpandedFunctions(prev => {
      const next = new Set(prev);
      if (next.has(fn)) {
        next.delete(fn);
      } else {
        next.add(fn);
      }
      return next;
    });
  };
  
  const toggleTitle = (title: string) => {
    if (selected.includes(title)) {
      onChange(selected.filter(t => t !== title));
    } else if (selected.length < maxSelections) {
      onChange([...selected, title]);
    }
  };
  
  const selectAllInFunction = (fn: string) => {
    const titlesInFunction = groupedTitles[fn as keyof typeof groupedTitles].map(jt => jt.title);
    const newSelected = [...new Set([...selected, ...titlesInFunction])];
    onChange(newSelected.slice(0, maxSelections));
  };

  return (
    <div className="space-y-3">
      {/* Selected titles as chips */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selected.map(title => (
            <Badge
              key={title}
              variant="secondary"
              className="inline-flex items-center gap-1 px-2 py-1 text-sm"
            >
              {title}
              <button 
                onClick={() => toggleTitle(title)}
                className="text-muted-foreground hover:text-foreground transition-colors"
                disabled={disabled}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
      
      {/* Search input */}
      <Input
        type="text"
        placeholder="Search job titles..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        disabled={disabled}
        className="w-full"
      />
      
      {/* Dropdown with grouped titles */}
      <div className="max-h-64 overflow-y-auto border rounded-lg">
        {filteredTitles ? (
          // Search results (flat list)
          <div className="p-2 space-y-1">
            {filteredTitles.map(jt => (
              <label 
                key={jt.id}
                className={cn(
                  "flex items-center gap-2 p-2 hover:bg-muted rounded cursor-pointer",
                  disabled && "opacity-50 cursor-not-allowed"
                )}
              >
                <input
                  type="checkbox"
                  checked={selected.includes(jt.title)}
                  onChange={() => toggleTitle(jt.title)}
                  disabled={disabled || (!selected.includes(jt.title) && selected.length >= maxSelections)}
                  className="rounded"
                />
                <span className="flex-1">{jt.title}</span>
                <span className="text-xs text-muted-foreground ml-auto">{jt.function}</span>
              </label>
            ))}
          </div>
        ) : (
          // Grouped by function (accordion)
          <div>
            {FUNCTIONAL_AREAS.map(fn => {
              const titles = groupedTitles[fn as keyof typeof groupedTitles];
              if (!titles?.length) return null;
              
              const isExpanded = expandedFunctions.has(fn);
              const selectedInGroup = titles.filter(jt => selected.includes(jt.title)).length;
              
              return (
                <div key={fn} className="border-b last:border-b-0">
                  <button
                    onClick={() => toggleFunction(fn)}
                    disabled={disabled}
                    className={cn(
                      "w-full flex items-center justify-between p-3 hover:bg-muted transition-colors",
                      disabled && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    <span className="font-medium text-sm">{fn}</span>
                    <div className="flex items-center gap-2">
                      {selectedInGroup > 0 && (
                        <Badge variant="secondary" className="text-xs">
                          {selectedInGroup} selected
                        </Badge>
                      )}
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </button>
                  
                  {isExpanded && (
                    <div className="pl-4 pb-2 space-y-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => selectAllInFunction(fn)}
                        disabled={disabled || selected.length >= maxSelections}
                        className="text-xs h-7 text-primary hover:text-primary"
                      >
                        Select all in {fn}
                      </Button>
                      {titles.map(jt => (
                        <label 
                          key={jt.id}
                          className={cn(
                            "flex items-center gap-2 p-2 hover:bg-muted rounded cursor-pointer",
                            disabled && "opacity-50 cursor-not-allowed"
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={selected.includes(jt.title)}
                            onChange={() => toggleTitle(jt.title)}
                            disabled={disabled || (!selected.includes(jt.title) && selected.length >= maxSelections)}
                            className="rounded"
                          />
                          <span className="text-sm flex-1">{jt.title}</span>
                          <span className="text-xs text-muted-foreground ml-auto">{jt.seniority}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      
      {selected.length >= maxSelections && (
        <p className="text-xs text-muted-foreground">
          Maximum {maxSelections} selections reached
        </p>
      )}
    </div>
  );
}
