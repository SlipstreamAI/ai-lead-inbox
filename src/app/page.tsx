import { IntakeForm } from "@/components/intake-form";
import { SiteHeader } from "@/components/site-header";

const steps = [
  ["Intake", "The form on this page, or the same payload posted to n8n."],
  ["Score", "Budget, timeline, work email, role, intent, and website. Points are fixed."],
  ["Route", "Hot to Avery, warm to Jordan, cold to nurture, junk to review."],
  ["Enrich", "Industry, company size, pains, and the next action. Mock or a live model."],
  ["Draft", "A short reply in Northline's voice. Held leads get an internal note instead."],
  ["CRM", "A SQLite row plus leads.csv with the same columns a Google Sheet or Airtable base would use."],
  ["Alert", "A Slack Block Kit payload. Posted to a webhook when you set one, otherwise kept in this inbox."],
];

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto grid max-w-6xl gap-10 px-5 py-8 md:px-8 md:py-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-start">
        <section>
          <p className="text-[11px] tracking-[0.2em] text-muted-foreground uppercase">Workflow demo · n8n / Make / Zapier</p>
          <h1 className="mt-3 font-heading text-4xl leading-[1.05] tracking-tight text-balance md:text-6xl">
            AI Lead Inbox → CRM Autopilot
          </h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-pretty text-[#3f3832]">
            A lead hits the form. Scoring, enrichment, a CRM row, a draft reply, and a Slack alert happen before a human
            opens the thread.
          </p>
          <ol className="mt-8 space-y-3">
            {steps.map(([title, detail], index) => (
              <li key={title} className="grid grid-cols-[2rem_1fr] gap-3">
                <span className="font-heading text-lg text-primary tabular-nums">{index + 1}</span>
                <span>
                  <span className="font-medium">{title}</span>
                  <span className="mt-0.5 block text-sm leading-6 text-muted-foreground">{detail}</span>
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-8 max-w-md text-sm leading-6 text-muted-foreground">
            Northline is a fictional studio. The pipeline is real: it runs here in mock mode with no API key, and the same
            rules ship inside the n8n export.
          </p>
        </section>
        <IntakeForm />
      </main>
    </>
  );
}
