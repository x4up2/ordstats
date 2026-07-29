import BitcoinTip from "@/components/bitcoin-tip";

export default function SiteFooter() {
  return (
    <footer className="site-footer shell">
      <p className="site-footer-brand">
        <span>ORDstats</span>
        <span aria-hidden="true">·</span>
        <a
          href="https://github.com/x4up2/ordstats"
          target="_blank"
          rel="noopener noreferrer"
        >
          GitHub
        </a>
      </p>

      <BitcoinTip />
    </footer>
  );
}
