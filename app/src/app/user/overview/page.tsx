/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import * as React from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from "@/components/ui/chart";
import { AreaChart, Area, CartesianGrid, XAxis, BarChart, Bar } from "recharts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ================= MOCK DATA GENERATION =================
function generateMockData() {
  const now = Math.floor(Date.now() / 1000);
  const records: any[] = [];
  const grants: any[] = [];
  const hospitals = ["HOSP_A", "HOSP_B", "HOSP_C", "HOSP_D"];

  // --- RECORDS: Sparse realistic dataset (100–200 over a year) ---
  const start = now - 365 * 24 * 3600;
  const totalRecords = Math.floor(80 + Math.random() * 120);
  for (let i = 0; i < totalRecords; i++) {
    const offset = Math.random() * 365 * 24 * 3600;
    records.push({ createdAt: start + offset });
  }

  // --- GRANTS: Dynamic pattern with revokes ---
  const gStart = now - 90 * 24 * 3600;
  for (let day = 0; day < 90; day++) {
    const ts = gStart + day * 24 * 3600;
    const readCount = Math.round(1 + Math.sin(day / 7) * 2 + Math.random() * 1);
    const writeCount = Math.round(
      1 + Math.cos(day / 9) * 2 + Math.random() * 1
    );
    const revokedCount = Math.round(
      Math.max(0, Math.sin(day / 12) + Math.random())
    );

    for (let i = 0; i < readCount; i++) {
      grants.push({
        createdAt: ts,
        revoked: false,
        scope: 1,
        hospital: hospitals[Math.floor(Math.random() * hospitals.length)],
      });
    }
    for (let i = 0; i < writeCount; i++) {
      grants.push({
        createdAt: ts,
        revoked: false,
        scope: 2,
        hospital: hospitals[Math.floor(Math.random() * hospitals.length)],
      });
    }
    for (let i = 0; i < revokedCount; i++) {
      grants.push({
        createdAt: ts,
        revoked: true,
        scope: Math.random() > 0.5 ? 1 : 2,
        hospital: hospitals[Math.floor(Math.random() * hospitals.length)],
      });
    }
  }

  return { records, grants };
}

// ================= COMPONENT =================
export default function UserOverviewPage() {
  const [records, setRecords] = React.useState<any[]>([]);
  const [grants, setGrants] = React.useState<any[]>([]);
  const [recordRange, setRecordRange] = React.useState("30d");
  const [grantRange, setGrantRange] = React.useState("30d");

  React.useEffect(() => {
    const { records, grants } = generateMockData();
    setRecords(records);
    setGrants(grants);
  }, []);

  // === METRICS ===
  const totalRecords = records.length;
  const activeRead = grants.filter((g) => g.scope === 1 && !g.revoked).length;
  const activeWrite = grants.filter((g) => g.scope === 2 && !g.revoked).length;
  const totalHospitals = new Set(grants.map((g) => g.hospital)).size;

  // === RANGE FILTER HELPERS ===
  const rangeToDays = (range: string): number | null => {
    switch (range) {
      case "7d":
        return 7;
      case "30d":
        return 30;
      case "90d":
        return 90;
      case "365d":
        return 365;
      case "all":
        return null;
      default:
        return 30;
    }
  };

  // --- Filtered datasets ---
  const recordDays = rangeToDays(recordRange);
  const grantDays = rangeToDays(grantRange);

  const recordCutoff = recordDays
    ? Date.now() / 1000 - recordDays * 24 * 3600
    : 0;
  const grantCutoff = grantDays ? Date.now() / 1000 - grantDays * 24 * 3600 : 0;

  const filteredRecords = recordDays
    ? records.filter((r) => r.createdAt >= recordCutoff)
    : records;

  const filteredGrants = grantDays
    ? grants.filter((g) => g.createdAt >= grantCutoff)
    : grants;

  // === RECORD BAR CHART ===
  const recordChartData = React.useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of filteredRecords) {
      const d = new Date(r.createdAt * 1000).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
      map[d] = (map[d] || 0) + 1;
    }
    return Object.entries(map).map(([date, count]) => ({ date, count }));
  }, [filteredRecords]);

  // === GRANT AREA CHART ===
  const grantChartData = React.useMemo(() => {
    const map: Record<
      string,
      { read: number; write: number; revoked: number }
    > = {};
    for (const g of filteredGrants) {
      const d = new Date(g.createdAt * 1000).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
      if (!map[d]) map[d] = { read: 0, write: 0, revoked: 0 };
      if (g.revoked) map[d].revoked++;
      else if (g.scope === 1) map[d].read++;
      else if (g.scope === 2) map[d].write++;
    }
    return Object.entries(map).map(([date, val]) => ({ date, ...val }));
  }, [filteredGrants]);

  return (
    <main className="space-y-8 my-5">
      {/* === HEADER === */}
      <header>
        <h1 className="text-2xl font-bold">Your CareChain Activity</h1>
        <p className="text-sm text-muted-foreground">
          Mock data preview of patient-side analytics
        </p>
      </header>

      {/* === METRICS === */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard title="Total Records Owned" value={totalRecords} />
        <MetricCard title="Hospitals Connected" value={totalHospitals} />
        <MetricCard title="Active Read Grants" value={activeRead} />
        <MetricCard title="Active Write Grants" value={activeWrite} />
      </section>

      {/* === CHARTS === */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Records per Day */}
        <ChartCard
          title="Record Upload History"
          desc="Number of records created per day"
          timeRange={recordRange}
          setTimeRange={setRecordRange}
          type="bar"
          data={recordChartData}
          config={{
            count: { label: "Records", color: "var(--chart-1)" },
          }}
          extraRanges={["365d", "all"]}
        />

        {/* Grant Breakdown */}
        <ChartCard
          title="Grant Access Breakdown"
          desc="Read, write, and revoked grant counts"
          timeRange={grantRange}
          setTimeRange={setGrantRange}
          type="area"
          data={grantChartData}
          config={{
            read: { label: "Read Grants", color: "var(--chart-2)" },
            write: { label: "Write Grants", color: "var(--chart-3)" },
            revoked: { label: "Revoked Grants", color: "var(--chart-4)" },
          }}
        />
      </section>
    </main>
  );
}

// === METRIC CARD ===
function MetricCard({
  title,
  value,
}: {
  title: string;
  value: number | string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="text-2xl font-bold">{value}</CardContent>
    </Card>
  );
}

// === CHART CARD ===
function ChartCard({
  title,
  desc,
  timeRange,
  setTimeRange,
  data,
  config,
  type = "bar",
  extraRanges = [],
}: {
  title: string;
  desc: string;
  timeRange: string;
  setTimeRange: (v: string) => void;
  data: any[];
  config: Record<string, { label: string; color: string }>;
  type?: "bar" | "area";
  extraRanges?: string[];
}) {
  return (
    <Card>
      <CardHeader className="flex justify-between border-b py-5">
        <div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{desc}</CardDescription>
        </div>
        <Select value={timeRange} onValueChange={setTimeRange}>
          <SelectTrigger className="w-[130px] text-xs">
            <SelectValue placeholder="Range" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
            <SelectItem value="90d">Last 90 days</SelectItem>
            {extraRanges.includes("365d") && (
              <SelectItem value="365d">Last 365 days</SelectItem>
            )}
            {extraRanges.includes("all") && (
              <SelectItem value="all">All Time</SelectItem>
            )}
          </SelectContent>
        </Select>
      </CardHeader>

      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        {data.length === 0 ? (
          <div className="flex items-center justify-center h-[250px] text-sm text-muted-foreground">
            No data for selected range
          </div>
        ) : type === "bar" ? (
          <ChartContainer
            config={config}
            className="aspect-auto h-[250px] w-full"
          >
            <BarChart data={data}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="date" tickLine={false} axisLine={false} />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={(val) => val}
                    formatter={(value, name) => [
                      `${value}`,
                      config[name]?.label || name,
                    ]}
                  />
                }
              />
              <Bar
                dataKey="count"
                fill="var(--chart-1)"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ChartContainer>
        ) : (
          <ChartContainer
            config={config}
            className="aspect-auto h-[250px] w-full"
          >
            <AreaChart data={data}>
              <defs>
                {Object.entries(config).map(([key, c]) => (
                  <linearGradient
                    key={key}
                    id={`fill-${key}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="5%" stopColor={c.color} stopOpacity={0.8} />
                    <stop offset="95%" stopColor={c.color} stopOpacity={0.1} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="date" tickLine={false} axisLine={false} />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    indicator="dot"
                    labelFormatter={(val) => val}
                    formatter={(value, name) => [
                      `${value}`,
                      config[name]?.label || name,
                    ]}
                  />
                }
              />
              {Object.entries(config).map(([key, c]) => (
                <Area
                  key={key}
                  dataKey={key}
                  type="natural"
                  fill={`url(#fill-${key})`}
                  stroke={c.color}
                  strokeWidth={2}
                  activeDot={{ r: 3 }}
                />
              ))}
              <ChartLegend content={<ChartLegendContent />} />
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
