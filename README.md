# Daml Skill for Claude

A Claude skill that gives any Claude/ Claude Code conversation correct knowledge of the Daml smart contract and Canton Network. Useful for developers writing, reviewing, or debugging Daml contracts.

## What it does

When you ask Claude about Daml templates, choices, authorization errors, multiparty workflows, testing with Daml Script, SDK setup, Canton 3.5 changes, the skill loads automatically and guides Claude to give correct, grounded answers rather than plausible-sounding guesses.

## Installation

```bash
npx @canton-network-devs/cf-daml-skill
```

Detects Claude Desktop automatically and installs directly to your skills folder. If Claude Desktop isn't found, it builds a `.zip` for manual upload instead by following the steps:

1. Go to **Claude.ai → Settings → Skills**
2. Click **Upload skill**
3. Select the `CF-daml-skill.zip` from your current directory

## What it's good at

- **Catching authorization errors before they hit the ledger**

The most common Daml failure mode isn't a syntax error it's an authorization chain that doesn't add up. The skill traces who needs to authorize what, and whether the parent transaction covers it.

- **Naming the right pattern**

Instead of improvising a workflow from scratch, the skill recognizes when Propose Accept, Delegation, or Multiple Party Agreement is the right structure, and gives you a correct skeleton rather than a plausible-looking one.

- **`createCmd` vs `create` and other context-dependent syntax**

`createCmd` is only valid inside `submit` blocks in Daml Script. `create` is only valid inside choice `do` blocks. This trips up almost everyone new to Daml. The skill catches this and corrects it.

- **Canton 3.5 / SDK 3.5 specifics**

The `daml` CLI is removed in SDK 3.5. Contract keys require `--target=2.3`. `daml-script` must not appear in production packages. Scope-based JWTs are deprecated. The skill knows all of this and applies it when relevant.

- **Pointing to `dpm trace` for transaction debugging**

When a transaction already ran or failed on a participant, the skill suggests [`dpm trace`](https://docs.walnut.dev/quickstart) to inspect the event tree, see why a submission was rejected, and compare transactions. It is installed separately.

- **Code review**

Paste a Daml file and ask for a review. The skill works through a checklist: module header, signatories, authorization chain, `ensure` clauses, choice return types, consuming/non-consuming correctness, `Cmd` suffix usage, test coverage.

## What it won't do

- It won't write your entire application for you without understanding the business logic
- It won't make authoritative claims about undocumented or rapidly-changing Canton Network APIs (it will say so)
- It won't replace running `dpm test` always test your code

## Triggers

The skill activates on questions about:

- Daml templates, choices, signatories, observers, controllers
- Authorization errors and why a transaction fails
- Inspecting or comparing committed transactions (`dpm trace`)
- Daml Script tests (`submit`, `submitMustFail`, `queryContractId`, etc.)
- Multi-party workflows and which pattern to use
- `daml.yaml` configuration and project structure
- `dpm` commands (build, test, studio, sandbox, codegen)
- Contract keys, interfaces, data types
- Canton 3.5 / SDK 3.5 migration
- Translating Ethereum/Solidity patterns to Daml
