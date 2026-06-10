import * as React from "react";
import { cn } from "@/lib/utils";

interface PrismLogoProps extends React.SVGProps<SVGSVGElement> {
  size?: number;
  tone?: "light" | "dark";
  animated?: boolean;
}

export function PrismLogo({
  size = 28,
  tone = "dark",
  animated = true,
  className,
  ...props
}: PrismLogoProps) {
  const outline = tone === "dark" ? "#7a7d52" : "#5e6441";
  const inner = tone === "dark" ? "#d8dcb3" : "#8a8e60";
  const trace = tone === "dark" ? "#f4f7cc" : "#a3a866";

  const hexPath = "M16 4 L26.4 10 L26.4 22 L16 28 L5.6 22 L5.6 10 Z";

  const traceStyle: React.CSSProperties | undefined = animated
    ? { animation: "prism-trace 6s cubic-bezier(0.4, 0, 0.2, 1) infinite" }
    : undefined;

  const facet = (
    delay: string,
    originX: number,
    originY: number
  ): React.CSSProperties | undefined =>
    animated
      ? {
          animation: "prism-facet 3.6s cubic-bezier(0.4, 0, 0.2, 1) infinite",
          animationDelay: delay,
          transformOrigin: `${originX}px ${originY}px`,
          transformBox: "view-box",
        }
      : undefined;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0", className)}
      aria-hidden
      {...props}
    >
      <path
        d={hexPath}
        stroke={outline}
        strokeWidth="2.4"
        strokeLinejoin="round"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d={hexPath}
        stroke={trace}
        strokeWidth="2.4"
        strokeLinejoin="round"
        strokeLinecap="round"
        fill="none"
        strokeDasharray="10 62"
        style={traceStyle}
      />

      <path
        d="M16 9 L19.5 15.5 L12.5 15.5 Z"
        fill={inner}
        style={facet("0s", 16, 13.33)}
      />
      <path
        d="M19.5 15.5 L22.5 22 L16 22 Z"
        fill={inner}
        style={facet("1.2s", 19.33, 19.83)}
      />
      <path
        d="M12.5 15.5 L16 22 L9.5 22 Z"
        fill={inner}
        style={facet("2.4s", 12.67, 19.83)}
      />
    </svg>
  );
}
