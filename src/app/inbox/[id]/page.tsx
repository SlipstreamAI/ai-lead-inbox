import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { SiteHeader } from "@/components/site-header";
import { getAlertForLead, getLead } from "@/lib/crm";
import { BREAKDOWN_META, TIER_LABELS } from "@/lib/lead-logic";
import { formatSla, formatWhen, sentence, tierStyle, timelineLabel } from "@/lib/view";

export const metadata = {
  title: "Lead · Northline lead autopilot",
};

export default function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <>
      <SiteHeader />
      <Suspense fallback={<main className="mx-auto max-w-6xl px-5 py-16 text-sm text-muted-foreground md:px-8">Opening the lead…</main>}>
        <LeadDetail params={params} />
      </Suspense>
    </>
  );
}

async function LeadDetail({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const lead = await getLead(id);
  if (!lead) {
    return (
      <main className="mx-auto max-w-3xl px-5 py-20 md:px-8">
        <p className="text-[11px] tracking-[0.18em] text-muted-foreground uppercase">Missing row</p>
        <h1 className="mt-2 font-heading text-4xl">That lead is not in the CRM.</h1>
        <Link href="/inbox" className="mt-6 inline-block text-sm underline underline-offset-4">
          Back to the inbox
        </Link>
      </main>
    );
  }

  const style = tierStyle[lead.tier];
  const alert = await getAlertForLead(lead.id);
  const positive =
    lead.breakdown.budget +
    lead.breakdown.timeline +
    lead.breakdown.emailDomain +
    lead.breakdown.seniority +
    lead.breakdown.intent +
    lead.breakdown.website;

  return (
    <main className="mx-auto max-w-6xl px-5 py-8 md:px-8 md:py-12">
      <Link href="/inbox" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
        Back to the inbox
      </Link>
      <header className="mt-6 flex flex-col justify-between gap-6 border-b border-border pb-6 md:flex-row md:items-end">
        <div>
          <p className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${style.chip}`}>
            {TIER_LABELS[lead.tier]} · {lead.channel}
          </p>
          <h1 className="mt-3 font-heading text-4xl tracking-tight text-balance md:text-5xl">{lead.name}</h1>
          <p className="mt-2 text-muted-foreground">
            {lead.role} at {lead.company}
            {lead.website ? (
              <>
                {" "}
                ·{" "}
                <a href={lead.website} className="underline underline-offset-4">
                  {lead.website.replace(/^https?:\/\//, "")}
                </a>
              </>
            ) : null}
          </p>
        </div>
        <div className="flex items-end gap-4">
          <div>
            <p className="text-[11px] tracking-[0.16em] text-muted-foreground uppercase">Score</p>
            <p className="font-heading text-6xl leading-none tabular-nums">{lead.score}</p>
          </div>
          <div className="pb-1 text-sm text-muted-foreground">
            <p>{lead.owner}</p>
            <p>{lead.ownerRole}</p>
            <p>Reply within {formatSla(lead.slaMinutes)}</p>
          </div>
        </div>
      </header>

      <div className="mt-8 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="font-heading text-2xl">Why this score</h2>
          <p className="mt-1 text-sm text-muted-foreground">{lead.routeReason}</p>
          <ul className="mt-5 space-y-3">
            {BREAKDOWN_META.map((item) => {
              const value = lead.breakdown[item.key] ?? 0;
              return (
                <li key={item.key}>
                  <div className="flex justify-between text-sm">
                    <span>{item.label}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {value} / {item.max}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-secondary">
                    <div className={`h-full rounded-full ${style.bar}`} style={{ width: `${Math.max(0, (value / item.max) * 100)}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="mt-4 text-sm text-muted-foreground">
            {positive} points before penalties
            {lead.breakdown.penalties ? ` · −${lead.breakdown.penalties} held back` : ""}.
            {lead.flags.length ? ` Flags: ${lead.flags.join(", ")}.` : ""}
          </p>
        </section>

        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="font-heading text-2xl">Enrichment</h2>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            <Fact label="Industry" value={lead.industry} />
            <Fact label="Company size" value={lead.companySize} />
            <Fact label="Budget" value={lead.budgetLabel} />
            <Fact label="Timeline" value={timelineLabel[lead.timeline] || lead.timeline} />
          </dl>
          <p className="mt-4 text-sm leading-6">{lead.intentSummary}</p>
          <h3 className="mt-5 text-[11px] tracking-[0.16em] text-muted-foreground uppercase">Pain points</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6">
            {lead.painPoints.map((pain) => (
              <li key={pain}>{sentence(pain)}</li>
            ))}
          </ul>
          <p className="mt-4 rounded-lg bg-secondary px-3 py-3 text-sm leading-6">{lead.nextAction}</p>
        </section>
      </div>

      <section className="mt-6 grid gap-6 lg:grid-cols-2">
        <article className="overflow-hidden rounded-xl border border-border bg-card">
          <header className="border-b border-border px-5 py-4">
            <p className="text-[11px] tracking-[0.16em] text-muted-foreground uppercase">Draft reply · not sent</p>
            <p className="mt-2 text-sm text-muted-foreground">To {lead.email}</p>
            <h2 className="font-heading text-2xl tracking-tight">{lead.draftSubject}</h2>
          </header>
          <pre className="px-5 py-4 font-sans text-sm leading-7 whitespace-pre-wrap">{lead.draftBody}</pre>
        </article>

        <article className="rounded-xl bg-[#1c1712] p-5 text-[#f6f1e8]">
          <p className="text-[11px] tracking-[0.16em] text-[#c8b8a4] uppercase">
            {alert?.channel || lead.channel} · {alert?.deliveryStatus || lead.alertStatus}
          </p>
          <h2 className="mt-3 font-heading text-2xl text-[#fbf7f1]">Slack-style alert</h2>
          <p className="mt-3 text-sm leading-6">{alert?.payload.text || "No alert stored for this row."}</p>
          {alert ? (
            <p className="mt-4 text-xs leading-5 text-[#c8b8a4]">{alert.deliveryDetail}</p>
          ) : null}
          <p className="mt-6 text-xs text-[#c8b8a4]">
            Filed {formatWhen(lead.createdAt)} UTC · {lead.llmProvider} · {lead.llmModel} · origin {lead.origin}
          </p>
        </article>
      </section>

      <section className="mt-6">
        <h2 className="font-heading text-2xl">Run</h2>
        <ol className="mt-3 divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {lead.steps.map((item) => (
            <li key={item.name} className="flex items-baseline justify-between gap-4 px-4 py-3 text-sm">
              <span>
                <span className="font-medium">{item.name}</span>
                <span className="ml-3 text-muted-foreground">{item.detail}</span>
              </span>
              <span className="shrink-0 tabular-nums text-muted-foreground">{item.ms} ms</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-6">
        <h2 className="sr-only">Original note</h2>
        <blockquote className="border-l-2 border-primary pl-4 text-sm leading-6 text-muted-foreground">{lead.message}</blockquote>
      </section>
    </main>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] tracking-[0.16em] text-muted-foreground uppercase">{label}</dt>
      <dd className="mt-1 text-sm">{value}</dd>
    </div>
  );
}
