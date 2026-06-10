import * as React from "react";
import { cn } from "@/lib/utils";

interface OrbitingDotsProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: number;
  dotSize?: number;
  dots?: number;
  speedMs?: number;
}

export function OrbitingDots({
  size = 28,
  dotSize = 5,
  dots = 3,
  speedMs = 1100,
  className,
  style,
  ...props
}: OrbitingDotsProps) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={cn("relative inline-block", className)}
      style={{ width: size, height: size, ...style }}
      {...props}
    >
      <div
        className="absolute inset-0 animate-spin"
        style={{ animationDuration: `${speedMs}ms` }}
      >
        {Array.from({ length: dots }).map((_, i) => {
          const angle = (360 / dots) * i;
          return (
            <span
              key={i}
              className="absolute left-1/2 top-1/2 rounded-full bg-foreground/70"
              style={{
                width: dotSize,
                height: dotSize,
                transform: `rotate(${angle}deg) translateY(-${size / 2 - dotSize / 2}px) translateX(-50%)`,
                transformOrigin: "0 0",
                opacity: 1 - i * (0.5 / Math.max(dots - 1, 1)),
              }}
            />
          );
        })}
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
