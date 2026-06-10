"use client";

import * as React from "react";

export interface Bar {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

type Interval = "D" | "W";

interface Props {
  bars: Bar[];
  interval: Interval;
  logScale: boolean;
  emas: number[];
  volAvg: number;
}

const MA_COLOR: Record<number, string> = {
  4: "rgb(22 163 74)",
  10: "rgb(37 99 235)",
  40: "rgb(220 38 38)",
};

function weeklyAggregate(daily: Bar[]): Bar[] {
  if (daily.length === 0) return [];
  const out: Bar[] = [];
  let bucket: Bar | null = null;
  let bucketKey = -1;
  for (const b of daily) {
    const d = new Date(b.t);
    const day = d.getUTCDay() || 7;
    const monday = new Date(b.t);
    monday.setUTCDate(d.getUTCDate() - (day - 1));
    monday.setUTCHours(0, 0, 0, 0);
    const key = monday.getTime();
    if (key !== bucketKey) {
      if (bucket) out.push(bucket);
      bucket = { t: key, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v };
      bucketKey = key;
    } else if (bucket) {
      bucket.h = Math.max(bucket.h, b.h);
      bucket.l = Math.min(bucket.l, b.l);
      bucket.c = b.c;
      bucket.v += b.v;
    }
  }
  if (bucket) out.push(bucket);
  return out;
}

function sma(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (period <= 0 || values.length < period) return out;
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

function ema(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (period <= 0 || values.length < period) return out;
  const k = 2 / (period + 1);
  let seed = 0;
  for (let i = 0; i < period; i++) seed += values[i];
  let prev = seed / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

function fmtDateShort(ms: number, interval: Interval): string {
  const d = new Date(ms);
  const mon = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ][d.getUTCMonth()];
  const yr = String(d.getUTCFullYear()).slice(-2);
  if (interval === "W") return `${mon} '${yr}`;
  return `${mon} ${String(d.getUTCDate()).padStart(2, "0")}`;
}

function fmtDateFull(ms: number): string {
  const d = new Date(ms);
  const mon = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ][d.getUTCMonth()];
  return `${String(d.getUTCDate()).padStart(2, "0")} ${mon} ${d.getUTCFullYear()}`;
}

function fmtPrice(v: number): string {
  if (!Number.isFinite(v)) return "—";
  if (v >= 1000) return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return v.toFixed(2);
}

function fmtVolume(v: number): string {
  if (!Number.isFinite(v)) return "—";
  if (v >= 1e9) return (v / 1e9).toFixed(2) + "B";
  if (v >= 1e6) return (v / 1e6).toFixed(2) + "M";
  if (v >= 1e3) return (v / 1e3).toFixed(1) + "K";
  return String(Math.round(v));
}

/** "Nice" tick generator for log/linear price axes. */
function linearTicks(lo: number, hi: number, count: number): number[] {
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) return [];
  const raw = (hi - lo) / count;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / pow;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * pow;
  const first = Math.ceil(lo / step) * step;
  const out: number[] = [];
  for (let v = first; v <= hi + 1e-9; v += step) out.push(Number(v.toFixed(10)));
  return out;
}

function logTicks(lo: number, hi: number): number[] {
  if (lo <= 0 || hi <= lo) return [];
  const out: number[] = [];
  const decLo = Math.floor(Math.log10(lo));
  const decHi = Math.ceil(Math.log10(hi));
  for (let d = decLo; d <= decHi; d++) {
    for (const m of [1, 2, 5]) {
      const v = m * Math.pow(10, d);
      if (v >= lo * 0.999 && v <= hi * 1.001) out.push(v);
    }
  }
  return out;
}

export function MarketSmithChart({ bars: dailyBars, interval, logScale, emas, volAvg }: Props) {
  const bars = React.useMemo(
    () => (interval === "W" ? weeklyAggregate(dailyBars) : dailyBars),
    [dailyBars, interval]
  );

  const closes = React.useMemo(() => bars.map((b) => b.c), [bars]);
  const volumes = React.useMemo(() => bars.map((b) => b.v), [bars]);

  const maSeries = React.useMemo(() => {
    return emas.map((p) => ({ period: p, values: ema(closes, p) }));
  }, [closes, emas]);

  const volSmaValues = React.useMemo(
    () => sma(volumes, volAvg),
    [volumes, volAvg]
  );

  const W = 1120;
  const H = 720;
  const padL = 16;
  const padR = 72;
  const padT = 28;
  const padB = 44;
  const volH = 130;
  const gap = 8;
  const priceH = H - padT - padB - gap - volH;
  const innerW = W - padL - padR;

  const N = bars.length;
  const [range, setRange] = React.useState<[number, number] | null>(null);
  const [hover, setHover] = React.useState<number | null>(null);
  const svgRef = React.useRef<SVGSVGElement | null>(null);
  const [panStart, setPanStart] = React.useState<
    { vbX: number; range: [number, number] } | null
  >(null);
  const clipId = React.useId();
  React.useEffect(() => {
    setRange(null);
    setHover(null);
  }, [N, interval]);

  const iLo = range ? range[0] : 0;
  const iHi = range ? range[1] : Math.max(0, N - 1);
  const visibleCount = Math.max(1, iHi - iLo + 1);

  // Price bounds over visible range
  let priceLo = Infinity;
  let priceHi = -Infinity;
  for (let i = iLo; i <= iHi && i < N; i++) {
    const b = bars[i];
    if (b.l < priceLo) priceLo = b.l;
    if (b.h > priceHi) priceHi = b.h;
  }
  for (const s of maSeries) {
    for (let i = iLo; i <= iHi && i < N; i++) {
      const v = s.values[i];
      if (v === null) continue;
      if (v < priceLo) priceLo = v;
      if (v > priceHi) priceHi = v;
    }
  }
  if (!Number.isFinite(priceLo) || !Number.isFinite(priceHi)) {
    priceLo = 0;
    priceHi = 1;
  }
  // padding
  if (logScale) {
    const logLo = Math.log10(Math.max(priceLo, 1e-9));
    const logHi = Math.log10(priceHi);
    const padLog = (logHi - logLo) * 0.04 || 0.02;
    priceLo = Math.pow(10, logLo - padLog);
    priceHi = Math.pow(10, logHi + padLog);
  } else {
    const padLin = (priceHi - priceLo) * 0.06 || Math.abs(priceHi) * 0.06 || 1;
    priceLo -= padLin;
    priceHi += padLin;
  }

  // Volume bounds
  let volHi = 0;
  for (let i = iLo; i <= iHi && i < N; i++) {
    if (bars[i].v > volHi) volHi = bars[i].v;
  }
  for (let i = iLo; i <= iHi && i < N; i++) {
    const v = volSmaValues[i];
    if (v !== null && v > volHi) volHi = v;
  }
  volHi = volHi * 1.08 || 1;

  const slotW = innerW / visibleCount;
  const barHalf = Math.min(slotW * 0.35, 4);
  const barStroke = Math.min(1.4, Math.max(0.8, slotW * 0.12));

  const xAt = (i: number) => padL + (i - iLo + 0.5) * slotW;

  const yPrice = (p: number) => {
    if (logScale) {
      const lo = Math.log10(priceLo);
      const hi = Math.log10(priceHi);
      const v = Math.log10(Math.max(p, 1e-9));
      return padT + priceH - ((v - lo) / (hi - lo)) * priceH;
    }
    return padT + priceH - ((p - priceLo) / (priceHi - priceLo)) * priceH;
  };

  const volTop = padT + priceH + gap;
  const yVol = (v: number) => volTop + volH - (v / volHi) * volH;

  const priceTicks = logScale
    ? logTicks(priceLo, priceHi)
    : linearTicks(priceLo, priceHi, 8);

  // X axis: tick every ~N/8 slots; labels align to month/year boundaries
  const xTickStep = Math.max(1, Math.floor(visibleCount / 8));
  const xTickIdx: number[] = [];
  for (let i = iLo; i <= iHi && i < N; i += xTickStep) xTickIdx.push(i);
  if (xTickIdx[xTickIdx.length - 1] !== Math.min(iHi, N - 1)) {
    xTickIdx.push(Math.min(iHi, N - 1));
  }

  // EMA paths (visible slice only)
  const maPaths = maSeries.map((s) => {
    const parts: string[] = [];
    let started = false;
    for (let i = iLo; i <= iHi && i < N; i++) {
      const v = s.values[i];
      if (v === null || !Number.isFinite(v)) {
        started = false;
        continue;
      }
      parts.push(`${started ? "L" : "M"}${xAt(i)},${yPrice(v)}`);
      started = true;
    }
    return { period: s.period, d: parts.join(" ") };
  });

  // Volume SMA path
  const volPath: string[] = [];
  {
    let started = false;
    for (let i = iLo; i <= iHi && i < N; i++) {
      const v = volSmaValues[i];
      if (v === null) {
        started = false;
        continue;
      }
      volPath.push(`${started ? "L" : "M"}${xAt(i)},${yVol(v)}`);
      started = true;
    }
  }

  // Interaction
  const isPanning = panStart !== null;

  function clientToVbX(clientX: number): number | null {
    const svg = svgRef.current;
    if (!svg) return null;
    const r = svg.getBoundingClientRect();
    if (r.width === 0) return null;
    return ((clientX - r.left) / r.width) * W;
  }

  function vbXToIndex(vbX: number): number {
    const idx = Math.round(iLo + (vbX - padL) / slotW - 0.5);
    return Math.max(iLo, Math.min(iHi, idx));
  }

  function onDown(e: React.PointerEvent<SVGSVGElement>) {
    if (e.button !== 0) return;
    const vbX = clientToVbX(e.clientX);
    if (vbX === null) return;
    if (vbX < padL || vbX > W - padR) return;
    svgRef.current?.setPointerCapture(e.pointerId);
    setPanStart({ vbX, range: [iLo, iHi] });
    setHover(null);
  }

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const vbX = clientToVbX(e.clientX);
    if (vbX === null) return;
    if (panStart) {
      const [a0, b0] = panStart.range;
      const span = b0 - a0 + 1;
      const delta = -Math.round(((vbX - panStart.vbX) / innerW) * span);
      let a = a0 + delta;
      let b = b0 + delta;
      if (a < 0) {
        b += -a;
        a = 0;
      }
      if (b > N - 1) {
        a -= b - (N - 1);
        b = N - 1;
      }
      if (a < 0) a = 0;
      if (a === 0 && b === N - 1) setRange(null);
      else setRange([a, b]);
      return;
    }
    if (vbX < padL || vbX > W - padR) {
      setHover(null);
      return;
    }
    setHover(vbXToIndex(vbX));
  }

  function onUp(e: React.PointerEvent<SVGSVGElement>) {
    setPanStart(null);
    svgRef.current?.releasePointerCapture?.(e.pointerId);
  }

  React.useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const handler = (e: WheelEvent) => {
      const vbX = clientToVbX(e.clientX);
      if (vbX === null) return;
      if (vbX < padL || vbX > W - padR) return;
      e.preventDefault();
      const a = iLo;
      const b = iHi;
      const span = b - a + 1;
      const cursorIdx = Math.round(a + ((vbX - padL) / innerW) * (span - 1));
      const factor = e.deltaY > 0 ? 1.2 : 1 / 1.2;
      let newSpan = Math.round(span * factor);
      if (newSpan < 10) newSpan = 10;
      if (newSpan > N) newSpan = N;
      const leftFrac = span > 1 ? (cursorIdx - a) / (span - 1) : 0.5;
      let newA = Math.round(cursorIdx - leftFrac * (newSpan - 1));
      let newB = newA + newSpan - 1;
      if (newA < 0) {
        newA = 0;
        newB = newSpan - 1;
      }
      if (newB > N - 1) {
        newB = N - 1;
        newA = newB - newSpan + 1;
      }
      if (newA < 0) newA = 0;
      if (newA === 0 && newB === N - 1) setRange(null);
      else setRange([newA, newB]);
    };
    svg.addEventListener("wheel", handler, { passive: false });
    return () => svg.removeEventListener("wheel", handler);
  }, [iLo, iHi, N, innerW, padL, padR, W]);

  if (N === 0) {
    return (
      <div className="flex h-full items-center justify-center rounded-md bg-card text-[12px] text-muted-foreground ring-1 ring-border">
        No OHLCV bars to render.
      </div>
    );
  }

  const safeHover =
    hover !== null && hover >= 0 && hover < N ? hover : null;
  const hoverBar = safeHover !== null ? bars[safeHover] : null;
  const prevClose =
    safeHover !== null && safeHover > 0 ? bars[safeHover - 1]?.c ?? null : null;
  const tipW = 210;
  const tipLineH = 15;
  const tipHeight = 24 + 6 * tipLineH;

  const hoverX = safeHover !== null ? xAt(safeHover) : 0;
  const tipX =
    hoverX + tipW + 12 > W - padR
      ? hoverX - tipW - 12
      : hoverX + 12;
  const tipY = padT + 8;

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="relative flex-1 overflow-hidden rounded-md bg-card ring-1 ring-border">
        {range && (
          <button
            type="button"
            onClick={() => setRange(null)}
            className="absolute right-3 top-3 z-10 rounded-md bg-foreground/90 px-2.5 py-1 text-[11px] font-medium text-background shadow hover:bg-foreground"
          >
            Reset zoom
          </button>
        )}
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full select-none"
          style={{ cursor: isPanning ? "grabbing" : "crosshair" }}
          role="img"
          aria-label="MarketSmith chart"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerLeave={() => setHover(null)}
          onDoubleClick={() => setRange(null)}
        >
          <defs>
            <clipPath id={`clipP-${clipId}`}>
              <rect x={padL} y={padT} width={innerW} height={priceH} />
            </clipPath>
            <clipPath id={`clipV-${clipId}`}>
              <rect x={padL} y={volTop} width={innerW} height={volH} />
            </clipPath>
          </defs>

          {/* Price grid */}
          {priceTicks.map((t, i) => (
            <g key={`pg${i}`}>
              <line
                x1={padL}
                x2={W - padR}
                y1={yPrice(t)}
                y2={yPrice(t)}
                stroke="currentColor"
                strokeOpacity={0.08}
              />
              <text
                x={W - padR + 6}
                y={yPrice(t) + 3}
                fontSize={10.5}
                fill="currentColor"
                opacity={0.7}
              >
                {fmtPrice(t)}
              </text>
            </g>
          ))}

          {/* Volume grid (three ticks) */}
          {[0.5, 1].map((frac, i) => (
            <g key={`vg${i}`}>
              <line
                x1={padL}
                x2={W - padR}
                y1={yVol(volHi * frac)}
                y2={yVol(volHi * frac)}
                stroke="currentColor"
                strokeOpacity={0.06}
              />
              <text
                x={W - padR + 6}
                y={yVol(volHi * frac) + 3}
                fontSize={10}
                fill="currentColor"
                opacity={0.6}
              >
                {fmtVolume(volHi * frac)}
              </text>
            </g>
          ))}

          {/* Axis frames */}
          <line
            x1={padL}
            x2={W - padR}
            y1={padT + priceH}
            y2={padT + priceH}
            stroke="currentColor"
            strokeOpacity={0.35}
          />
          <line
            x1={padL}
            x2={W - padR}
            y1={volTop + volH}
            y2={volTop + volH}
            stroke="currentColor"
            strokeOpacity={0.35}
          />

          {/* X ticks */}
          {xTickIdx.map((i) => (
            <g key={`x${i}`}>
              <line
                x1={xAt(i)}
                x2={xAt(i)}
                y1={volTop + volH}
                y2={volTop + volH + 4}
                stroke="currentColor"
                strokeOpacity={0.4}
              />
              <text
                x={xAt(i)}
                y={volTop + volH + 16}
                fontSize={10.5}
                textAnchor="middle"
                fill="currentColor"
                opacity={0.75}
              >
                {fmtDateShort(bars[i].t, interval)}
              </text>
            </g>
          ))}

          {/* OHLC bars */}
          <g clipPath={`url(#clipP-${clipId})`}>
            {Array.from({ length: iHi - iLo + 1 }, (_, k) => {
              const i = iLo + k;
              if (i >= N) return null;
              const b = bars[i];
              const x = xAt(i);
              const yH = yPrice(b.h);
              const yL = yPrice(b.l);
              const yO = yPrice(b.o);
              const yC = yPrice(b.c);
              const up = b.c >= b.o;
              const color = up ? "rgb(37 99 235)" : "rgb(220 38 38)";
              return (
                <g key={`bar${i}`}>
                  <line
                    x1={x}
                    x2={x}
                    y1={yH}
                    y2={yL}
                    stroke={color}
                    strokeWidth={barStroke}
                  />
                  <line
                    x1={x - barHalf}
                    x2={x}
                    y1={yO}
                    y2={yO}
                    stroke={color}
                    strokeWidth={barStroke}
                  />
                  <line
                    x1={x}
                    x2={x + barHalf}
                    y1={yC}
                    y2={yC}
                    stroke={color}
                    strokeWidth={barStroke}
                  />
                </g>
              );
            })}
          </g>

          {/* EMAs */}
          <g clipPath={`url(#clipP-${clipId})`}>
            {maPaths.map((p) => (
              <path
                key={`ema-${p.period}`}
                d={p.d}
                fill="none"
                stroke={MA_COLOR[p.period] ?? "rgb(100 116 139)"}
                strokeWidth={1.4}
                strokeOpacity={0.9}
              />
            ))}
          </g>

          {/* EMA legend (top-left, in-chart) */}
          <g>
            {maPaths.map((p, i) => (
              <g key={`legend-${p.period}`} transform={`translate(${padL + i * 78}, ${padT - 10})`}>
                <line
                  x1={0}
                  x2={16}
                  y1={0}
                  y2={0}
                  stroke={MA_COLOR[p.period] ?? "rgb(100 116 139)"}
                  strokeWidth={2}
                />
                <text
                  x={20}
                  y={3}
                  fontSize={10.5}
                  fill="currentColor"
                  opacity={0.75}
                >
                  {interval === "W" ? `${p}-wk EMA` : `${p}-day EMA`}
                </text>
              </g>
            ))}
          </g>

          {/* Volume bars */}
          <g clipPath={`url(#clipV-${clipId})`}>
            {Array.from({ length: iHi - iLo + 1 }, (_, k) => {
              const i = iLo + k;
              if (i >= N) return null;
              const b = bars[i];
              const up = b.c >= b.o;
              const x = xAt(i);
              const y = yVol(b.v);
              const barW = Math.max(1, slotW * 0.7);
              return (
                <rect
                  key={`vol${i}`}
                  x={x - barW / 2}
                  y={y}
                  width={barW}
                  height={volTop + volH - y}
                  fill={up ? "rgb(37 99 235)" : "rgb(220 38 38)"}
                  fillOpacity={0.55}
                />
              );
            })}
          </g>

          {/* Volume avg line */}
          <g clipPath={`url(#clipV-${clipId})`}>
            <path
              d={volPath.join(" ")}
              fill="none"
              stroke="rgb(234 88 12)"
              strokeWidth={1.2}
              strokeOpacity={0.9}
            />
          </g>

          {/* Volume pane label */}
          <text
            x={padL}
            y={volTop - 4}
            fontSize={10}
            fill="currentColor"
            opacity={0.6}
          >
            Volume · {volAvg}-{interval === "W" ? "wk" : "d"} avg
          </text>

          {/* Crosshair */}
          {safeHover !== null && !isPanning && hoverBar && (
            <g pointerEvents="none">
              <line
                x1={hoverX}
                x2={hoverX}
                y1={padT}
                y2={volTop + volH}
                stroke="currentColor"
                strokeOpacity={0.4}
                strokeDasharray="4 3"
              />
              <line
                x1={padL}
                x2={W - padR}
                y1={yPrice(hoverBar.c)}
                y2={yPrice(hoverBar.c)}
                stroke="currentColor"
                strokeOpacity={0.3}
                strokeDasharray="4 3"
              />
              <rect
                x={W - padR}
                y={yPrice(hoverBar.c) - 8}
                width={padR - 2}
                height={16}
                fill="rgb(17 24 39)"
                fillOpacity={0.92}
              />
              <text
                x={W - padR + 6}
                y={yPrice(hoverBar.c) + 3}
                fontSize={10.5}
                fill="white"
                fontWeight={600}
              >
                {fmtPrice(hoverBar.c)}
              </text>

              <rect
                x={tipX}
                y={tipY}
                width={tipW}
                height={tipHeight}
                rx={5}
                fill="rgb(17 24 39)"
                fillOpacity={0.94}
                stroke="rgb(37 99 235)"
                strokeOpacity={0.5}
              />
              <text
                x={tipX + 10}
                y={tipY + 16}
                fontSize={11}
                fontWeight={600}
                fill="white"
              >
                {fmtDateFull(hoverBar.t)}
              </text>
              {(
                [
                  ["O", hoverBar.o],
                  ["H", hoverBar.h],
                  ["L", hoverBar.l],
                  ["C", hoverBar.c],
                ] as const
              ).map(([k, v], i) => (
                <text
                  key={k}
                  x={tipX + 10}
                  y={tipY + 34 + i * tipLineH}
                  fontSize={11}
                  fill="rgb(209 213 219)"
                >
                  <tspan className="text-muted-foreground">{k}: </tspan>
                  <tspan fill="white">{fmtPrice(v)}</tspan>
                  {k === "C" && prevClose !== null && (
                    <tspan
                      fill={
                        hoverBar.c >= prevClose
                          ? "rgb(74 222 128)"
                          : "rgb(248 113 113)"
                      }
                    >
                      {" "}
                      ({((hoverBar.c / prevClose - 1) * 100).toFixed(2)}%)
                    </tspan>
                  )}
                </text>
              ))}
              <text
                x={tipX + 10}
                y={tipY + 34 + 4 * tipLineH}
                fontSize={11}
                fill="rgb(209 213 219)"
              >
                V: <tspan fill="white">{fmtVolume(hoverBar.v)}</tspan>
              </text>
            </g>
          )}
        </svg>
      </div>
    </div>
  );
}
