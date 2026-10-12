"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import fixtureModule from "@/lib/fixtures.json";

const fixtures = (Array.isArray(fixtureModule)
  ? fixtureModule
  : Array.isArray((fixtureModule as { default?: unknown }).default)
    ? (fixtureModule as { default: typeof fixtureModule }).default
    : []) as typeof fixtureModule;
import type { LeadRecord } from "@/lib/lead-logic";
import { formatSla, sentence, tierStyle, timelineLabel } from "@/lib/view";
import { JevReceipt } from "@/components/jev-summary";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const budgets = [
  { value: "under_1500", label: "Under $1,500" },
  { value: "1500_4999", label: "$1,500–$4,999" },
  { value: "5000_14999", label: "$5,000–$14,999" },
  { value: "15000_plus", label: "$15,000+" },
  { value: "unknown", label: "Not sure" },
] as const;

const timelines = [
  { value: "asap", label: "This week" },
  { value: "this_month", label: "This month" },
  { value: "this_quarter", label: "This quarter" },
  { value: "this_year", label: "This year" },
  { value: "exploring", label: "Exploring" },
] as const;

type RunResult = {
  ok: true;
  lead: LeadRecord;
  alert?: { deliveryStatus?: string; deliveryDetail?: string; payload?: { text?: string } };
};

const empty = {
  name: "",
  email: "",
  company: "",
  role: "",
  website: "",
  message: "",
  budget: "",
  timeline: "",
};

function budgetBand(value: number | string) {
  if (typeof value === "string" && Number.isNaN(Number(value))) return value;
  const amount = Number(value);
  if (amount >= 15000) return "15000_plus";
  if (amount >= 5000) return "5000_14999";
  if (amount >= 1500) return "1500_4999";
  return "under_1500";
}

export function IntakeForm() {
  const [fields, setFields] = useState(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [viaN8n, setViaN8n] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const [health, setHealth] = useState<{
    llmMode: string;
    model: string;
    slack: string;
    typesafeKeySet?: boolean;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/health")
      .then((response) => response.json())
      .then((data) => {
        if (!cancelled && data.ok) setHealth(data);
      })
      .catch(() => {
        if (!cancelled) setHealth(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function set<K extends keyof typeof empty>(key: K, value: string) {
    setFields((current) => ({ ...current, [key]: value }));
  }

  function applyFixture(key: string) {
    const fixture = fixtures.find((item) => item.key === key);
    if (!fixture) return;
    setFields({
      name: fixture.input.name,
      email: fixture.input.email,
      company: fixture.input.company,
      role: fixture.input.role,
      website: fixture.input.website,
      message: fixture.input.message,
      budget: budgetBand(fixture.input.budget),
      timeline: fixture.input.timeline,
    });
    setErrors({});
    setResult(null);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setErrors({});
    setResult(null);
    const response = await fetch(viaN8n ? "/api/relay/n8n" : "/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...fields, source: "web_form" }),
    });
    const data = await response.json();
    setPending(false);
    if (!response.ok || data.ok === false) {
      setErrors(data.errors || { form: "The pipeline did not accept this lead." });
      return;
    }
    setResult(data);
  }

  const formError = errors.form || errors.llm || errors.n8n || errors.body;

  return (
    <div className="rounded-2xl border border-border bg-card shadow-[0_20px_50px_-32px_rgba(28,23,18,0.6)]">
      <div className="flex flex-col gap-4 border-b border-border px-5 py-5 sm:flex-row sm:items-start sm:justify-between md:px-6">
        <div>
          <h2 className="font-heading text-2xl tracking-tight">New inbound lead</h2>
          <p className="mt-1 max-w-md text-sm leading-6 text-muted-foreground">
            This is the public form. Submitting it runs score, route, enrich, CRM write, draft, and alert.
          </p>
        </div>
        <p className="text-xs leading-5 text-muted-foreground sm:max-w-44 sm:text-right">
          {health
            ? `${
                health.llmMode === "mock" ? "Mock model" : `Live model ${health.model}`
              } · ${health.slack === "webhook" ? "Slack webhook on" : "alert stays in the inbox"}${
                health.typesafeKeySet ? " · Jev on" : ""
              }`
            : "Checking the pipeline…"}
        </p>
      </div>

      {result ? (
        <Receipt result={result} onReset={() => setResult(null)} />
      ) : (
        <form onSubmit={onSubmit} className="space-y-6 px-5 py-5 md:px-6" noValidate>
          <div>
            <p className="text-[11px] tracking-[0.16em] text-muted-foreground uppercase">Try a sample</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {fixtures.map((fixture) => (
                <button
                  key={fixture.key}
                  type="button"
                  onClick={() => applyFixture(fixture.key)}
                  className="rounded-full border border-border bg-background px-3 py-1.5 text-left text-sm hover:border-primary"
                >
                  {fixture.label}
                </button>
              ))}
            </div>
          </div>

          {formError ? (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
              {formError}
            </p>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" error={errors.name} htmlFor="name">
              <Input id="name" name="name" value={fields.name} onChange={(event) => set("name", event.target.value)} className="h-10 bg-background" autoComplete="name" aria-invalid={Boolean(errors.name)} />
            </Field>
            <Field label="Work email" error={errors.email} htmlFor="email">
              <Input id="email" name="email" type="email" value={fields.email} onChange={(event) => set("email", event.target.value)} className="h-10 bg-background" autoComplete="email" aria-invalid={Boolean(errors.email)} />
            </Field>
            <Field label="Company" error={errors.company} htmlFor="company">
              <Input id="company" name="company" value={fields.company} onChange={(event) => set("company", event.target.value)} className="h-10 bg-background" autoComplete="organization" aria-invalid={Boolean(errors.company)} />
            </Field>
            <Field label="Role" error={errors.role} htmlFor="role">
              <Input id="role" name="role" value={fields.role} onChange={(event) => set("role", event.target.value)} className="h-10 bg-background" autoComplete="organization-title" aria-invalid={Boolean(errors.role)} />
            </Field>
          </div>

          <Field label="Website" error={errors.website} htmlFor="website" hint="Optional">
            <Input id="website" name="website" value={fields.website} onChange={(event) => set("website", event.target.value)} placeholder="helioclinic.com" className="h-10 bg-background" aria-invalid={Boolean(errors.website)} />
          </Field>

          <Field label="What should happen after the form is submitted?" error={errors.message} htmlFor="message">
            <Textarea
              id="message"
              name="message"
              value={fields.message}
              onChange={(event) => set("message", event.target.value)}
              className="min-h-32 bg-background"
              aria-invalid={Boolean(errors.message)}
            />
          </Field>

          <fieldset>
            <legend className="text-sm font-medium">Monthly budget</legend>
            {errors.budget ? <p className="mt-1 text-sm text-destructive">{errors.budget}</p> : null}
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {budgets.map((option) => (
                <Choice key={option.value} pressed={fields.budget === option.value} onClick={() => set("budget", option.value)}>
                  {option.label}
                </Choice>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-sm font-medium">Timeline</legend>
            {errors.timeline ? <p className="mt-1 text-sm text-destructive">{errors.timeline}</p> : null}
            <div className="mt-2 flex flex-wrap gap-2">
              {timelines.map((option) => (
                <Choice key={option.value} pressed={fields.timeline === option.value} onClick={() => set("timeline", option.value)}>
                  {option.label}
                </Choice>
              ))}
            </div>
          </fieldset>

          <label className="flex items-start gap-3 rounded-lg border border-border bg-background px-3 py-3 text-sm leading-5">
            <input
              type="checkbox"
              className="mt-1"
              checked={viaN8n}
              onChange={(event) => setViaN8n(event.target.checked)}
            />
            <span>
              Send this lead through the n8n webhook instead.
              <span className="mt-1 block text-muted-foreground">
                Leave this off to run the TypeScript pipeline in this app. The webhook only answers after you publish the imported workflow.
              </span>
            </span>
          </label>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Button type="submit" className="h-11 px-5" disabled={pending}>
              {pending ? "Scoring, filing, drafting…" : "Run the autopilot"}
            </Button>
            <p className="text-xs text-muted-foreground">
              {health?.typesafeKeySet
                ? "Scoring is sent to TypeSafe Jev with your key. The draft stays on the mock model unless LLM_MODE=openai."
                : "Nothing leaves this machine while mock mode is on and TYPESAFE_API_KEY is empty."}
            </p>
          </div>
        </form>
      )}
    </div>
  );
}

function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <Label htmlFor={htmlFor}>{label}</Label>
        {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
      </div>
      {children}
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function Choice({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`rounded-md border px-3 py-2 text-sm ${
        pressed ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:border-primary/40"
      }`}
    >
      {children}
    </button>
  );
}

function Receipt({ result, onReset }: { result: RunResult; onReset: () => void }) {
  const lead = result.lead;
  const style = tierStyle[lead.tier];
  return (
    <div className="space-y-5 px-5 py-5 md:px-6" aria-live="polite">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${style.chip}`}>{style.label}</p>
          <h3 className="mt-3 font-heading text-3xl tracking-tight">{lead.name}</h3>
          <p className="text-sm text-muted-foreground">
            {lead.owner} · {lead.channel} · reply within {formatSla(lead.slaMinutes)}
          </p>
        </div>
        <p className="font-heading text-6xl leading-none tabular-nums">{lead.score}</p>
      </div>
      <p className="text-sm leading-6">{lead.intentSummary}</p>
      <JevReceipt jev={lead.jev} />
      <div className="rounded-lg border border-border bg-background px-4 py-3">
        <p className="text-[11px] tracking-[0.16em] text-muted-foreground uppercase">Draft</p>
        <p className="mt-1 font-medium">{lead.draftSubject}</p>
        <p className="mt-2 line-clamp-4 text-sm leading-6 whitespace-pre-wrap text-muted-foreground">{lead.draftBody}</p>
      </div>
      <p className="text-sm text-muted-foreground">{result.alert?.deliveryDetail || lead.alertStatus}</p>
      <div className="flex flex-wrap gap-3">
        <Link href={`/inbox/${lead.id}`} className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground">
          Open the CRM row
        </Link>
        <Button type="button" variant="outline" className="h-10 bg-background px-4" onClick={onReset}>
          File another lead
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {sentence(lead.industry)} · {lead.companySize} · {timelineLabel[lead.timeline] || lead.timeline} · {lead.llmProvider}
      </p>
    </div>
  );
}
