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
} from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

// A combobox that lets the user pick an existing option OR type a brand-new value
// and add it on the fly (e.g. a custom guest "side" or "relationship"). Used
// anywhere in the app that needs a creatable dropdown backed by a free-text column.
export function CreatableSelect({
  value,
  onChange,
  options = [],
  placeholder = "בחר או הוסף...",
  emptyText = "לא נמצאו תוצאות",
  createLabel = (v) => `הוסף "${v}"`,
  className,
}) {
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState("")

  const trimmedSearch = search.trim()
  const normalizedOptions = React.useMemo(
    () => Array.from(new Set(options.filter(Boolean))),
    [options]
  )
  const canCreate =
    trimmedSearch.length > 0 &&
    !normalizedOptions.some((o) => o === trimmedSearch)

  const handleSelect = (nextValue) => {
    onChange(nextValue)
    setSearch("")
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between font-normal", !value && "text-muted-foreground", className)}
        >
          <span className="truncate">{value || placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            value={search}
            onValueChange={setSearch}
            placeholder="חפש או הקלד ערך חדש..."
          />
          <CommandList>
            {!canCreate && normalizedOptions.filter((o) => o.includes(trimmedSearch)).length === 0 && (
              <CommandEmpty>{emptyText}</CommandEmpty>
            )}
            <CommandGroup>
              {normalizedOptions
                .filter((o) => o.includes(trimmedSearch))
                .map((option) => (
                  <CommandItem key={option} value={option} onSelect={() => handleSelect(option)}>
                    <Check
                      className={cn("mr-2 h-4 w-4", value === option ? "opacity-100" : "opacity-0")}
                    />
                    {option}
                  </CommandItem>
                ))}
              {canCreate && (
                <CommandItem value={trimmedSearch} onSelect={() => handleSelect(trimmedSearch)}>
                  <Plus className="mr-2 h-4 w-4" />
                  {createLabel(trimmedSearch)}
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
