import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { cn } from "@/lib/utils";

const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SliderPrimitive.Root
    ref={ref}
    className={cn("ui-slider relative flex w-full touch-none select-none items-center", className)}
    {...props}
  >
    <SliderPrimitive.Track className="ui-slider-track relative h-1.5 w-full grow overflow-hidden rounded-full">
      <SliderPrimitive.Range className="ui-slider-range absolute h-full" />
    </SliderPrimitive.Track>
    <SliderPrimitive.Thumb className="ui-slider-thumb block size-4 rounded-full shadow focus-visible:outline-none" />
  </SliderPrimitive.Root>
));
Slider.displayName = SliderPrimitive.Root.displayName;

export { Slider };
