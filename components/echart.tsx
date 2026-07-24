"use client";

import { useEffect, useRef } from "react";
import type { EChartsOption } from "echarts";

export function EChart({
  option,
  height = 300,
  ariaLabel,
  onClick,
}: {
  option: EChartsOption;
  height?: number;
  ariaLabel: string;
  onClick?: (data: unknown) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let chart: import("echarts").ECharts | undefined;
    let observer: ResizeObserver | undefined;
    let disposed = false;
    void import("echarts").then((echarts) => {
      if (!ref.current || disposed) return;
      chart = echarts.init(ref.current, undefined, { renderer: "canvas" });
      chart.setOption(option);
      if (onClick) chart.on("click", onClick);
      observer = new ResizeObserver(() => chart?.resize());
      observer.observe(ref.current);
    });
    return () => {
      disposed = true;
      observer?.disconnect();
      chart?.dispose();
    };
  }, [option, onClick]);

  return <div ref={ref} style={{ height }} role="img" aria-label={ariaLabel} />;
}
