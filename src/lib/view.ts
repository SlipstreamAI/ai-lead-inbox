import type { Tier } from "@/lib/lead-logic";

export const tierStyle: Record<
  Tier,
  { label: string; chip: string; bar: string; wash: string }
> = {
  hot: {
    label: "Hot",
    chip: "bg-[#9d3418] text-[#fff7f3]",
    bar: "bg-[#9d3418]",
    wash: "bg-[#f8ebe4]",
  },
  warm: {
    label: "Warm",
    chip: "bg-[#8a5a12] text-[#fff8ec]",
    bar: "bg-[#8a5a12]",
    wash: "bg-[#f6edd9]",
  },
  cold: {
    label: "Cold",
    chip: "bg-[#1f4d45] text-[#f3faf7]",
    bar: "bg-[#1f4d45]",
    wash: "bg-[#e5f0ec]",
  },
  disqualified: {
    label: "Review",
    chip: "bg-[#5c534c] text-[#f7f3ec]",
    bar: "bg-[#5c534c]",
    wash: "bg-[#ece7e1]",
  },
};

export function formatWhen(iso: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
}

export function formatSla(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  if (minutes % 1440 === 0) {
    const days = minutes / 1440;
    return days === 1 ? "1 day" : `${days} days`;
  }
  const hours = minutes / 60;
  return hours === 1 ? "1 hour" : `${hours} hours`;
}

export function sentence(value: string) {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export const timelineLabel: Record<string, string> = {
  asap: "This week",
  this_month: "This month",
  this_quarter: "This quarter",
  this_year: "This year",
  exploring: "Exploring",
};
