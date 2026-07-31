import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();

const logoPath = path.join(
  root,
  "public",
  "ordstats-mark.png",
);

const outputPath = path.join(
  root,
  "public",
  "ordstats-social-card.png",
);

if (!fs.existsSync(logoPath)) {
  throw new Error(`Logo introuvable : ${logoPath}`);
}

const logoBase64 = fs
  .readFileSync(logoPath)
  .toString("base64");

const svg = `
<svg
  width="1200"
  height="630"
  viewBox="0 0 1200 630"
  xmlns="http://www.w3.org/2000/svg"
>
  <defs>
    <linearGradient
      id="background"
      x1="0"
      y1="0"
      x2="1"
      y2="1"
    >
      <stop offset="0%" stop-color="#07111f"/>
      <stop offset="55%" stop-color="#0b192b"/>
      <stop offset="100%" stop-color="#10243d"/>
    </linearGradient>

    <radialGradient id="glow">
      <stop
        offset="0%"
        stop-color="#285f9e"
        stop-opacity="0.34"
      />
      <stop
        offset="100%"
        stop-color="#285f9e"
        stop-opacity="0"
      />
    </radialGradient>

    <pattern
      id="grid"
      width="42"
      height="42"
      patternUnits="userSpaceOnUse"
    >
      <circle
        cx="2"
        cy="2"
        r="1.5"
        fill="#789bc4"
        opacity="0.12"
      />
    </pattern>
  </defs>

  <rect
    width="1200"
    height="630"
    fill="url(#background)"
  />

  <rect
    width="1200"
    height="630"
    fill="url(#grid)"
  />

  <circle
    cx="950"
    cy="315"
    r="330"
    fill="url(#glow)"
  />

  <text
    x="88"
    y="92"
    fill="#5f91c9"
    font-family="Arial, Helvetica, sans-serif"
    font-size="38"
    font-weight="700"
    letter-spacing="-1"
  >ORDstats</text>

  <text
    x="88"
    y="220"
    fill="#f4f7fb"
    font-family="Arial, Helvetica, sans-serif"
    font-size="68"
    font-weight="700"
    letter-spacing="-2.5"
  >
    Inside Ordinals
  </text>

  <text
    x="88"
    y="296"
    fill="#f4f7fb"
    font-family="Arial, Helvetica, sans-serif"
    font-size="68"
    font-weight="700"
    letter-spacing="-2.5"
  >
    ownership.
  </text>

  <text
    x="91"
    y="380"
    fill="#a8b9ca"
    font-family="Arial, Helvetica, sans-serif"
    font-size="27"
    font-weight="400"
  >
    Daily ownership analytics for the Top 100
  </text>

  <text
    x="91"
    y="421"
    font-family="Arial, Helvetica, sans-serif"
    font-size="27"
    font-weight="400"
    xml:space="preserve"
  ><tspan fill="#a8b9ca">collections in the </tspan><tspan
      fill="#ff4d57"
      font-weight="700"
    >ord.net</tspan><tspan
      fill="#a8b9ca"
    > 30-day ranking.</tspan></text>

  <line
    x1="90"
    y1="490"
    x2="650"
    y2="490"
    stroke="#789bc4"
    stroke-opacity="0.28"
  />

  <text
    x="90"
    y="548"
    fill="#789bc4"
    font-family="Arial, Helvetica, sans-serif"
    font-size="25"
    font-weight="700"
    letter-spacing="0.5"
  >
    ordstats.net
  </text>

  <rect
    x="814"
    y="134"
    width="300"
    height="300"
    rx="48"
    fill="#10243d"
    fill-opacity="0.72"
    stroke="#789bc4"
    stroke-opacity="0.18"
  />

  <image
    href="data:image/png;base64,${logoBase64}"
    x="839"
    y="159"
    width="250"
    height="250"
    preserveAspectRatio="xMidYMid meet"
  />
</svg>
`;

const info = await sharp(
  Buffer.from(svg),
)
  .png({
    compressionLevel: 9,
    adaptiveFiltering: true,
  })
  .toFile(outputPath);

if (info.width !== 1200 || info.height !== 630) {
  throw new Error(
    `Dimensions incorrectes : ${info.width} × ${info.height}`,
  );
}

console.log(`Carte créée : ${outputPath}`);
console.log(`Dimensions : ${info.width} × ${info.height}`);
console.log(
  `Taille : ${(info.size / 1024).toFixed(1)} kB`,
);
