"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
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
  const records = [];
  const grants = [];
  const patientIds = ["p1", "p2", "p3", "p4"];

  // --- RECORDS with polynomial-like daily pattern ---
  const start = now - 90 * 24 * 3600;
  for (let day = 0; day < 90; day++) {
    const ts = start + day * 24 * 3600;

    // cubic + sine + cosine = smooth realistic peaks
    const t = day / 90;
    const poly =
      60 * Math.pow(t - 0.5, 2) * (1 - t) +
      15 * Math.sin(day / 8) +
      8 * Math.cos(day / 5);
    const uploadsToday = Math.max(0, Math.round(15 + poly + Math.random() * 5));

    for (let i = 0; i < uploadsToday; i++) {
      records.push({
        createdAt: ts + Math.random() * 86400,
        patient: patientIds[Math.floor(Math.random() * patientIds.length)],
      });
    }
  }

  // --- GRANTS with heavy polynomial & random reversals ---
  const gstart = now - 60 * 24 * 3600;
  for (let day = 0; day < 60; day++) {
    const ts = gstart + day * 24 * 3600;

    // strong polynomial wave variation
    const t = day / 60;
    const curve =
      160 * Math.pow(t - 0.5, 3) -
      100 * Math.pow(t - 0.3, 2) +
      25 * Math.sin(day / 4) +
      15 * Math.cos(day / 9);
    const writeCount = Math.max(
      0,
      Math.round(20 + curve / 10 + Math.sin(day / 3) * 4)
    );
    const readCount = Math.max(
      0,
      Math.round(12 + curve / 15 + Math.cos(day / 4) * 3)
    );

    // Add grants
    for (let i = 0; i < writeCount; i++) {
      grants.push({
        createdAt: ts,
        revoked: false,
        scope: 2,
        patient: patientIds[Math.floor(Math.random() * patientIds.length)],
      });
    }
    for (let i = 0; i < readCount; i++) {
      grants.push({
        createdAt: ts,
        revoked: false,
        scope: 1,
        patient: patientIds[Math.floor(Math.random() * patientIds.length)],
      });
    }

    // Random revoke events
    const revokeEvents = Math.round(
      Math.max(0, Math.sin(day / 5) * 3 + Math.random() * 3)
    );
    for (let i = 0; i < revokeEvents; i++) {
      grants.push({
        createdAt: ts,
        revoked: true,
        scope: Math.random() > 0.5 ? 2 : 1,
        patient: patientIds[Math.floor(Math.random() * patientIds.length)],
      });
    }
  }

  return { records, grants };
}

// ================= MAIN PAGE =================
export default function Page() {
  const [records, setRecords] = React.useState<any[]>([]);
  const [grants, setGrants] = React.useState<any[]>([]);
  const [recordTimeRange, setRecordTimeRange] = React.useState("30d");
  const [grantTimeRange, setGrantTimeRange] = React.useState("30d");

  React.useEffect(() => {
    const { records, grants } = generateMockData();
    setRecords(records);
    setGrants(grants);
  }, []);

  // ─── METRICS ─────────────────────────────
  const totalRecords = records.length;
  const uniquePatients = new Set(records.map((r) => r.patient)).size;
  const activeWriteGrants = grants.filter(
    (g) => g.scope === 2 && !g.revoked
  ).length;
  const totalGrants = grants.length;

  // ─── RANGE FILTERS ───────────────────────
  const rangeToDays = (r: string) =>
    r === "7d"
      ? 7
      : r === "30d"
      ? 30
      : r === "90d"
      ? 90
      : r === "365d"
      ? 365
      : 99999;

  const now = Date.now() / 1000;
  const recordCutoff =
    recordTimeRange === "all" ? 0 : now - rangeToDays(recordTimeRange) * 86400;
  const grantCutoff =
    grantTimeRange === "all" ? 0 : now - rangeToDays(grantTimeRange) * 86400;

  const filteredRecords = records.filter((r) => r.createdAt >= recordCutoff);
  const filteredGrants = grants.filter((g) => g.createdAt >= grantCutoff);

  // ─── RECORD BAR CHART DATA ───────────────
  const recordChartData = React.useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of filteredRecords) {
      const date = new Date(r.createdAt * 1000).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
      map[date] = (map[date] || 0) + 1;
    }

    const sorted = Object.entries(map).sort(
      (a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime()
    );
    return sorted.map(([date, count]) => ({ date, count }));
  }, [filteredRecords]);

  // ─── GRANT AREA CHART DATA ───────────────
  const grantChartData = React.useMemo(() => {
    const map: Record<
      string,
      {
        writeAdd: number;
        writeRevoke: number;
        readAdd: number;
        readRevoke: number;
      }
    > = {};

    for (const g of filteredGrants) {
      const date = new Date(g.createdAt * 1000).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
      if (!map[date])
        map[date] = { writeAdd: 0, writeRevoke: 0, readAdd: 0, readRevoke: 0 };

      if (g.scope === 2) {
        if (g.revoked) map[date].writeRevoke++;
        else map[date].writeAdd++;
      } else if (g.scope === 1) {
        if (g.revoked) map[date].readRevoke++;
        else map[date].readAdd++;
      }
    }

    const sortedDates = Object.keys(map).sort(
      (a, b) => new Date(a).getTime() - new Date(b).getTime()
    );

    const totals: {
      date: string;
      writeTotal: number;
      readTotal: number;
      totalActive: number;
    }[] = [];

    let write = 0;
    let read = 0;

    for (const d of sortedDates) {
      const ev = map[d];
      write += ev.writeAdd - ev.writeRevoke;
      read += ev.readAdd - ev.readRevoke;

      // smoother variation (simulate polynomial drift)
      const modifier = Math.sin(new Date(d).getDate() / 3) * 2;
      totals.push({
        date: d,
        writeTotal: Math.max(0, Math.round(write + modifier)),
        readTotal: Math.max(0, Math.round(read - modifier / 2)),
        totalActive: Math.max(0, Math.round(write + read)),
      });
    }
    return totals;
  }, [filteredGrants]);

  // ─── UI ──────────────────────────────────
  return (
    <main className="space-y-8 my-8">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Hospital Overview</h1>
        <p className="text-sm text-muted-foreground">
          Realistic polynomial mock analytics (Bar + Area combined)
        </p>
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard title="Total Records Uploaded" value={totalRecords} />
        <MetricCard title="Unique Patients Served" value={uniquePatients} />
        <MetricCard title="Active Write Grants" value={activeWriteGrants} />
        <MetricCard title="Total Grants" value={totalGrants} />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* --- Record Upload BarChart --- */}
        <ChartCard
          title="Record Uploads per Day"
          desc="Daily uploaded records (polynomial variation)"
          timeRange={recordTimeRange}
          setTimeRange={setRecordTimeRange}
          data={recordChartData}
          chartType="bar"
          strokeColor="var(--chart-1)"
        />

        {/* --- Grant AreaChart --- */}
        <ChartCard
          title="Grant Activity Overview"
          desc="Active read/write grants over time"
          timeRange={grantTimeRange}
          setTimeRange={setGrantTimeRange}
          data={grantChartData}
          multiSeries={[
            {
              key: "writeTotal",
              label: "Write Grants",
              color: "var(--chart-2)",
            },
            { key: "readTotal", label: "Read Grants", color: "var(--chart-3)" },
            {
              key: "totalActive",
              label: "Total Active",
              color: "var(--chart-1)",
            },
          ]}
        />
      </section>
    </main>
  );
}

// ─── METRIC CARD ───────────────────────────
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

// ─── CHART CARD ────────────────────────────
function ChartCard({
  title,
  desc,
  data,
  dataKey,
  strokeColor,
  multiSeries,
  timeRange,
  setTimeRange,
  chartType = "area",
}: {
  title: string;
  desc: string;
  data: any[];
  dataKey?: string;
  gradientId?: string;
  strokeColor?: string;
  multiSeries?: { key: string; label: string; color: string }[];
  timeRange?: string;
  setTimeRange?: (v: string) => void;
  chartType?: "area" | "bar";
}) {
  const chartConfig = multiSeries
    ? multiSeries.reduce((acc, s) => {
        acc[s.key] = { label: s.label, color: s.color };
        return acc;
      }, {} as any)
    : { [dataKey ?? "value"]: { label: title, color: strokeColor } };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between border-b py-5">
        <div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{desc}</CardDescription>
        </div>
        {setTimeRange && (
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-[130px] text-xs">
              <SelectValue placeholder="Range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
              <SelectItem value="365d">Last 365 days</SelectItem>
              <SelectItem value="all">All time</SelectItem>
            </SelectContent>
          </Select>
        )}
      </CardHeader>

      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        {data.length === 0 ? (
          <div className="flex items-center justify-center h-[250px] text-sm text-muted-foreground">
            No data for selected range
          </div>
        ) : chartType === "bar" ? (
          <ChartContainer
            config={chartConfig}
            className="aspect-auto h-[250px] w-full"
          >
            <BarChart
              data={data}
              margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11 }}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={(l) => `📅 ${l}`}
                    formatter={(v, n) => [`${v}`, chartConfig[n]?.label || n]}
                  />
                }
              />
              <Bar dataKey="count" fill={strokeColor} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartContainer>
        ) : (
          <ChartContainer
            config={chartConfig}
            className="aspect-auto h-[250px] w-full"
          >
            <AreaChart
              data={data}
              margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
            >
              <defs>
                {multiSeries?.map((s) => (
                  <linearGradient
                    key={s.key}
                    id={`fill-${s.key}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="5%" stopColor={s.color} stopOpacity={0.8} />
                    <stop offset="95%" stopColor={s.color} stopOpacity={0.05} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11 }}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    indicator="dot"
                    labelFormatter={(l) => `📅 ${l}`}
                    formatter={(v, n) => [`${v}`, chartConfig[n]?.label || n]}
                  />
                }
              />
              {multiSeries?.map((s) => (
                <Area
                  key={s.key}
                  dataKey={s.key}
                  type="monotone"
                  fill={`url(#fill-${s.key})`}
                  stroke={s.color}
                  strokeWidth={2}
                  activeDot={{ r: 4 }}
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
