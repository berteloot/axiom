"use client";

import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { DATAFORSEO_LOCATIONS, getLocationsByRegion, type Location } from "@/lib/keywords/dataforseo-locations";

interface LocationSelectorProps {
  value: string; // Location name
  onChange: (location: string) => void;
  disabled?: boolean;
  className?: string;
}

export function LocationSelector({
  value,
  onChange,
  disabled = false,
  className,
}: LocationSelectorProps) {
  const [open, setOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");

  // Reset search query when popover closes
  React.useEffect(() => {
    if (!open) {
      setSearchQuery("");
    }
  }, [open]);

  // Filter locations based on search query
  const filteredLocations = React.useMemo(() => {
    if (!searchQuery.trim()) {
      return DATAFORSEO_LOCATIONS;
    }
    const query = searchQuery.toLowerCase();
    return DATAFORSEO_LOCATIONS.filter(
      (loc) =>
        loc.name.toLowerCase().includes(query) ||
        loc.code?.toLowerCase().includes(query) ||
        loc.region?.toLowerCase().includes(query)
    );
  }, [searchQuery]);

  // Group filtered locations by region
  const groupedLocations = React.useMemo(() => {
    const grouped = new Map<string, Location[]>();
    filteredLocations.forEach((loc) => {
      const region = loc.region || "Other";
      if (!grouped.has(region)) {
        grouped.set(region, []);
      }
      grouped.get(region)!.push(loc);
    });
    return grouped;
  }, [filteredLocations]);

  const selectedLocation = DATAFORSEO_LOCATIONS.find(
    (loc) => loc.name === value
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn("w-full justify-between", className)}
        >
          <span className="truncate">
            {selectedLocation ? (
              <>
                {selectedLocation.name}
                {selectedLocation.code && (
                  <span className="text-muted-foreground ml-2">
                    ({selectedLocation.code})
                  </span>
                )}
              </>
            ) : (
              value || "Select location..."
            )}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search location..."
            value={searchQuery}
            onValueChange={setSearchQuery}
          />
          <CommandList>
            {filteredLocations.length === 0 ? (
              <CommandEmpty>No location found.</CommandEmpty>
            ) : (
              Array.from(groupedLocations.entries()).map(([region, locations]) => (
                <CommandGroup key={region} heading={region}>
                  {locations.map((location) => (
                    <CommandItem
                      key={location.name}
                      value={location.name}
                      onSelect={() => {
                        onChange(location.name);
                        setOpen(false);
                      }}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          value === location.name
                            ? "opacity-100"
                            : "opacity-0"
                        )}
                      />
                      <div className="flex items-center gap-2">
                        <span>{location.name}</span>
                        {location.code && (
                          <span className="text-muted-foreground text-xs">
                            {location.code}
                          </span>
                        )}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
