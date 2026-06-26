# Canton 3.5 Reference

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

## daml.yaml — full reference for Canton 3.5

```yaml
# Minimum viable production package
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
Scope-based JWT tokens (identified by `scope` claim) are deprecated in 3.5, removed
in 3.7. Migrate to audience-based tokens (`aud` claim).

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
| DevNet | Shared developer network | Invite codes from jatin@canton.foundation |
| TestNet | Pre-production | Standard OIDC |
| MainNet | Production | Standard OIDC |

```bash
# LocalNet JWT (for testing only never in production)
# Secret: "unsafe", algorithm: HS256
```

OIDC is only required for off-chain Ledger API calls, not for DAR deployment via Seaport UI.