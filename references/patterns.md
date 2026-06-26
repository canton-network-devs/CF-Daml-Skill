# Daml Design Patterns

Canonical patterns for multi-party workflows on Canton Network. Each pattern includes when to use it, the key structural insight, and a minimal code skeleton.


## 1. Propose-Accept

**When to use:** Two parties need to agree on a shared contract. One proposes; the other accepts, rejects, or lets it expire. This is the most fundamental Canton pattern, use it whenever you can't unilaterally impose a contract on another party (which is almost always).

**Key insight:** The proposal contract carries the proposer's authority as signatory. When the recipient exercises `Accept`, their authority is added, and the resulting contract can have both as signatories, mutual consent without any off-chain coordination.

```daml
-- Step 1: Proposal (only proposer signs)
template IouProposal
  with
    issuer    : Party
    recipient : Party
    cash      : Cash
  where
    signatory issuer
    observer  recipient

    choice IouProposal_Accept : ContractId MutualIou
      controller recipient
      do
        create MutualIou with issuer; owner = recipient; cash

    choice IouProposal_Reject : ()
      controller recipient
      do return ()

    choice IouProposal_Withdraw : ()
      controller issuer
      do return ()

-- Step 2: Live contract (both sign)
template MutualIou
  with
    issuer : Party
    owner  : Party
    cash   : Cash
  where
    signatory issuer, owner

    choice Settle : ()
      controller owner
      do return ()
```

**Always include:** Accept + Reject + Withdraw (or Cancel). Without Reject/Withdraw, the proposal becomes an unrevocable option that the proposer can never escape.

**Naming convention:** Qualify choice names: `IouProposal_Accept`, not just `Accept`. Each choice defines a record type; name collisions across templates cause compile errors.

## 2. Delegation (Role contracts)

**When to use:** One party grants another ongoing permission to act on their behalf without requiring fresh consent for each individual action. Models custodian relationships, power-of-attorney, pre-authorized agents.

**Key insight:** The principal creates a role contract signed by themselves. The agent is an observer (sees the contract). The agent's choices on the role contract can then exercise choices on the principal's assets, because the role contract's signatories (the principal) are in scope as authorizers for the consequences.

```daml
-- Pre-authorized permission
template IouSender
  with
    sender   : Party    -- the agent
    receiver : Party    -- the principal grants sender the right to send to receiver
  where
    signatory receiver  -- RECEIVER signs — they're granting permission
    observer  sender

    -- Agent can use this to send Ious to receiver
    nonconsuming choice Send_Iou : ContractId Iou
      with iouCid : ContractId Iou
      controller sender
      do
        iou <- fetch iouCid
        assert (sender == iou.owner)
        exercise iouCid Mutual_Transfer with newOwner = receiver
```

**Non-consuming**: role contracts should almost always be non-consuming so the agent can use them multiple times.


## 3. Authorization token

**When to use:** A controller wants to verify that a party has been whitelisted before they can take an action. The authorizing party issues a token; the action body fetches and verifies it.

**Key insight:** The token contract is signed by the authorizer. Requiring it as a choice argument means the ledger verifies it exists and is authentic. No off-chain database needed.

```daml
-- Authorizer issues this to approved parties
template KycApproval
  with
    issuer    : Party    -- the KYC authority
    recipient : Party    -- the approved party
  where
    signatory issuer
    observer  recipient

    choice KycApproval_Revoke : ()
      controller issuer
      do return ()

-- In the template that needs KYC:
    choice Transfer : ContractId Asset
      with
        newOwner    : Party
        kycApproval : ContractId KycApproval
      controller owner
      do
        approval <- fetch kycApproval
        assertMsg "KYC approval issuer mismatch" (approval.issuer == issuer)
        assertMsg "KYC approval recipient mismatch" (approval.recipient == newOwner)
        create this with owner = newOwner
```

## 4. Locking (state-change variant)

**When to use:** An asset must be frozen during a settlement or clearing process. A third party (the locker) needs to prevent transfer until they release it.

**Key insight:** Add a `locker : Party` field. When `locker == owner`, the asset is unlocked (owner controls themselves). When they differ, the locker controls unlock.

```daml
template LockableAsset
  with
    owner  : Party
    issuer : Party
    locker : Party    -- set to owner when unlocked
    amount : Decimal
  where
    signatory issuer, owner
    observer locker
    ensure amount > 0.0

    choice Transfer : ContractId TransferProposal
      with newOwner : Party
      controller owner
      do
        assertMsg "Cannot transfer a locked asset" (locker == owner)
        create TransferProposal with asset = this; newOwner

    choice Lock : ContractId LockableAsset
      with newLocker : Party
      controller owner
      do
        assertMsg "Cannot lock to self" (newLocker /= owner)
        create this with locker = newLocker

    choice Unlock : ContractId LockableAsset
      controller locker
      do
        assertMsg "Already unlocked" (locker /= owner)
        create this with locker = owner
```

## 5. Multiple party agreement

**When to use:** More than two parties must all sign a contract before it becomes binding. Each signs separately (asynchronously) and in any order.

**Key insight:** A `Pending` wrapper contract tracks who has signed so far. It is observable by all required signatories. Each `Sign` exercise adds a party to `alreadySigned`. When complete, any party calls `Finalize` to create the final contract.

```daml
template Agreement
  with
    signatories : [Party]
    content     : Text
  where
    signatory signatories
    ensure unique signatories

template Pending
  with
    finalContract : Agreement
    alreadySigned : [Party]
  where
    signatory alreadySigned
    observer  finalContract.signatories
    ensure unique alreadySigned

    choice Sign : ContractId Pending
      with signer : Party
      controller signer
      do
        let remaining = filter (`notElem` alreadySigned) finalContract.signatories
        assertMsg "Party is not a required signatory" (signer `elem` remaining)
        create this with alreadySigned = signer :: alreadySigned

    choice Finalize : ContractId Agreement
      with signer : Party
      controller signer
      do
        assertMsg "Not all parties have signed"
          (sort alreadySigned == sort finalContract.signatories)
        create finalContract
```

## 6. Transfer proposal (three-party / issuer-controlled)

**When to use:** Transfers need the issuer's ongoing consent, not just the current owner's. Common for regulated assets where the issuer controls who may hold the asset.

**Key insight:** The transfer goes through a proposal that requires issuer + newOwner to co-authorize, rather than owner + newOwner. This means the issuer can block transfersto non-approved parties simply by not accepting.

```daml
template Asset
  with
    issuer : Party
    owner  : Party
    symbol : Text
    quantity : Decimal
  where
    signatory issuer, owner
    ensure quantity > 0.0

    -- Owner proposes transfer; issuer + newOwner must both agree
    choice ProposeTransfer : ContractId TransferProposal
      with newOwner : Party
      controller owner
      do
        create TransferProposal with issuer; currentOwner = owner; newOwner; symbol; quantity

template TransferProposal
  with
    issuer       : Party
    currentOwner : Party
    newOwner     : Party
    symbol       : Text
    quantity     : Decimal
  where
    signatory issuer, currentOwner
    observer  newOwner

    -- newOwner accepts; issuer's authority already present as co-signatory
    choice AcceptTransfer : ContractId Asset
      controller newOwner
      do
        create Asset with issuer; owner = newOwner; symbol; quantity

    choice DeclineTransfer : ()
      controller newOwner
      do return ()

    choice CancelTransfer : ()
      controller currentOwner
      do return ()
```

## 7. Observable event (audit trail)

**When to use:** You need a permanent, immutable record of something happening — for audit, compliance, or indexing purposes. The record should be visible to regulators/ auditors without giving them write access.

**Key insight:** Create a contract that can never be exercised (no choices, or only an Archive for the creator). Add regulators/auditors as observers. The contract creation event becomes the immutable ledger record.

```daml
template SettlementRecord
  with
    settler   : Party
    asset     : Text
    amount    : Decimal
    timestamp : Time
    auditor   : Party
  where
    signatory settler
    observer  auditor
    -- No choices — this is a permanent audit record
    -- (auditor can see it; only settler can archive it via implicit Archive)
```

## Pattern selection guide

| Situation | Pattern |
|---|---|
| Two parties need to agree on a new contract | Propose-Accept |
| Party A authorizes party B to act on their behalf repeatedly | Delegation / Role contracts |
| Need to verify a party has been whitelisted | Authorization token |
| Asset must be frozen during settlement | Locking |
| 3+ parties must all sign before contract is live | Multiple party agreement |
| Issuer needs ongoing control over who holds assets | Transfer proposal (3-party) |
| Need an immutable audit record visible to regulator | Observable event |
| Party needs to counter-propose different terms | Propose-Accept with `Counter` choice |

## Composing patterns

Patterns compose naturally. A real workflow might be:

1. KYC Authorization token issued to approved counterparties
2. Transfer proposal that verifies KYC token on acceptance
3. Resulting mutual asset that is lockable for settlement
4. Settlement record created automatically on lock release

Each contract in the chain carries the minimum authority needed for its role. No party accumulates more power than the workflow requires.
