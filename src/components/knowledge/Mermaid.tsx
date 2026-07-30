"use client";

import { useEffect, useId, useState } from "react";

/** Renders a mermaid diagram from source, client-side (mermaid is loaded lazily). */
export function Mermaid({ chart }: { chart: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const rawId = useId().replace(/[^a-zA-Z0-9]/g, "");

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: "base",
          themeVariables: {
            primaryColor: "#eceff5",
            primaryBorderColor: "#163055",
            primaryTextColor: "#16202e",
            lineColor: "#7d97ba",
            fontFamily: "inherit",
          },
        });
        const { svg } = await mermaid.render("mm" + rawId, chart);
        if (active) setSvg(svg);
      } catch {
        if (active) setFailed(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [chart, rawId]);

  if (failed) {
    return (
      <pre className="my-4 overflow-x-auto rounded-lg border border-line bg-navy-50 p-4 text-xs text-muted">
        {chart}
      </pre>
    );
  }
  if (!svg) {
    return <div className="my-4 h-24 animate-pulse rounded-lg border border-line bg-navy-50/50" />;
  }
  return (
    <div
      className="my-5 flex justify-center overflow-x-auto rounded-lg border border-line bg-surface p-4"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
