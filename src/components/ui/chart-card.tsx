'use client';

import {ArrowUpRight} from 'lucide-react';
import {useId, type ReactNode} from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis
} from 'recharts';

import {Card} from './surfaces';

const chartData = [
  {label: 'Mon', value: 34},
  {label: 'Tue', value: 48},
  {label: 'Wed', value: 41},
  {label: 'Thu', value: 67},
  {label: 'Fri', value: 58},
  {label: 'Sat', value: 84},
  {label: 'Sun', value: 76}
];

export function ChartCard({
  title = 'Revenue pulse',
  value = '$28,420',
  change = '+18.4%',
  data = chartData
}: {
  title?: string;
  value?: string;
  change?: string;
  data?: Array<{label: string; value: number}>;
}) {
  const gradientId = `chart-${useId().replaceAll(':', '')}`;
  return (
    <Card className="ui-chart-card">
      <div className="ui-chart-header">
        <div>
          <span>{title}</span>
          <strong>{value}</strong>
        </div>
        <BadgeDelta>{change}</BadgeDelta>
      </div>
      <div className="ui-chart" aria-label={`${title}: ${value}`}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{top: 8, right: 8, bottom: 0, left: 8}}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.42} />
                <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              tick={{fill: 'var(--text-muted)', fontSize: 11}}
            />
            <ChartTooltip
              content={<ChartTooltipContent />}
              cursor={{stroke: 'var(--accent)', strokeDasharray: '4 4'}}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="var(--accent)"
              strokeWidth={2.5}
              fill={`url(#${gradientId})`}
              animationDuration={350}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function ChartTooltipContent({
  active,
  payload,
  label
}: {
  active?: boolean;
  payload?: Array<{value?: number}>;
  label?: string;
}) {
  if (!active || !payload?.[0]) return null;
  return (
    <div className="ui-chart-tooltip">
      <span>{label}</span>
      <strong>{payload[0].value?.toLocaleString()}</strong>
    </div>
  );
}

function BadgeDelta({children}: {children: ReactNode}) {
  return (
    <span className="ui-chart-delta">
      <ArrowUpRight aria-hidden="true" />
      {children}
    </span>
  );
}
