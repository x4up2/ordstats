"use client";

import { useState } from "react";

const BITCOIN_TIP_ADDRESS =
  "bc1pss7ycw0kcmtg7rj2lppd8vxkkuy7ad60md9xkk8nwl0ruurpsxsqscqg7d";

export default function BitcoinTip() {
  const [copyStatus, setCopyStatus] = useState<
    "idle" | "copied" | "error"
  >("idle");

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(
        BITCOIN_TIP_ADDRESS,
      );

      setCopyStatus("copied");

      window.setTimeout(() => {
        setCopyStatus("idle");
      }, 1800);
    } catch {
      setCopyStatus("error");

      window.setTimeout(() => {
        setCopyStatus("idle");
      }, 1800);
    }
  }

  const buttonLabel =
    copyStatus === "copied"
      ? "Copied"
      : copyStatus === "error"
        ? "Copy failed"
        : "Copy address";

  const shortAddress =
    `${BITCOIN_TIP_ADDRESS.slice(0, 12)}…` +
    BITCOIN_TIP_ADDRESS.slice(-8);

  return (
    <div className="bitcoin-tip">
      <p className="bitcoin-tip-copy">
        <strong>Support ORDstats</strong>
        <span>
          {" · "}Tips help fund infrastructure and continued
          development.
        </span>
      </p>

      <div className="bitcoin-tip-action">
        <span
          className="bitcoin-tip-address"
          title={BITCOIN_TIP_ADDRESS}
        >
          {shortAddress}
        </span>

        <button
          className="bitcoin-tip-button"
          type="button"
          onClick={copyAddress}
          aria-label="Copy the ORDstats Bitcoin tip address"
        >
          {buttonLabel}
        </button>
      </div>
    </div>
  );
}
