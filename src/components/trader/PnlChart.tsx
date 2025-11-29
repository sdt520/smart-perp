import { useMemo, useState } from 'react';

interface PnlDataPoint {
  date: string;
  pnl: number;
  cumulativePnl: number;
}

interface PnlChartProps {
  data: PnlDataPoint[];
}

type TimeRange = '7d' | '30d' | 'all';

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}

function formatPnL(value: number): string {
  const absValue = Math.abs(value);
  if (absValue >= 1000000000) {
    return `$${(value / 1000000000).toFixed(1)}B`;
  } else if (absValue >= 1000000) {
    return `$${(value / 1000000).toFixed(1)}M`;
  } else if (absValue >= 1000) {
    return `$${(value / 1000).toFixed(0)}K`;
  }
  return `$${value.toFixed(0)}`;
}

export function PnlChart({ data }: PnlChartProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>('30d');
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);


  const filteredData = useMemo(() => {
    if (timeRange === 'all') return data;
    const days = timeRange === '7d' ? 7 : 30;
    return data.slice(-days);
  }, [data, timeRange]);

  const chartData = useMemo(() => {
    if (filteredData.length === 0) return null;

    const values = filteredData.map(d => d.cumulativePnl);
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const range = maxValue - minValue || 1;
    const padding = range * 0.1;

    const chartMin = minValue - padding;
    const chartMax = maxValue + padding;
    const chartRange = chartMax - chartMin;

    const width = 100;
    const height = 100;

    const points = filteredData.map((d, i) => {
      const x = (i / (filteredData.length - 1 || 1)) * width;
      const y = height - ((d.cumulativePnl - chartMin) / chartRange) * height;
      return { x, y, data: d };
    });

    // Create smooth path
    const pathD = points.reduce((acc, point, i) => {
      if (i === 0) return `M ${point.x} ${point.y}`;
      return `${acc} L ${point.x} ${point.y}`;
    }, '');

    // Create gradient fill path
    const fillD = `${pathD} L ${width} ${height} L 0 ${height} Z`;

    const isPositive = filteredData[filteredData.length - 1]?.cumulativePnl >= 0;

    return {
      points,
      pathD,
      fillD,
      minValue: chartMin,
      maxValue: chartMax,
      isPositive,
    };
  }, [filteredData]);

  const timeRanges: { id: TimeRange; label: string }[] = [
    { id: '7d', label: '7D' },
    { id: '30d', label: '30D' },
    { id: 'all', label: '全部' },
  ];

  if (!chartData || filteredData.length === 0) {
    return (
      <div className="glass-card rounded-2xl p-6 flex items-center justify-center">
        <p className="text-[var(--color-text-muted)]">暂无收益数据</p>
      </div>
    );
  }

  const hoveredPoint = hoveredIndex !== null ? chartData.points[hoveredIndex] : null;

  return (
    <div className="glass-card rounded-2xl p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h3 className="text-base font-medium text-[var(--color-text-primary)]">收益曲线</h3>
        </div>
        <div className="flex items-center gap-1">
          {timeRanges.map((range) => (
            <button
              key={range.id}
              onClick={() => setTimeRange(range.id)}
              className={`
                px-3 py-1.5 text-xs rounded-lg transition-colors
                ${timeRange === range.id 
                  ? 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)]' 
                  : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
                }
              `}
            >
              {range.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tooltip */}
      <div className="h-6 mb-2">
        {hoveredPoint ? (
          <div className="flex items-center gap-4 text-sm">
            <span className="text-[var(--color-text-muted)]">
              {formatDate(hoveredPoint.data.date)}
            </span>
            <span className={`font-mono ${
              hoveredPoint.data.cumulativePnl >= 0 
                ? 'text-[var(--color-accent-primary)]' 
                : 'text-[var(--color-accent-negative)]'
            }`}>
              累计: {formatPnL(hoveredPoint.data.cumulativePnl)}
            </span>
            <span className={`font-mono ${
              hoveredPoint.data.pnl >= 0 
                ? 'text-[var(--color-accent-primary)]' 
                : 'text-[var(--color-accent-negative)]'
            }`}>
              当日: {hoveredPoint.data.pnl >= 0 ? '+' : ''}{formatPnL(hoveredPoint.data.pnl)}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-4 text-sm">
            <span className="text-[var(--color-text-muted)]">
              {formatDate(filteredData[filteredData.length - 1].date)}
            </span>
            <span className={`font-mono font-medium ${
              chartData.isPositive 
                ? 'text-[var(--color-accent-primary)]' 
                : 'text-[var(--color-accent-negative)]'
            }`}>
              {formatPnL(filteredData[filteredData.length - 1].cumulativePnl)}
            </span>
          </div>
        )}
      </div>

      {/* Chart */}
      <div className="relative h-48">
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="w-full h-full"
          onMouseLeave={() => setHoveredIndex(null)}
        >
          {/* Gradient definition */}
          <defs>
            <linearGradient id="chartGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop 
                offset="0%" 
                stopColor={chartData.isPositive ? 'rgb(16, 185, 129)' : 'rgb(239, 68, 68)'} 
                stopOpacity="0.2" 
              />
              <stop 
                offset="100%" 
                stopColor={chartData.isPositive ? 'rgb(16, 185, 129)' : 'rgb(239, 68, 68)'} 
                stopOpacity="0" 
              />
            </linearGradient>
          </defs>

          {/* Zero line */}
          {chartData.minValue < 0 && chartData.maxValue > 0 && (
            <line
              x1="0"
              y1={100 - ((0 - chartData.minValue) / (chartData.maxValue - chartData.minValue)) * 100}
              x2="100"
              y2={100 - ((0 - chartData.minValue) / (chartData.maxValue - chartData.minValue)) * 100}
              stroke="var(--color-border)"
              strokeWidth="0.3"
              strokeDasharray="2,2"
            />
          )}

          {/* Fill area */}
          <path
            d={chartData.fillD}
            fill="url(#chartGradient)"
          />

          {/* Line */}
          <path
            d={chartData.pathD}
            fill="none"
            stroke={chartData.isPositive ? 'rgb(16, 185, 129)' : 'rgb(239, 68, 68)'}
            strokeWidth="0.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Interactive areas */}
          {chartData.points.map((point, i) => (
            <rect
              key={i}
              x={point.x - (100 / filteredData.length / 2)}
              y="0"
              width={100 / filteredData.length}
              height="100"
              fill="transparent"
              onMouseEnter={() => setHoveredIndex(i)}
              style={{ cursor: 'crosshair' }}
            />
          ))}

          {/* Hover point */}
          {hoveredPoint && (
            <>
              <line
                x1={hoveredPoint.x}
                y1="0"
                x2={hoveredPoint.x}
                y2="100"
                stroke="var(--color-border-active)"
                strokeWidth="0.3"
              />
              <circle
                cx={hoveredPoint.x}
                cy={hoveredPoint.y}
                r="1.5"
                fill={chartData.isPositive ? 'rgb(16, 185, 129)' : 'rgb(239, 68, 68)'}
              />
            </>
          )}
        </svg>

        {/* Y-axis labels */}
        <div className="absolute left-0 top-0 bottom-0 w-12 flex flex-col justify-between text-right pr-2 pointer-events-none">
          <span className="text-[10px] text-[var(--color-text-muted)]">
            {formatPnL(chartData.maxValue)}
          </span>
          <span className="text-[10px] text-[var(--color-text-muted)]">
            {formatPnL(chartData.minValue)}
          </span>
        </div>
      </div>

      {/* X-axis labels */}
      <div className="flex justify-between mt-2 text-[10px] text-[var(--color-text-muted)]">
        <span>{formatDate(filteredData[0].date)}</span>
        <span>{formatDate(filteredData[filteredData.length - 1].date)}</span>
      </div>
    </div>
  );
}

