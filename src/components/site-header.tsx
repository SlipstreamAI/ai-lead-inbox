import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="border-b border-border/80 bg-[#fbf7f1]/80 backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4 md:px-8">
        <Link href="/" className="group flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-md bg-primary font-heading text-lg text-primary-foreground">
            N
          </span>
          <span>
            <span className="block font-heading text-lg leading-none tracking-tight">Northline</span>
            <span className="text-[11px] tracking-[0.16em] text-muted-foreground uppercase">Lead autopilot</span>
          </span>
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          <Link href="/" className="rounded-md px-3 py-2 text-foreground hover:bg-secondary">
            Intake
          </Link>
          <Link href="/inbox" className="rounded-md px-3 py-2 text-foreground hover:bg-secondary">
            Inbox
          </Link>
        </nav>
      </div>
    </header>
  );
}
