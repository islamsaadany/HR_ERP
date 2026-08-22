"use client";

import { useState } from "react";

/**
 * Content · Access · People, following the AdminBenefitsTabs idiom.
 *
 * Client-side switching keeps "who gets this" next to "what is it" — the reason these are tabs on
 * one page rather than three separate screens.
 */
export function LearningTabs({
  content,
  access,
  people,
  accessCount,
  peopleCount,
}: {
  content: React.ReactNode;
  access: React.ReactNode;
  people: React.ReactNode;
  accessCount: number;
  peopleCount: number;
}) {
  const [tab, setTab] = useState<"content" | "access" | "people">("content");

  const Tab = ({ id, label, count }: { id: typeof tab; label: string; count?: number }) => (
    <button
      type="button"
      onClick={() => setTab(id)}
      aria-current={tab === id ? "page" : undefined}
      className={`border-b-2 px-3.5 py-2.5 text-[13px] font-semibold ${
        tab === id ? "border-navy-800 text-navy-800" : "border-transparent text-muted hover:text-ink"
      }`}
    >
      {label}
      {count !== undefined && count > 0 ? (
        <span className="ml-1.5 text-[10px] font-bold text-muted">{count}</span>
      ) : null}
    </button>
  );

  return (
    <div>
      {/* The bar is sticky in its own right and sits just under the page header, so the panel can
          scroll while you can still see which tab you are on and switch without scrolling back. */}
      <div className="sticky top-[62px] z-10 mb-4 flex gap-0.5 border-b border-line bg-paper/95 backdrop-blur-sm">
        <Tab id="content" label="Content" />
        <Tab id="access" label="Access" count={accessCount} />
        <Tab id="people" label="People" count={peopleCount} />
      </div>
      {tab === "content" ? content : tab === "access" ? access : people}
    </div>
  );
}
