"use client"

import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox"
import { cn } from "cn"
import { CheckIcon, MinusIcon } from "lucide-react"

/** Design system checkbox (Átomos · Selección): 20 px, on/indeterminate = Kotizi blue with a white mark. */
function Checkbox({ className, ...props }: CheckboxPrimitive.Root.Props) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "group focus-ring peer relative flex size-5 shrink-0 items-center justify-center rounded-xs border-[1.5px] border-default text-on-brand transition-colors after:absolute after:-inset-x-3 after:-inset-y-2 not-data-disabled:hover:border-strong data-checked:border-transparent data-checked:bg-brand data-indeterminate:border-transparent data-indeterminate:bg-brand data-disabled:cursor-not-allowed data-disabled:border-transparent data-disabled:bg-disabled data-disabled:text-disabled aria-invalid:border-error",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current transition-none [&>svg]:size-3.5 [&>svg]:stroke-3"
      >
        <CheckIcon className="group-data-indeterminate:hidden" />
        <MinusIcon className="hidden group-data-indeterminate:block" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
