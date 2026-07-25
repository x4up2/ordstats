"use client";

import { useEffect, useState } from "react";

type LocalSnapshotTimeProps = {
  value: string | null;
};

export default function LocalSnapshotTime({
  value,
}: LocalSnapshotTimeProps) {
  const [formatted, setFormatted] = useState("");

  useEffect(() => {
    if (!value) {
      setFormatted("Unavailable");
      return;
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      setFormatted("Unavailable");
      return;
    }

    const formatter = new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

    setFormatted(formatter.format(date));
  }, [value]);

  return (
    <time
      dateTime={value ?? undefined}
      suppressHydrationWarning
    >
      {formatted || "…"}
    </time>
  );
}
