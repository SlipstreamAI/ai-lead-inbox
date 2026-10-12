import type { JevDecision } from "@/lib/lead-logic";

const intentLabel: Record<string, string> = {
  automation: "Automation",
  crm: "CRM",
  inbound: "Inbound",
  partnership: "Partnership",
  other: "Other",
};

export function formatConfidence(value: number) {
  return `${Math.round(value * 100)}%`;
}

export function JevReceipt({ jev }: { jev?: JevDecision }) {
  if (!jev?.used) return null;
  return (
    <div className="rounded-lg border border-border bg-background px-4 py-3 text-sm leading-6">
      <p className="text-[11px] tracking-[0.16em] text-muted-foreground uppercase">Jev decision engine</p>
      <p className="mt-1">
        {jev.model} · score {formatConfidence(jev.scoreConfidence)} · route {formatConfidence(jev.routeConfidence)} ·{" "}
        {intentLabel[jev.intent] || jev.intent} {formatConfidence(jev.intentConfidence)}
      </p>
      <p className="text-muted-foreground">
        Spam {formatConfidence(jev.gates.spam)} · urgent {formatConfidence(jev.gates.urgent)} · needs a human{" "}
        {formatConfidence(jev.gates.needsHuman)}
        {jev.heldForReview ? ` · held below ${formatConfidence(jev.confidenceThreshold)}` : ""}
      </p>
      {jev.heldForReview && jev.holdReasons.length ? (
        <p className="mt-1 text-muted-foreground">{jev.holdReasons.join("; ")}.</p>
      ) : null}
    </div>
  );
}

export function JevDetail({ jev }: { jev?: JevDecision }) {
  if (!jev?.used) return null;
  const rows = [
    ["Score confidence", formatConfidence(jev.scoreConfidence)],
    ["Route confidence", `${jev.route} · ${formatConfidence(jev.routeConfidence)}`],
    ["Intent", `${intentLabel[jev.intent] || jev.intent} · ${formatConfidence(jev.intentConfidence)}`],
    ["Spam", formatConfidence(jev.gates.spam)],
    ["Urgent", formatConfidence(jev.gates.urgent)],
    ["Needs a human", formatConfidence(jev.gates.needsHuman)],
  ];
  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h2 className="font-heading text-2xl">Jev decision engine</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {jev.model}. Choice and score answers under {formatConfidence(jev.confidenceThreshold)} confidence go to human
        review, and so does a spam or needs-a-human gate at 50% or higher.
      </p>
      <dl className="mt-4 grid gap-4 sm:grid-cols-3">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt className="text-[11px] tracking-[0.16em] text-muted-foreground uppercase">{label}</dt>
            <dd className="mt-1 text-sm">{value}</dd>
          </div>
        ))}
      </dl>
      {jev.heldForReview ? (
        <p className="mt-4 rounded-lg bg-secondary px-3 py-3 text-sm leading-6">
          Held for human review.
          {jev.holdReasons.length ? ` ${jev.holdReasons.join("; ")}.` : " Jev chose the review queue."}
        </p>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">Confident enough to route without a review hold.</p>
      )}
    </section>
  );
}
