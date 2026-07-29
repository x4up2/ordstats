"use client";

import { useEffect, useState } from "react";

type LocalSnapshotTimeProps = {
  value: string | null;
  dateOnly?: boolean;
};

export default function LocalSnapshotTime({
  value,
  dateOnly = false,
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

    const options: Intl.DateTimeFormatOptions = {
      day: "2-digit",
      month: "short",
      year: "numeric",
    };

    if (!dateOnly) {
      options.hour = "2-digit";
      options.minute = "2-digit";
      options.hour12 = false;
    }

    const formatter = new Intl.DateTimeFormat(
      "en-GB",
      options,
    );

    setFormatted(formatter.format(date));
  }, [value, dateOnly]);

  return (
    <time
      dateTime={value ?? undefined}
      suppressHydrationWarning
    >
      {formatted || "…"}
    </time>
  );
}
