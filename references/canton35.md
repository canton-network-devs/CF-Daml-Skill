# Canton 3.5 – 3.7 Reference

Last reviewed against the Canton release notes on 2026-11-24 (Canton 3.7.4, Splice 0.10.2,
dpm 1.1.0). Always confirm against https://docs.canton.network/release-notes when a user's
version differs.

## Version map

| Line | Protocol versions | Default Daml-LF | Status / notes |
|---|---|---|---|
| 3.4.x | 34 | 2.1 | Legacy; still seen in Splice packages built with SDK 3.4.11 |
| 3.5.x (to 3.5.19) | 34, 35 | 2.2 (2.3 with `--target=2.3`) | Maintenance fixes only; `dpm` replaces `daml` |
| 3.6.x (3.6.1–3.6.4) | 34, 35, 36 | **2.3** (from 3.6.1) | Daml-LF 2.4 stable, external calls, PV 36 |
| 3.7.x (3.7.0–3.7.4) | **36, 37** | 2.3 | PV 34/35 dropped; multi-synchronizer without a flag on PV 37; dpm 1.1.0+ |

Support policy (per Releases and Versioning): security and bug fixes go to the latest minor
and the second-to-last minor. Semantic versioning applies to stable APIs only; Alpha and Beta
features are not covered.

To move from 3.5 to 3.7, upgrade through a 3.6 release first: PV 34/35 synchronizers must be
upgraded before 3.7 will run them.

## What's new in 3.6 (relevant to Daml developers)

- **Default LF is now 2.3** (3.6.1). Keep 2.2 only with `--target=2.2`.
- **Daml-LF 2.4 stable + external calls**: choices can call participant-configured extension
  services during interpretation (needs LF 2.4 and PV 36). The submitting participant runs and
  records the call; confirming participants re-run it and reject mismatches. Externally signed
  transactions cover the recorded results through hashing scheme v4.
- **Daml Script**: new `ExternalCallError` (`PreparationFailed`, `ExecutionFailed`,
  `InvalidOutput`). Scripts can depend on packages built with other SDK versions through
  data-dependencies, but all daml-script versions must be 3.6.0+ and the runner must be at least
  as new as the newest daml-script in use.
- **Breaking Daml Script renames**: `SubmitError` → `AnySubmitError`,
  `UpgradeErrorType` → `AnyUpgradeErrorType`, `CryptoErrorType` → `AnyCryptoErrorType`,
  `ExternalCallErrorType` → `AnyExternalCallErrorType`, `DevErrorType` → `AnyDevErrorType`.
- **Stdlib**: `(:|)` and `(<|)` synonyms for `DA.NonEmpty`; `DA.Logic` `reduce`, `toNNF` and DNF
  conversion fixes.
- **Ledger API**: new `GetUpdateByHash`, `GetCompletionByHash` (useful for externally signed
  transactions), `GetJwks`, and the `ActAsAnyParty` right (granted by participant admin only).
  `/v2/state/active-contracts-page` is POST (GET deprecated). JSON API accepts a
  `Request-Timeout` header (units supported from 3.7.3, e.g. `15s`).
- **Deprecated endpoints are off by default** (`DEPRECATED_API_DISABLED`): transaction-tree and
  flat-transaction endpoints, `GetPreferredPackageVersion`, `/v2/package-vetting`. Re-enable per
  participant with `features.deprecated.enable-deprecated-endpoints-34` /
  `enable-deprecated-parameters-34` / `enable-deprecated-endpoints-35` only as a stopgap.
- **Scribe is now PQS** (`pqs.jar`, `PQS_*` env vars, `participant-query-store` image). Postgres
  username and password are mandatory. New SQL function `print_create_index_for_contract`.

## What's new in 3.7 (relevant to Daml developers)

- **Protocol 37**; PV 34 and 35 no longer supported. Multi-synchronizer works without the
  `EnableMultiSynchronizer` flag on PV 37.
- **dpm 1.1.0+ required.** Git-hosted DAR dependencies (`git:` mapping or one-liner
  `git:<host>/<owner>/<repo>#<ref>?path=<file>.dar`, GitHub release assets via
  `?release=<tag>&asset=<file>.dar`). `dpm add dar`, `dpm resolve`, `dpm update --check`.
  `dpm test` prints a summary at the end with only failures listed, grouped by file; coverage
  is hidden unless `--show-coverage`.
- **Ledger API**: `StateService` excludes incomplete reassignments by default
  (`includeIncompleteReassignments`); continuation and page token formats changed (old tokens
  fail with `INVALID_CONTINUATION_TOKEN` / `INVALID_ACS_PAGE_TOKEN`); new offset-from-record-time
  endpoint; submission IDs over 221 characters rejected; `PrepareSubmission` cost estimates can
  include `reassignment_costs`.
- **3.7.4**: commands whose minimum ledger time is more than 5 minutes ahead are rejected with
  `INVALID_FIELD` (tune `min-ledger-time-max-delay`); `UnvetDar` unvets only the main package by
  default (`UNVET_SCOPE_ALL_DAR_PACKAGES` restores the old behavior).
- **Deprecated**: `TrafficService.PruneEvents` / `POST /v2/traffic/events/prune` → use
  `TrafficService.Prune` / `POST /v2/traffic/prune` (disabled by default in 3.8, removed in 3.9).
- **Maven Central**: `daml-script-runner`, `script-converter`, `auth-utils`,
  `daml-script-stable-packages-lib`, `timer-utils` no longer published (only matters if you
  depend on those coordinates directly; dpm users are unaffected).
- **Traffic credit interface (experimental, 3.7.3)**: package `canton-api-traffic-credit-v1`
  with `TrafficCreditReporter` / `PublishCredit`; replaces `TrafficPurchaser`. May change.

## Splice changes that affect Daml authors

(Splice 0.6.x → 0.10.x; Splice packages are consumed through `data-dependencies`.)

- **Token Standard V2 (CIP-112)** shipped in Splice 0.6.11: committed and iterated Amulet
  allocations, burn allocations, V2 transfers, `tokenStandardMaxTTL` (default 90 days),
  `BatchingUtilityV2`.
- **Splice 0.10.0**: `requestedAt` must be within 24 h of submission; memo prefixes
  `splice/memo` and `cip-*/memo` are reserved; governance locks (CIP-127); traffic purchases via
  token standard transfers; `FeaturedAppRight` gains `appKind` / `opsParties` and `UpdateConfig`.
- **Traffic-based app rewards (CIP-104)**: `RewardCouponV2` and `rewardConfig` from 0.6.7;
  `FeaturedAppRight` weight from 0.6.12; asset-side issuance fields in 0.10.2.
- **Removed**: `TransferCommand` (0.8.0 / 0.9.0), Scan v0/v1 ACS and holdings endpoints (use v2),
  SV `/v0/dso`, Scan `/transactions`. Rollback nodes are gone with PV 35 and `InvalidTransfer`
  exceptions became `failWithStatus` (0.6.1).
- Splice pairs with Canton: 0.9.x ↔ 3.6.x, 0.10.x ↔ 3.7.x. Token Standard interfaces stay
  compatible across Splice upgrades; Splice templates and choices are not a public API.

## Integration SDKs (not Daml, but users often ask)

Wallet Gateway 1.15.0, Wallet SDK 1.5.1 and dApp SDK 1.8.0 are current as of 2026-11-24.
They move quickly; point users to their release notes under
https://docs.canton.network/release-notes rather than quoting breaking changes from memory.

## What's new and breaking in 3.5

### `daml` CLI is gone, use `dpm` for everything
The Daml Assistant (`daml` CLI) is fully removed in SDK 3.5. All commands are now `dpm`.

| Old command | New command |
|---|---|
| `daml new <name>` | `dpm new <name>` |
| `daml build` | `dpm build` |
| `daml test` | `dpm test` |
| `daml studio` | `dpm studio` |
| `daml sandbox` | `dpm sandbox` |
| `daml codegen java` | `dpm codegen-java` |
| `daml codegen js` | `dpm codegen-js` |
| `daml damlc inspect-dar` | `dpm damlc inspect-dar` |
| `daml damlc lint` | `dpm damlc lint` |

### Protocol Version 35 and Daml-LF 2.3

Canton 3.5 supports two protocol versions:
- **PV 34 (default)**: behaves like Canton 3.4; Daml-LF 2.2; no contract keys
- **PV 35 (opt-in)**: Daml-LF 2.3; contract keys; new hashing scheme v3

To opt into PV 35 features (required for contract keys):
```yaml
# daml.yaml
sdk-version: 3.5.1
build-options:
  - --target=2.3
```
Also bump your package `version` field when you do this (package ID changes).

### Package-name addressing only (PV 34 and 35)
The old package-ID reference format for Ledger API read queries is **removed** in 3.5.
Use package-name format:
```
#<package-name>:<Module>:<Template>
```
Example: `#my-app:Licensing.License:License`

This affects: `GetUpdates`, `GetActiveContracts`, `GetEventsByContractId`, and others.

### Daml exceptions are effectively unusable in PV 35
PV 35 does not support rolling back write effects in try-catch blocks. If a consuming
choice or create happens inside a try block before the exception is caught, the whole
transaction hard-fails.

**Mitigation**: Replace exception-based control flow with explicit status ADTs:
```daml
-- Instead of throwing an exception:
data Result a
  = Ok a
  | Err Text
  deriving (Eq, Show)
```
Or use `assertMsg` to fail-fast with a clear message.

### `synchronizer_id` format changed in PV 35
Adds a `::35-0` suffix. Treat `synchronizer_id` as an opaque string — do not parse it.

## daml.yaml — full reference (Canton 3.5 – 3.7)

```yaml
# Minimum viable production package (Canton 3.4 era / Splice-compatible)
sdk-version: 3.4.11       
name: my-workflows        
version: 1.0.0
source: daml
dependencies:
  - daml-prim             
  - daml-stdlib           

# Test package (separate from production)
sdk-version: 3.5.1
name: my-workflows-tests
version: 1.0.0
source: daml
dependencies:
  - daml-prim
  - daml-stdlib
  - daml-script          
data-dependencies:
  - ../.daml/dist/my-workflows-1.0.0.dar  

# To use contract keys (LF 2.3 / PV 35 features):
sdk-version: 3.5.1
name: my-package
version: 1.0.0         
source: daml
dependencies:
  - daml-prim
  - daml-stdlib
build-options:
  - --target=2.3
```

### `dependencies` vs `data-dependencies`
| | `dependencies` | `data-dependencies` |
|---|---|---|
| Use for | `daml-prim`, `daml-stdlib`, `daml-script` | Third-party DARs, cross-SDK packages, packages from the ledger |
| Requires | `.hi` files (source info) | `.dalf` binary only |
| Cross-SDK | No | Yes |
| What you get | Full typeclass instances, functions | Templates, choices, data types only |

## Multi-package project structure

```
my-project/
├── multi-package.yaml        # lists all sub-packages
├── workflows/
│   ├── daml.yaml             # production package (no daml-script)
│   └── daml/
│       └── MyWorkflow.daml
└── workflows-tests/
    ├── daml.yaml             # test package (includes daml-script)
    └── daml/
        └── MyWorkflowTests.daml
```

```yaml
# multi-package.yaml
packages:
  - ./workflows
  - ./workflows-tests
```

```bash
dpm build --all    
dpm test           
```

**Why separate packages?**
- `daml-script` must never be deployed to a production ledger
- Changing a test changes the package hash of everything in that package
- Workflows and tests evolve at different rates — decouple them

## Contract keys — Canton 3.5 specifics

### Requirements
- `--target=2.3` in build-options (or `sdk-version` >= 3.5)
- Protocol Version 35 on the synchronizer

### Key rules
1. Keys are **not unique** — multiple contracts can share the same key
2. Negative lookups are **not validated** by the ledger
3. Key uniqueness is the **application's responsibility**
4. `maintainer` must be expressed in terms of `key`, and must be a signatory
5. You **cannot add or remove a key** definition from a template in a later version
   (SCU constraint — the key type and maintainer must stay identical)

### Lookup order when multiple contracts share a key
1. Contracts created in the current transaction (most recent first)
2. Explicitly disclosed contracts (in command order)
3. Participant-known contracts (recency order, but not guaranteed)

### Performance note
Optimized for 0 or 1 contract per key. `lookupNByKey`/`lookupAllByKey` (from
`DA.ContractKeys`) work but may be slower when many contracts share a key.

### Interactive Submission Service with contract keys
If you use contract keys with the `InteractiveSubmissionService`, you must use
`HASHING_SCHEME_VERSION_V3` (available from PV 35).

## Ledger API changes relevant to app developers

### `GetActiveContracts` stream — new continuation token
```
stream_continuation_token
```
Allows resuming an interrupted ACS stream from the last received element.

### Pagination for `GetUpdates`
New `GetUpdatesPage` endpoint supports paginated (non-streaming) access to updates.
New `descending_order` parameter for reverse-chronological streaming.

### JWT tokens: scope-based deprecated
Scope-based JWT tokens (identified by `scope` claim) are deprecated in 3.5, log a warning
in 3.6, and were announced for removal in 3.7. Migrate to audience-based tokens
(`aud` claim).

### PQS: use `prune_archived_to_offset` not `prune_to_offset`
`prune_to_offset` is deprecated — can cause deadlocks.
`prune_archived_to_offset` is non-blocking and 10x faster.

### PQS contract key support

```sql
SELECT contract_id, payload
FROM __contracts
WHERE contract_key = jsonb_build_object('_1', 'party-id', '_2', 'ACC-001')
ORDER BY created_at_ix;
```

## Common Canton 3.5 migration issues

### "Template not found" errors after upgrade
Likely caused by package-ID addressing being removed. Switch to package-name format
in all Ledger API read queries.

### Tests pass but deployment fails
Check that `daml-script` is NOT in your production `daml.yaml` dependencies.

### Contract keys compile but don't work at runtime
Verify that the synchronizer is running PV 35 (not PV 34). PV 34 does not support keys.

### Exception handling broke in PV 35
Remove try-catch blocks that contain write effects (create/exercise). Use status ADTs
or `assertMsg` instead.

### `daml` command not found
The Daml Assistant is removed. Install `dpm` and use `dpm` for all commands.
Remove `~/.daml/bin` from PATH if it's still there.

## Canton environment quick reference

| Environment | Purpose | Auth |
|---|---|---|
| LocalNet | Full local Canton stack via `splice-node.tar.gz` | HS256 JWT, secret `unsafe` |
| DevNet | Shared developer network | Onboarding via https://dev-hub.canton.foundation |
| TestNet | Pre-production | Standard OIDC |
| MainNet | Production | Standard OIDC |

```bash
# LocalNet JWT (for testing only never in production)
# Secret: "unsafe", algorithm: HS256
```

New releases roll out DevNet first, then TestNet, then MainNet; check the Splice version a
network runs before choosing `sdk-version`.