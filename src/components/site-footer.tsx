import BitcoinTip from "@/components/bitcoin-tip";

export default function SiteFooter() {
  return (
    <footer className="site-footer shell">
      <p className="site-footer-brand">ORDstats</p>

      <BitcoinTip />

      <p className="site-footer-tagline">
        Ownership · Distribution · On-chain data
      </p>
    </footer>
  );
}
