import React, { useMemo } from "react";

type MiniSparklineProps = {
  data: number[];
  width?: number;
  height?: number;
  stroke?: string;
  fill?: string;
  threshold?: number;
};

const defaultWidth = 140;
const defaultHeight = 48;

const MiniSparkline: React.FC<MiniSparklineProps> = ({
  data,
  width = defaultWidth,
  height = defaultHeight,
  stroke = "#2563eb",
  fill = "rgba(37,99,235,0.12)",
  threshold,
}) => {
  const { points, thresholdY } = useMemo(() => {
    if (!data.length) return { points: [], thresholdY: undefined as number | undefined };

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max === min ? 1 : max - min;

    const computedPoints = data.map((value, index) => {
      const x = (index / Math.max(data.length - 1, 1)) * width;
      const y = height - ((value - min) / range) * height;
      return [x, y];
    });

    const scaledThreshold =
      threshold === undefined
        ? undefined
        : height - ((threshold - min) / range) * height;

    return { points: computedPoints, thresholdY: scaledThreshold };
  }, [data, height, width, threshold]);

  if (!points.length) {
    return <div className="text-xs text-gray-500">Keine Daten</div>;
  }

  const path = points.map(([x, y], idx) => `${idx === 0 ? "M" : "L"}${x},${y}`).join(" ");

  const areaPath = `${path} L${width},${height} L0,${height} Z`;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img">
      {thresholdY !== undefined && (
        <line
          x1={0}
          x2={width}
          y1={thresholdY}
          y2={thresholdY}
          stroke="#f97316"
          strokeDasharray="4 4"
          strokeWidth={1}
        />
      )}
      <path d={areaPath} fill={fill} stroke="none" />
      <path d={path} fill="none" stroke={stroke} strokeWidth={2} strokeLinecap="round" />
    </svg>
  );
};

export default MiniSparkline;
