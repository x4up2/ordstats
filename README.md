# ORDstats

**Ownership analytics for Bitcoin Ordinals collections.**

[ORDstats](https://www.ordstats.net) is an experimental analytics
platform that studies how inscriptions from major Bitcoin Ordinals
collections are distributed across on-chain addresses.

It follows the first 100 collections in the rolling 30-day
[`ord.net`](https://ord.net) ranking, computes ownership snapshots
from an independent local `ord` index, stores the resulting data in
Supabase and publishes collection reports through a Next.js
application.

ORDstats focuses on ownership structure. It does not provide market
prices, collection valuations, trading signals or investment advice.

## Public application

```text
https://www.ordstats.net
```

The public website can operate independently from the indexing
machine because it reads previously published data from Supabase.

## What ORDstats provides

### Collection directory

The homepage displays the active Top 100 in current `ord.net`
30-day ranking order.

It provides:

- dynamic search by collection name or slug;
- current `ord.net` rolling 30-day rank;
- circulating supply;
- number of holding addresses;
- single-holder rate;
- average holding per address;
- effective-holder count;
- Top 1% supply concentration;
- latest snapshot date;
- Bitcoin block associated with the snapshot.

The homepage intentionally prioritizes immediately understandable
metrics. More technical indicators, including the Gini coefficient,
remain available in individual collection reports.

### Collection overview

Each collection page begins with six primary metrics, presented in
the following order:

1. circulating supply;
2. holding addresses;
3. single holders;
4. average holding;
5. largest holder;
6. single-holder supply.

`Single holders` and `Single-holder supply` describe different
proportions:

- **Single holders** is the share of holding addresses that own
  exactly one inscription;
- **Single-holder supply** is the share of circulating supply held
  by those one-piece addresses.

### Advanced ownership metrics

Collection reports can also include:

- ownership evenness;
- effective holders;
- Gini coefficient;
- Top 1%, Top 5% and Top 10% supply concentration;
- whale-tier supply;
- multi-holder supply;
- largest-holder multiple;
- holding-size distribution;
- supply distribution;
- Lorenz curve;
- holding percentiles;
- fixed-address concentration;
- whale tiers.

### Ownership history

Daily observations are stored separately from the current collection
state.

As sufficient history becomes available, ORDstats displays comparison
windows and trend charts for:

- holding addresses;
- single holders;
- average holding;
- effective holders;
- Gini coefficient;
- Top 1% supply concentration.

Historical charts connect actual recorded observations only. Missing
dates are never estimated or interpolated.

## Data methodology

### Average holding

Average holding is calculated as:

```text
circulating supply / holding addresses
```

It represents the average number of circulating inscriptions held per
address.

### Effective holders

Effective holders estimates how many equally sized holders would
produce the observed ownership distribution.

It decreases when ownership becomes more concentrated and increases
when supply is distributed more evenly.

### Gini coefficient

The Gini coefficient summarizes ownership inequality across holding
addresses.

A lower value indicates a more even address-level distribution. A
higher value indicates stronger concentration.

### Largest-holder multiple

The largest-holder multiple compares the largest address balance with
the collection-wide average holding.

### Address-level interpretation

All ownership metrics are calculated at Bitcoin address level.

A Bitcoin address does not necessarily represent one person. One
person or entity may control several addresses, while one address may
represent:

- a marketplace;
- a custodian;
- a shared wallet;
- an escrow system;
- a protocol-controlled address.

ORDstats therefore measures address-level distribution, not verified
human ownership.

## Architecture

ORDstats has three main layers.

### 1. Local indexing and calculation

A locally operated Bitcoin `ord` server provides inscription and
ownership information through its JSON API.

The local pipeline:

1. retrieves the current `ord.net` rolling Top 100;
2. validates explicit rank values;
3. synchronizes ranks and active catalogue status;
4. indexes newly ranked collections;
5. refreshes active collections in rank order;
6. calculates ownership and concentration metrics;
7. creates dated snapshots;
8. publishes current and historical data to Supabase;
9. synchronizes collection artwork;
10. produces an execution report.

The rank scraper accepts only explicit ranks from 1 to 100. It aborts
when ranks are missing, duplicated or conflicting and never silently
falls back to HTML document order.

Active collections are refreshed by ascending `ord_rank_30d`, so
snapshot times progress in the same general order as the public
ranking.

The Bitcoin node, `ord` index and their data directories are not part
of this repository.

### 2. Supabase storage

Supabase stores:

- the public collection catalogue;
- active and inactive catalogue status;
- current `ord.net` ranks;
- each collection's latest ownership state;
- advanced ownership metrics;
- one historical observation per collection and calendar date;
- references to collection artwork.

Historical snapshots are upserted using the pair:

```text
collection_slug + snapshot_date
```

This preserves one canonical observation per collection per day.

### 3. Next.js application

The public interface is built with:

- Next.js 16;
- React 19;
- TypeScript;
- Supabase JavaScript client;
- server components for data loading;
- client components for search, date formatting and history controls;
- Vercel Analytics;
- Vercel Speed Insights.

The hosted application is deployed on Vercel.

Public collection data is cached briefly by the application. A newly
published snapshot may therefore take a few minutes to appear.

## Requirements

A complete local indexing installation requires:

- Node.js and npm;
- a synchronized Bitcoin node;
- a working `ord` index;
- the `ord` JSON API enabled;
- a Supabase project;
- access to the required Supabase tables;
- sufficient disk space for the Bitcoin and `ord` indexes.

The web application can be deployed separately from the indexing
machine, provided that it can read the published Supabase data.

## Environment variables

Copy the example file:

```bash
cp .env.example .env.local
```

Then provide:

```dotenv
ORD_BASE_URL=http://127.0.0.1
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SECRET_KEY=your-server-side-secret
```

### Security rule

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

Run the production checks:

```bash
npm run lint
npm run build
```

Start the production application:

```bash
npm run start
```

## Available npm commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the local Next.js development server |
| `npm run build` | Create a production build |
| `npm run start` | Start the production application |
| `npm run lint` | Run ESLint |
| `npm run snapshot:ownership` | Generate ownership data for one collection |
| `npm run upload:snapshot` | Publish a generated snapshot to Supabase |
| `npm run index:collection` | Index and publish one collection |
| `npm run refresh:all` | Refresh all active collections in ranking order |
| `npm run catalog:update:100` | Retrieve, validate and synchronize the rolling Top 100 |
| `npm run catalog:index` | Index collections newly added to the catalogue |
| `npm run catalog:sync` | Synchronize ranks and active catalogue status |
| `npm run catalog:images` | Download or publish collection artwork |
| `npm run catalog:update` | Legacy Top 50 catalogue command |

The data-pipeline commands require a correctly configured local `ord`
server and `.env.local`.

## Collection image synchronization

Collection artwork is stored under:

```text
public/collection-images/
```

Useful modes include:

```bash
npm run catalog:images -- --download-only
npm run catalog:images -- --publish-local
npm run catalog:images -- --force
```

The publication helper:

```text
scripts/publish-catalog-images.sh
```

can:

1. download missing artwork;
2. detect newly created image files;
3. create an image-only Git commit;
4. push the commit to the deployment branch;
5. wait for the files to become available on Vercel;
6. publish the deployed local image URLs to Supabase.

The helper aborts rather than modifying Git when:

- staged changes already exist;
- the current branch is not the expected deployment branch;
- the local branch is not aligned with its remote;
- GitHub cannot be reached;
- the deployment does not make the image available.

## Refresh reliability

`scripts/refresh-all.mjs` processes collections sequentially.

A failed collection does not immediately terminate the complete
refresh. The script performs:

1. the normal collection pass;
2. a second pass after a short delay;
3. a final pass after a longer delay.

Only collections that failed the preceding pass are retried.

The current retry delays are two minutes and ten minutes. Remaining
failures are reported at the end of the run.

A collection completed during a retry may have a later snapshot time
than neighbouring ranks.

## Daily automation on macOS

The reference production setup uses a local macOS `launchd` task,
scheduled once per day.

A public wrapper template is provided:

```bash
cp \
  scripts/refresh-all-launchd.example.sh \
  scripts/refresh-all-launchd.sh
```

The machine-specific wrapper is intentionally excluded from Git
because it contains local filesystem and executable paths.

A typical wrapper:

1. creates an individual log for the run;
2. maintains a link to the latest log;
3. prevents overlapping executions with a PID lock;
4. waits for the local `ord` service;
5. updates the catalogue;
6. indexes newly ranked collections;
7. refreshes active collections;
8. publishes collection images;
9. records the final execution status;
10. optionally sends an e-mail report.

The scheduler should run only while:

- the Mac is available;
- the Bitcoin node is synchronized;
- the `ord` server is running;
- the disk containing the indexes is mounted;
- required environment variables are available.

## Optional e-mail reports

`scripts/send-refresh-email.py` can send a success or failure report
through Gmail SMTP.

The report includes:

- the final pipeline status;
- start and completion times;
- the last lines of the execution log;
- the complete log as an attachment;
- automatic compression for large log files.

The Gmail application password must be stored in macOS Keychain. It
must not be written into the script, repository, launchd property list
or log files.

Failure to send the report does not change the actual indexing result.

## Methodological limitations

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

### Concentration is descriptive

A rising or falling concentration metric is not automatically positive
or negative.

Ownership concentration must not be treated as a buying or selling
signal.

### Collection membership depends on upstream definitions

ORDstats relies on curated collection definitions and external
catalogue information.

Changes to those sources can affect observed supply and ownership
structure.

### No financial advice

ORDstats is a research and data-exploration project.

Nothing in the application or repository constitutes financial,
legal or tax advice.

## Repository safety

Local operational data and credentials must remain outside Git.

The following content should not be committed:

- `.env` files, except `.env.example`;
- Supabase secrets;
- Gmail application passwords;
- private keys and certificates;
- execution logs;
- generated working snapshots;
- temporary ranking files;
- local PID and lock files;
- editor and operating-system files;
- backup files;
- the machine-specific launchd wrapper;
- machine-specific launchd property lists.

The following content is intentionally suitable for Git:

- application source code;
- public pipeline scripts;
- `.env.example`;
- the public launchd wrapper template;
- collection images required by the deployed application;
- documentation.

Before each commit, review:

```bash
git status --short
git diff --check
git diff
```

## Disclaimer

ORDstats is experimental software.

Data may be incomplete, delayed or affected by upstream definitions,
indexing state and software errors. Always verify important
information independently.
