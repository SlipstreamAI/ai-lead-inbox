"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { LeadRecord, Tier } from "@/lib/lead-logic";
import { formatSla, formatWhen, tierStyle } from "@/lib/view";
import Link from "next/link";
import { Button } from "@/components/ui/button";

const filters: { id: "all" | Tier; label: string }[] = [
  { id: "all", label: "All" },
  { id: "hot", label: "Hot" },
  { id: "warm", label: "Warm" },
  { id: "cold", label: "Cold" },
  { id: "disqualified", label: "Review" },
];

export function InboxBoard({ leads }: { leads: LeadRecord[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState<(typeof filters)[number]["id"]>("all");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const counts = useMemo(() => {
    return {
      all: leads.length,
      hot: leads.filter((lead) => lead.tier === "hot").length,
      warm: leads.filter((lead) => lead.tier === "warm").length,
      cold: leads.filter((lead) => lead.tier === "cold").length,
      disqualified: leads.filter((lead) => lead.tier === "disqualified").length,
    };
  }, [leads]);

  const visible = filter === "all" ? leads : leads.filter((lead) => lead.tier === filter);

  async function fileSamples() {
    setPending(true);
    setError("");
    const response = await fetch("/api/samples", { method: "POST" });
    const data = await response.json();
    setPending(false);
    if (!response.ok || data.ok === false) {
      setError(data.errors?.llm || "The sample run did not finish.");
      return;
    }
    router.refresh();
  }

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] tracking-[0.18em] text-muted-foreground uppercase">CRM inbox</p>
          <h1 className="mt-1 font-heading text-4xl tracking-tight text-balance">Leads the autopilot already filed</h1>
        </div>
        <Button
          type="button"
          variant="outline"
          className="h-10 bg-card px-3"
          disabled={pending}
          onClick={fileSamples}
        >
          {pending ? "Filing samples…" : "File the four sample leads"}
        </Button>
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(
          [
            ["Hot", counts.hot, "Avery, 15 min"],
            ["Warm", counts.warm, "Jordan, 4 hours"],
            ["Cold", counts.cold, "Nurture digest"],
            ["Review", counts.disqualified, "Held back"],
          ] as const
        ).map(([label, count, note]) => (
          <div key={label} className="rounded-lg border border-border bg-card px-4 py-3">
            <dt className="text-xs tracking-wide text-muted-foreground uppercase">{label}</dt>
            <dd className="mt-1 font-heading text-3xl tabular-nums">{count}</dd>
            <p className="text-xs text-muted-foreground">{note}</p>
          </div>
        ))}
      </dl>

      {error ? (
        <p className="mt-4 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-2" role="tablist" aria-label="Filter by tier">
        {filters.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={filter === item.id}
            onClick={() => setFilter(item.id)}
            className={`rounded-full border px-3 py-1.5 text-sm ${
              filter === item.id ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card"
            }`}
          >
            {item.label}
            <span className="ml-2 tabular-nums opacity-80">{counts[item.id]}</span>
          </button>
        ))}
      </div>

      {leads.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-border bg-card/70 px-6 py-14 text-center">
          <p className="font-heading text-2xl">The inbox is empty.</p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
            Submit a lead on the intake form, or file the four samples. Each one is scored, drafted, and posted to the
            alert inbox without an API key.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <Link href="/" className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground">
              Open the intake form
            </Link>
          </div>
        </div>
      ) : visible.length === 0 ? (
        <p className="mt-6 rounded-lg border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
          Nothing in this tier yet.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {visible.map((lead) => {
            const style = tierStyle[lead.tier];
            return (
              <li key={lead.id}>
                <Link href={`/inbox/${lead.id}`} className="grid gap-3 px-4 py-4 hover:bg-secondary/60 md:grid-cols-[88px_1fr_auto] md:items-center">
                  <span className={`w-fit rounded-full px-2.5 py-1 text-xs font-medium ${style.chip}`}>{style.label}</span>
                  <span>
                    <span className="block font-medium">
                      {lead.name}{" "}
                      <span className="font-normal text-muted-foreground">· {lead.company}</span>
                    </span>
                    <span className="mt-0.5 block text-sm text-muted-foreground">
                      {lead.owner} · {lead.channel} · {formatSla(lead.slaMinutes)}
                    </span>
                  </span>
                  <span className="flex items-baseline gap-4 md:text-right">
                    <span className="font-heading text-3xl tabular-nums">{lead.score}</span>
                    <span className="text-xs text-muted-foreground">{formatWhen(lead.createdAt)} UTC</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
