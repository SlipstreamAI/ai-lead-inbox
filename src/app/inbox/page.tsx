import { Suspense } from "react";
import { connection } from "next/server";
import { InboxBoard } from "@/components/inbox-board";
import { SiteHeader } from "@/components/site-header";
import { listLeads } from "@/lib/crm";

export const metadata = {
  title: "Inbox · Northline lead autopilot",
};

export default function InboxPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-5 py-8 md:px-8 md:py-12">
        <Suspense fallback={<p className="text-sm text-muted-foreground">Loading the CRM…</p>}>
          <Inbox />
        </Suspense>
      </main>
    </>
  );
}

async function Inbox() {
  await connection();
  return <InboxBoard leads={await listLeads()} />;
}
