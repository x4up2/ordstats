# ORDstats

**Ownership intelligence for Bitcoin Ordinals collections.**

ORDstats is an experimental analytics platform that studies how
inscriptions from major Bitcoin Ordinals collections are distributed
across on-chain addresses.

It tracks the first 100 collections in the rolling 30-day `ord.net`
ranking, computes ownership snapshots from an independent local `ord`
index, stores the resulting metrics in Supabase and publishes
collection reports through a Next.js application.

ORDstats focuses on ownership structure. It does not provide market
prices, trading signals, collection valuations or investment advice.

## What ORDstats provides

The public collection directory includes:

- dynamic search by collection name or slug;
- the current `ord.net` rolling 30-day rank;
- circulating supply;
- number of holding addresses;
- single-holder rate;
- Gini coefficient;
- effective-holder count;
- Top 1% supply concentration;
- the date and time of the latest snapshot.

Each collection report provides a more detailed ownership analysis.

### Collection overview

- holding addresses;
- single holders;
- average and median holdings;
- largest holder;
- single-holder supply;
- circulating and unavailable supply.

### Advanced ownership metrics

- ownership evenness;
- effective holders;
- Gini coefficient;
- Top 1%, Top 5% and Top 10% supply concentration;
- whale-tier supply;
- multi-holder supply;
- largest-holder multiple;
- holding-size and supply distributions;
- Lorenz curve;
- holding percentiles;
- fixed-address concentration;
- whale tiers.

### Ownership history

Daily snapshots allow ORDstats to display:

- 1-day, 7-day and 30-day comparisons;
- changes in key ownership metrics;
- daily trend charts for holding addresses, effective holders,
  Gini coefficient and Top 1% supply.

Historical charts connect recorded observations only. Missing dates
are not estimated or interpolated.

## Architecture

ORDstats has three distinct layers.

### 1. Local indexing and calculation

A locally operated Bitcoin `ord` server provides inscription and
ownership information.

Node.js scripts:

1. read the current collection catalogue;
2. query the local `ord` JSON API;
3. calculate ownership and concentration metrics;
4. create a dated collection snapshot;
5. publish the current state and historical observation to Supabase.

The Bitcoin node, the `ord` index and their data directories are not
part of this repository.

### 2. Supabase storage

Supabase stores:

- the public collection catalogue;
- each collection's latest ownership state;
- advanced ownership metrics;
- one historical snapshot per collection and calendar date.

Historical snapshots are upserted using the pair:

```text
collection_slug + snapshot_date
```

This preserves one canonical observation per collection per day.

### 3. Next.js application

The public interface is built with:

- Next.js;
- React;
- TypeScript;
- Supabase JavaScript client;
- server components for data loading;
- small client components for search and history controls.

Public collection data is cached briefly by the application. A newly
uploaded snapshot may therefore take a few minutes to appear.

## Requirements

A complete local installation requires:

- Node.js and npm;
- a synchronized Bitcoin node;
- a working `ord` index with its JSON API enabled;
- a Supabase project;
- access to the required Supabase tables;
- sufficient disk space for the Bitcoin and `ord` indexes.

The web application can be deployed separately from the local
indexing machine, provided that it can read the published Supabase
data.

## Environment variables

Copy the example file:

```bash
cp .env.example .env.local
```

Then provide the following values:

```dotenv
ORD_BASE_URL=http://127.0.0.1
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SECRET_KEY=your-server-side-secret
```

### Important security rule

`SUPABASE_SECRET_KEY` is a privileged server-side credential.

It must never:

- be committed to Git;
- be placed in a `NEXT_PUBLIC_*` variable;
- be included in browser-side code;
- be printed in logs;
- be copied into screenshots, issues or pull requests.

If this key is exposed, revoke or rotate it immediately.

## Local development

Install dependencies:

```bash
npm ci
```

Start the development server:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

Production checks:

```bash
npm run lint
npm run build
```

Run the production server:

```bash
npm run start
```

## Available commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the local Next.js development server |
| `npm run build` | Create a production build |
| `npm run start` | Start the production application |
| `npm run lint` | Run ESLint |
| `npm run snapshot:ownership` | Generate ownership data for a collection |
| `npm run upload:snapshot` | Publish a generated snapshot to Supabase |
| `npm run index:collection` | Index and publish one collection |
| `npm run refresh:all` | Refresh active indexed collections |
| `npm run catalog:update:100` | Retrieve and synchronize the rolling Top 100 |
| `npm run catalog:index` | Index newly ranked collections |
| `npm run catalog:sync` | Synchronize catalogue ranks and active status |
| `npm run catalog:images` | Synchronize collection images |

These data-pipeline commands require a correctly configured local
`ord` server and `.env.local`.

## Daily automation on macOS

The production instance currently uses a local macOS `launchd` task.

The real machine-specific script is intentionally excluded from Git
because it contains local filesystem and executable paths.

A public template is provided:

```bash
cp \
  scripts/refresh-all-launchd.example.sh \
  scripts/refresh-all-launchd.sh
```

Edit the copied file to match the local installation before creating
a corresponding file in:

```text
~/Library/LaunchAgents/
```

The scheduler should only run while:

- the Mac is available;
- the Bitcoin node is synchronized;
- the `ord` server is running;
- the external disk containing the index is mounted;
- the required environment variables are present.

## Methodological limitations

ORDstats metrics must be interpreted with care.

### Addresses are not people

A Bitcoin address does not necessarily represent one individual owner.

One person or entity may control several addresses. Conversely, an
address may represent:

- a marketplace;
- a custodian;
- a shared wallet;
- an escrow system;
- a protocol-controlled address.

ORDstats therefore measures address-level distribution, not verified
human ownership.

### Snapshots are observations

Each result describes the indexed state at a particular Bitcoin block
and capture time.

Changes may reflect:

- transfers;
- burns;
- marketplace custody;
- address consolidation;
- index synchronization;
- catalogue changes;
- corrections to collection membership.

### Concentration is not investment quality

A rising or falling concentration metric is descriptive. It is not
automatically positive or negative and must not be treated as a
buying or selling signal.

### Collection membership depends on upstream definitions

ORDstats relies on curated collection definitions and external
catalogue information. Changes to those sources can affect the
observed supply and ownership structure.

### No financial advice

ORDstats is a research and data-exploration project. Nothing in the
application or repository constitutes financial, legal or tax advice.

## Public repository safety

The repository is designed so that local operational data remains
outside Git.

The following files are ignored:

- `.env` files, except `.env.example`;
- logs;
- local indexing work files;
- generated `ord.net` ranking snapshots;
- generated ownership snapshots;
- editor and operating-system files;
- backup files;
- private keys and certificates;
- the machine-specific `launchd` refresh script.

### Files requiring an explicit decision

The following content is not automatically ignored because it may be
needed by the application or useful for reproducibility:

- `public/collections/`;
- `public/ordstats-mark.png`;
- application icons and public assets.

Before publishing, review their:

- file size;
- origin;
- copyright status;
- redistribution rights;
- personal or operational metadata.

Collection artwork may be protected by third-party copyrights even
when it is publicly viewable on-chain. Do not assume that public
availability automatically grants redistribution rights.

## Pre-publication checklist

Run these checks immediately before the first public push.

### 1. Review the working tree

```bash
git status --short
git status --ignored --short
```

### 2. Confirm that local secrets are ignored

```bash
git check-ignore -v \
  .env.local \
  logs/refresh-all.out.log \
  scripts/refresh-all-launchd.sh
```

### 3. Search tracked files for likely secrets

```bash
git grep -nEI \
  'sb_secret_|service_role|SUPABASE_SECRET_KEY=.+|BEGIN .*PRIVATE KEY|postgres(ql)?://'
```

No real credential should be returned. References to
environment-variable names in source code are normal.

### 4. Search for local personal paths

```bash
git grep -nE \
  '/Users/|/Volumes/|C:\\Users\\'
```

Review every result before publishing.

### 5. Review local assistant and project-instruction files

```bash
git status --short AGENTS.md CLAUDE.md
sed -n '1,240p' AGENTS.md
sed -n '1,240p' CLAUDE.md
```

Remove them from the public repository when they contain private
instructions, personal context or machine-specific information.

### 6. Review generated and media files

```bash
du -sh \
  data \
  public/collections \
  src/data/generated \
  2>/dev/null
```

Do not use Git as storage for unnecessarily large generated datasets.

### 7. Check the complete Git history

`.gitignore` only protects future additions. It does not remove a
secret that was already committed.

```bash
git log --all --full-history -- .env .env.local
```

If a secret was ever committed:

1. rotate it immediately;
2. remove it from Git history;
3. verify the rewritten history before publishing.

### 8. Validate the project

```bash
npm run lint
npm run build
git diff --check
```

### 9. Inspect the exact first commit

```bash
git diff --cached --stat
git diff --cached
```

Never publish using `git add .` without reviewing the staged diff.

### 10. Enable repository protections

For a public GitHub repository, enable:

- secret scanning;
- push protection;
- Dependabot alerts;
- branch protection for the main branch;
- required review before merging external contributions.

## Deployment notes

Only server-side code should access `SUPABASE_SECRET_KEY`.

For a hosted deployment:

- configure secrets through the hosting provider;
- never place privileged credentials in repository files;
- keep the ingestion pipeline on a trusted machine;
- expose only the public Next.js application;
- apply appropriate Supabase access controls;
- review application logs for accidental secret disclosure.

The local Bitcoin and `ord` infrastructure should not be exposed
directly to the public internet.

## Data and privacy

ORDstats analyzes public Bitcoin blockchain data.

The repository must not include:

- wallet seed phrases;
- private keys;
- personally attributed wallet mappings;
- user IP addresses;
- private API responses;
- local system logs containing sensitive information.

## Contributing

Contributions should preserve:

- deterministic metric calculations;
- clear methodological definitions;
- strict separation between server and client secrets;
- reproducible snapshots;
- explicit handling of unavailable or incomplete data.

Before opening a pull request, run:

```bash
npm run lint
npm run build
```

## License

No open-source license has been selected yet.

Until a `LICENSE` file is added, the source code should not be assumed
to grant permission for reuse, modification or redistribution.

Choose and add an explicit license before presenting the repository
as an open-source project.
