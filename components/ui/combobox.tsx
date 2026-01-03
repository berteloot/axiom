"use client"

import * as React from "react"
import { Check, ChevronsUpDown, Plus } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

interface ComboboxProps {
  options: string[]
  value: string[]
  onChange: (value: string[]) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  creatable?: boolean
  createText?: string
}

export function MultiSelectCombobox({
  options,
  value,
  onChange,
  placeholder = "Select items...",
  searchPlaceholder = "Search...",
  emptyText = "No items found.",
  creatable = false,
  createText = "Create",
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const [searchQuery, setSearchQuery] = React.useState("")
  const buttonRef = React.useRef<HTMLButtonElement>(null)

  // Reset search query when popover closes
  React.useEffect(() => {
    if (!open) {
      setSearchQuery("")
    }
  }, [open])

  const handleSelect = (option: string) => {
    if (value.includes(option)) {
      onChange(value.filter((item) => item !== option))
    } else {
      onChange([...value, option])
    }
    // Don't close the popover when selecting, allow multiple selections
  }

  const handleCreate = () => {
    const trimmedQuery = searchQuery.trim()
    if (trimmedQuery) {
      // Check case-insensitively if it already exists
      const queryLower = trimmedQuery.toLowerCase()
      const alreadyExists = 
        options.some(opt => opt.toLowerCase() === queryLower) ||
        value.some(val => val.toLowerCase() === queryLower)
      
      if (!alreadyExists) {
        onChange([...value, trimmedQuery])
        setSearchQuery("")
      }
    }
  }

  // Filter options based on search query
  const filteredOptions = React.useMemo(() => {
    if (!searchQuery.trim()) {
      return options
    }
    const query = searchQuery.toLowerCase()
    return options.filter(option => 
      option.toLowerCase().includes(query)
    )
  }, [options, searchQuery])

  // Check if search query matches any existing option (case-insensitive)
  const exactMatch = React.useMemo(() => {
    if (!searchQuery.trim()) return false
    const query = searchQuery.trim().toLowerCase()
    return options.some(opt => opt.toLowerCase() === query) || 
           value.some(val => val.toLowerCase() === query)
  }, [options, value, searchQuery])

  // Show create option if:
  // 1. creatable is enabled
  // 2. search query is not empty
  // 3. search query doesn't exactly match any existing option (case-insensitive)
  // 4. search query is not already selected (case-insensitive)
  const showCreateOption = creatable && 
    searchQuery.trim().length > 0 && 
    !exactMatch

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          ref={buttonRef}
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
        >
          {value.length > 0
            ? `${value.length} selected`
            : placeholder}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent 
        className="p-0" 
        align="start"
        style={{ width: buttonRef.current?.offsetWidth }}
      >
        <Command shouldFilter={false}>
          <CommandInput 
            placeholder={searchPlaceholder}
            value={searchQuery}
            onValueChange={setSearchQuery}
          />
          <CommandList>
            {filteredOptions.length === 0 && !showCreateOption ? (
              <CommandEmpty>{emptyText}</CommandEmpty>
            ) : (
              <>
                {filteredOptions.length > 0 && (
                  <CommandGroup>
                    {filteredOptions.map((option) => {
                      const isSelected = value.includes(option)
                      return (
                        <CommandItem
                          key={option}
                          value={option}
                          onSelect={() => handleSelect(option)}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              isSelected ? "opacity-100" : "opacity-0"
                            )}
                          />
                          {option}
                        </CommandItem>
                      )
                    })}
                  </CommandGroup>
                )}
                {showCreateOption && (
                  <>
                    {filteredOptions.length > 0 && <CommandSeparator />}
                    <CommandGroup>
                      <CommandItem
                        value={`__create__${searchQuery.trim()}`}
                        onSelect={handleCreate}
                        className="text-primary font-medium"
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        {createText} &quot;{searchQuery.trim()}&quot;
                      </CommandItem>
                    </CommandGroup>
                  </>
                )}
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
