# Daml Language Reference

## Table of contents

1. Native types
2. Data types (records, variants, Optional)
3. Functions and control flow
4. Templates
5. Signatories and observers
6. Choices
7. Daml Script
8. Interfaces
9. Contract keys (Canton 3.5+)
10. Standard library essentials


## 1. Native types

| Type | Notes |
|---|---|
| `Party` | Opaque identity — cannot be forged; do not parse or construct |
| `Text` | Unicode string |
| `Int` | Signed 64-bit integer |
| `Decimal` | Fixed-point: 28 digits before, 10 after decimal point. Alias for `Numeric 10` |
| `Bool` | `True` / `False` |
| `Date` | Calendar date |
| `Time` | Absolute UTC time |
| `RelTime` | Relative time difference |
| `ContractId a` | Typed ledger reference; `a` is the template type |
| `Optional a` | `Some a` or `None` — Daml's null replacement |

## 2. Data types

### Records
```daml
data Cash = Cash with
    currency : Text
    amount   : Decimal
  deriving (Eq, Show)
```
- `deriving (Eq, Show)` — always include; required for `==` and debug output
- Also derive `Ord` when you need `<`, `>`, `<=`, `>=`
- Field access: `cash.amount`, `cash.currency`
- Record update (immutable copy): `cash with amount = cash.amount * 2.0`

### Variants (sum types)
```daml
data AssetStatus
  = Active
  | Frozen
  | Settled Text    -- carries a reason as payload
  deriving (Eq, Show)
```
- Pattern match to extract: `case status of { Active -> ...; Frozen -> ...; Settled r -> ... }`
- Prefer ADT status over `Text` status fields — typos become compile errors

### Optional
```daml
-- Use instead of null/None/empty string
findBySymbol : [Asset] -> Text -> Optional Asset
findBySymbol [] _ = None
findBySymbol (x::xs) sym =
  if x.symbol == sym then Some x else findBySymbol xs sym
```

### Tuples
- `(Party, Text)` — 2-tuple; access with `._1`, `._2`
- `fst`, `snd` for 2-tuples; `fst3`, `snd3`, `thd3` for 3-tuples
- Prefer named records for anything stored in a template or returned from a choice

### Lists
- `[a]` — singly linked list; `x :: xs` prepends; `[]` is empty
- Access by index with `(!!)` is O(n) — avoid for loops; use `map`, `foldl`, `zip` instead
- `mapA f xs` — maps a function producing an `Update` or `Script` action over a list


## 3. Functions and control flow

### Function signatures
```daml
-- Type annotation (recommended for top-level functions)
totalAmount : [Cash] -> Decimal
totalAmount items = foldl (\acc c -> acc + c.amount) 0.0 items
```

### if-else (expression, not statement)
```daml
classify : Decimal -> Text
classify n = if n > 1000.0 then "Large" else "Small"
```
Both branches must return the same type.

### Case expression
```daml
describeStatus : AssetStatus -> Text
describeStatus s = case s of
  Active      -> "Active"
  Frozen      -> "Frozen"
  Settled r   -> "Settled: " <> r
```

### Guards
```daml
tier : Decimal -> Text
tier amount
  | amount < 0.0    = "Invalid"
  | amount == 0.0   = "Zero"
  | amount < 1000.0 = "Retail"
  | otherwise       = "Institutional"
```

### `when` — conditional action
```daml
-- Only fires if condition is True; does nothing otherwise
when (quantity > 0.0) (void (create SomeContract with ...))
```

### `void` — discard a return value
```daml
-- When you exercise a choice but don't need its return value
void (exercise cid SomeChoice with ...)
```

### Lambdas
```daml
double = map (\x -> x * 2) [1, 2, 3]
```

### `let` in do-blocks
```daml
do
  let fee = amount * 0.001
  let net = amount - fee
  create Payment with ...
```

### `foldl` and `map`
```daml
-- Sum a list of amounts
total = foldl (\acc x -> acc + x) 0.0 amounts

-- Transform each element
symbols = map (\a -> a.symbol) assets

-- Map with side effects (Action context)
cids <- mapA (\a -> create a) assetsToCreate
```

## 4. Templates — structure

```daml
template MyContract
  with
    -- Fields (data stored on the contract)
    issuer    : Party
    owner     : Party
    info      : MyRecord
    observers : [Party]      -- dynamic observer lists are common
  where
    -- Required: at least one signatory
    signatory issuer, owner

    -- Optional: read-only visibility
    observer observers

    -- Optional: reject contract if False at creation time
    ensure info.quantity > 0.0

    -- Choices go here (see section 6)
```

Key rules:
- `with` block = the contract's data schema
- `where` block = the contract's rules and behavior
- `this` inside `where` block refers to the current contract's field values
- Template fields are in scope throughout the `where` block

## 5. Signatories and observers

### Signatories
- Required to authorize `create` of this contract
- Required to authorize `archive` of this contract (via the implicit `Archive` choice)
- **Guaranteed to see** every create and archive event
- Must include at least one party

```daml
signatory issuer                -- single
signatory issuer, owner         -- multiple (all must consent to create/archive)
signatory [party1, party2]      -- from a list
signatory (signatory nestedIou) -- extract signatories from a nested record
```

### Observers
- **See** create and archive events (and other actions — via Principle 2)
- Cannot exercise choices (unless also a controller)
- Do not need to authorize anything

```daml
observer counterparty
observer recipients             -- [Party] list — all get visibility
observer regulator, auditor     -- multiple
```

### The authorization model (formal)
Every action has **required authorizers**. Every transaction has **authorizers**.

Rule: required authorizers of every action ⊆ authorizers of the parent transaction.

- **Create action**: required authorizers = signatories of the new contract
- **Exercise action**: required authorizers = controllers of the choice
- **Archive action**: required authorizers = signatories (it's an implicit `Archive` choice)

The root transaction is authorized by the submitting party.
The consequences of an exercise are authorized by:
- The actors of that choice (the controllers who exercised it)
- PLUS the signatories of the contract on which the choice was exercised

**Authority is NOT transitive** — Bob having Alice's authority in transaction A does not
give Bob Alice's authority in a new nested action unless that action's parent transaction
is authorized by Alice.

## 6. Choices — full anatomy

```daml
    -- Consuming (default): archives this contract when exercised
    choice Transfer : ContractId SimpleIou
      with
        newOwner : Party          -- choice arguments (like function parameters)
      controller owner            -- who can exercise this choice
      do
        -- Transaction body: can create, exercise, fetch, archive
        create this with owner = newOwner

    -- Non-consuming: contract survives
    nonconsuming choice GetBalance : Decimal
      controller owner
      do
        return balance

    -- Multiple controllers: ALL must authorize
    nonconsuming choice MutualAction : ()
      controller owner, counterparty
      do
        return ()
```

### Inside a choice `do` block

- `create T with ...` — create a contract (NOT `createCmd`)
- `exercise cid Choice with ...` — exercise a choice (NOT `exerciseCmd`)
- `fetch cid` — read a contract's fields; requires at least one stakeholder to authorize
- `archive cid` — shorthand for `exercise cid Archive`
- `assertMsg "reason" condition` — abort transaction with message if False
- `return value` / `pure value` — return a value without side effects
- `this` — the current contract's fields (full record)
- `self` — the current contract's `ContractId`

### `createCmd` vs `create`

| | Where used | Context |
|---|---|---|
| `createCmd` | Inside `submit` blocks in Daml Script | Script/client side |
| `create` | Inside choice `do` blocks | Ledger/server side |
| `exerciseCmd` | Inside `submit` blocks in Daml Script | Script/client side |
| `exercise` | Inside choice `do` blocks | Ledger/server side |

This is one of the most common errors. Wrong: `createCmd` in a choice body. Always `create`.

## 7. Daml Script — testing API

```daml
import Daml.Script

myTest : Script ()
myTest = script do
  -- Allocate parties (only exist in this test)
  alice <- allocateParty "Alice"
  bob   <- allocateParty "Bob"

  -- Submit as a single party
  cid <- submit alice do
    createCmd MyContract with owner = alice; ...

  -- Submit as multiple parties (when multiple signatories required)
  cid2 <- submitMulti [alice, bob] [] do
    createCmd MutualContract with party1 = alice; party2 = bob; ...

  -- Exercise a choice
  result <- submit alice do
    exerciseCmd cid MyChoice with arg1 = "value"

  -- Assert a transaction MUST be rejected (negative test)
  submitMustFail bob do
    exerciseCmd cid SomeRestrictedChoice

  -- Query the ledger
  Some contract <- queryContractId alice cid   -- returns Optional
  assert (contract.owner == alice)

  -- Advance ledger time
  passTime (days 7)
  setTime (time (date 2026 Jan 1) 9 0 0)

  pure ()

```

### Key Script functions

| Function | Type | Purpose |
|---|---|---|
| `allocateParty` | `Text -> Script Party` | Create a test party |
| `submit party do ...` | `Script a` | Submit commands as one party |
| `submitMulti [p1,p2] [] do ...` | `Script a` | Submit as multiple parties |
| `submitMustFail party do ...` | `Script ()` | Assert transaction fails |
| `queryContractId party cid` | `Script (Optional t)` | Fetch contract by ID |
| `queryFilter @T party pred` | `Script [(ContractId T, T)]` | Filter ACS |
| `assert cond` | `Script ()` | Fail test if False |
| `assertMsg "msg" cond` | `Script ()` | Fail with message if False |
| `passTime relTime` | `Script ()` | Advance ledger time |
| `setTime time` | `Script ()` | Set ledger time absolutely |
| `getTime` | `Update Time` | Get current ledger time (1-min window constraint) |

## 8. Interfaces

```daml
-- Define an interface
data TokenView = TokenView with
    owner    : Party
    symbol   : Text
    quantity : Decimal
  deriving (Eq, Show)

interface IToken where
  viewtype TokenView

  getOwner : Party
  getQuantity : Decimal

  choice Transfer : ContractId IToken
    with newOwner : Party
    controller getOwner this
    do ...

-- Implement the interface on a template
template MyToken
  with
    owner    : Party
    symbol   : Text
    quantity : Decimal
  where
    signatory owner

    interface instance IToken for MyToken where
      view = TokenView with owner; symbol; quantity
      getOwner = owner
      getQuantity = quantity
```

### Interface conversion functions

| Function | Purpose |
|---|---|
| `toInterface @I contract` | Template value → interface value |
| `fromInterface @T iface` | Interface value → `Optional T` |
| `toInterfaceContractId @I cid` | `ContractId T` → `ContractId I` |
| `fromInterfaceContractId @T cid` | `ContractId I` → `ContractId T` (unsafe) |
| `fetchFromInterface @T cid` | Fetch and convert safely → `Optional (ContractId T, T)` |

Canton Network standard interfaces:

- **CIP-0056** (Token Standard) — implement for any fungible token

- **CIP-0103** (dApp Standard) — implement for dApp interoperability

## 9. Contract keys (Canton 3.5+ / Daml-LF 2.3)

```daml
-- Requires --target=2.3 in build-options

type AccountKey = (Party, Text)

template Account
  with
    bank    : Party
    number  : Text
    owner   : Party
    balance : Decimal
  where
    signatory bank, owner

    key (bank, number) : AccountKey
    maintainer key._1  -- bank is the maintainer; must be a signatory
```

Rules:

- `key` expression must include a `Party` (for scoping/privacy)
- `maintainer` must be expressed in terms of `key`, and must be a signatory
- Keys are **not unique by default** in Canton 3.5 — multiple contracts can share a key
- Key uniqueness is the app's responsibility, not the ledger's

### Key-based operations

```daml
-- Inside a choice (Update context):
optCid <- lookupByKey @Account (bank, "ACC-001")   -- Optional ContractId
(cid, acct) <- fetchByKey @Account (bank, "ACC-001")
exerciseByKey @Account (bank, "ACC-001") Deposit with amount = 100.0

-- In Daml Script (Script context):
optResult <- queryByKey @Account alice (bank, "ACC-001")
result <- alice `submit` do
  exerciseByKeyCmd @Account (bank, "ACC-001") Deposit with amount = 100.0
```

### Multi-contract key lookups (import DA.ContractKeys)
```daml
import DA.ContractKeys

results <- lookupNByKey @Account 5 (bank, "ACC-001")   -- up to 5 matches
```

## 10. Standard library essentials

### DA.List
```daml
import DA.List
head [1,2,3]          -- 1  (partial — fails on empty list)
tail [1,2,3]          -- [2,3]
length [1,2,3]        -- 3
zip [1,2] ["a","b"]   -- [(1,"a"),(2,"b")]
sortOn (.amount) xs   -- sort by field
groupOn (.currency) xs -- group by field
null []               -- True
```

### DA.Optional
```daml
import DA.Optional
fromSome (Some 42)     -- 42 (partial — fails on None)
fromOptional 0 None    -- 0 (default value)
isSome (Some 42)       -- True
isNone None            -- True
mapOptional f (Some x) -- Some (f x)
```

### DA.Text
```daml
import DA.Text
show 42                -- "42"
T.length "hello"       -- 5
T.isUpper "ABC"        -- True
"Hello" <> " " <> "World"  -- "Hello World"  (concatenation)
```

### DA.Date / DA.Time
```daml
import DA.Date
import DA.Time
date 2026 Jan 15           -- Date value
time (date 2026 Jan 15) 9 0 0  -- Time value
days 7                     -- RelTime
hours 2                    -- RelTime
addRelTime t (hours 1)     -- advance a Time by RelTime
```

### Numeric operations
```daml
import Numeric (roundBankers)
roundBankers 2 3.14159     -- 3.14 (banker's rounding to 2dp)
```