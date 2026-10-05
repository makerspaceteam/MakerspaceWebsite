// Small chart primitives shared across admin pages/dashboards.

import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";

export function StatCard({ label, value, icon: Icon, bg, iconColor, to }) {
  return (
    <Link
      to={to}
      className="group bg-white rounded-xl border border-border p-5 hover:border-border hover:shadow-sm transition-all"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</p>
          <p className="mt-2 truncate text-2xl font-bold text-foreground" title={String(value)}>{value}</p>
        </div>
        <div className={`shrink-0 p-2 rounded-lg ${bg}`}>
          <Icon className={`h-5 w-5 ${iconColor}`} />
        </div>
      </div>
      <p className="mt-4 text-xs text-muted-foreground flex items-center gap-1 group-hover:text-muted-foreground transition-colors">
        Manage <ArrowUpRight className="h-3 w-3" />
      </p>
    </Link>
  );
}

export function ChartCard({ title, subtitle, action, children }) {
  return (
    <div className="bg-white rounded-xl border border-border">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

export function LegendDot({ color, label }) {
  return (
    <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

export function HBar({ label, value, maxValue, color, suffix = "" }) {
  const pct = maxValue > 0 ? Math.round((value / maxValue) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-foreground truncate flex-1 min-w-0 pr-2">{label}</span>
        <span className="text-xs font-semibold tabular-nums shrink-0" style={{ color }}>
          {value}{suffix}
        </span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}
