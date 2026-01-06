"use client";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ASSET_TYPES_GROUPED } from "@/lib/constants/asset-types";

interface AssetTypeSelectorProps {
  value: string | null | undefined;
  onChange: (value: string) => void;
  disabled?: boolean;
}

/**
 * Reusable component for selecting marketing asset types
 * Displays grouped options by category (Proof & Validation, Thought Leadership, etc.)
 */
export function AssetTypeSelector({
  value,
  onChange,
  disabled = false,
}: AssetTypeSelectorProps) {
  return (
    <Select
      value={value || ""}
      onValueChange={onChange}
      disabled={disabled}
    >
      <SelectTrigger>
        <SelectValue placeholder="Select asset type..." />
      </SelectTrigger>
      <SelectContent>
        {ASSET_TYPES_GROUPED.map((group) => (
          <SelectGroup key={group.label}>
            <SelectLabel>{group.label}</SelectLabel>
            {group.options.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
