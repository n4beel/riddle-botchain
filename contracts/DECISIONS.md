# Architecture Decisions & Invariants — Riddle

## 1. Product Architecture & Protocol Boundaries

Riddle is a native BOT riddle escrow contract where creators deposit a prize pool and post a riddle question (up to 140 bytes) alongside the keccak256 hash of the normalized answer. The prize pool is split 50% / 30% / 20% among the first three distinct solvers who prove knowledge of the answer via a front-running resistant commit-reveal scheme.

### Core Protocol Decisions

1. **Front-Running Resistant Commit-Reveal Scheme**:
   - Solvers commit a blinded hash:
     $$\text{commitment} = \text{keccak256}(\text{abi.encode}(id, \text{msg.sender}, \text{normalize}(answer), salt))$$
   - Because the commitment binds the solver's address and the specific puzzle ID, bots monitoring the mempool cannot steal or front-run the solver's answer by replaying the commitment or copying the revealed answer.
   - Solvers must wait until at least the next block before revealing:
     $$\text{block.number} > \text{\_committedBlock}[id][\text{msg.sender}]$$
   - This prevents same-block flashbots bundle extraction where a searcher includes a commit and reveal in the exact same block ahead of the original solver.

2. **Strict Normalized Answers**:
   - Answers are canonicalized both on-chain and off-chain:
     - ASCII uppercase converted to lowercase (`A-Z` $\to$ `a-z`).
     - Leading and trailing whitespace stripped.
     - Multiple consecutive whitespace characters collapsed to a single space.
   - Case sensitivity and spacing discrepancies cannot cause unintended mismatches.

3. **50% / 30% / 20% Tiered Payouts**:
   - 1st verified solver: 50% of the initial prize pool.
   - 2nd verified solver: 30% of the initial prize pool.
   - 3rd verified solver: 20% of the initial prize pool.
   - Each solver can only solve once per puzzle (`_hasSolved[id][solver]`).
   - Subsequent reveal attempts revert with `PrizesTaken`.

4. **Creator Reclaim & Rounding Dust**:
   - If the riddle expires (`block.timestamp >= deadline`), the creator can reclaim all unawarded pool funds.
   - If all 3 winners are rewarded, the creator may immediately reclaim any leftover division rounding dust without waiting for the deadline.
   - Reclaiming is guarded by `p.reclaimed = true` against double-reclaims.
   - The creator cannot solve their own riddle (`CreatorCannotSolve`).

5. **Pull Payments via `withdraw()`**:
   - All solver winnings and creator reclaims credit `pending[address]`.
   - Solvers and creators pull their balances via `withdraw()`, implementing Checks-Effects-Interactions and `nonReentrant`.

---

## 2. Invariants & Formal Properties

The contract was formally verified via stateful invariant testing (`contracts/test/RiddleInvariant.t.sol`) across 128,000 calls and 256 runs with 0 reverts:

1. **Balance Conservation**:
   $$\text{balance} == \sum \text{pending} + \sum (\text{remaining pools of unreclaimed puzzles})$$
   - Every single wei entering the contract via `create()` is accounted for in either active puzzle pools or `pending` pull payment balances.

2. **Max Three Distinct Winners**:
   $$\forall \text{ puzzle } i: \quad \text{solved} \le 3 \land (\text{winners are non-zero and pairwise distinct})$$
   - No puzzle ever records more than 3 winners, and no address can claim multiple prize slots for the same puzzle.

3. **Payout Conservation**:
   $$\forall \text{ puzzle } i: \quad \sum_{k=0}^{\text{solved}-1} \text{payout}_k + \text{remaining} == \text{pool}$$
   - Sum of paid prizes plus remaining reclaimable funds equals the exact deposited prize pool down to the single wei.

---

## 3. Mutation Analysis

25 deliberate mutants were tested against the test suite to ensure comprehensive branch and logic coverage:

| Mutant ID | Target / Function | Mutation Description | Result |
|---|---|---|---|
| M01 | `create` | Removed `msg.value == 0` check (`NoPrize`) | KILLED |
| M02 | `create` | Removed `answerHash == bytes32(0)` check (`BadAnswerHash`) | KILLED |
| M03 | `create` | Allowed empty question (`qLen == 0`) | KILLED |
| M04 | `create` | Allowed `durationSecs < MIN_DURATION` | KILLED |
| M05 | `create` | Allowed `durationSecs > MAX_DURATION` | KILLED |
| M06 | `commitSolve` | Allowed commit after puzzle deadline | KILLED |
| M07 | `commitSolve` | Removed `msg.sender == creator` check (`CreatorCannotSolve`) | KILLED |
| M08 | `commitSolve` | Allowed double commitment by same solver | KILLED |
| M09 | `commitSolve` | Set committed block to `block.number - 1` | KILLED |
| M10 | `reveal` | Allowed reveal after puzzle deadline | KILLED |
| M11 | `reveal` | Allowed reveal without commitment (`NoCommitment`) | KILLED |
| M12 | `reveal` | Allowed reveal in same block (`block.number < committedBlock`) | KILLED |
| M13 | `reveal` | Removed commitment hash verification (`BadReveal`) | KILLED |
| M14 | `reveal` | Removed normalized answer hash verification (`WrongAnswer`) | KILLED |
| M15 | `reveal` | Allowed 4th solver to reveal (`solved > 3`) | KILLED |
| M16 | `reveal` | Mutated 1st prize share from 50% to 45% | KILLED |
| M17 | `reveal` | Mutated 2nd prize share from 30% to 25% | KILLED |
| M18 | `reveal` | Mutated 3rd prize share from 20% to 15% | KILLED |
| M19 | `reclaim` | Allowed non-creator to reclaim pool | KILLED |
| M20 | `reclaim` | Prevented reclaim before deadline even when 3 solved | KILLED |
| M21 | `reclaim` | Allowed double reclaim (`AlreadyReclaimed`) | KILLED |
| M22 | `withdraw` | Allowed zero-amount withdrawal (`NothingToWithdraw`) | KILLED |
| M23 | `withdraw` | Removed `nonReentrant` lock modifier | KILLED |
| M24 | `create` | Added 10 seconds to puzzle deadline | KILLED |
| M25 | `reveal` | Inverted commitment check (`computed == storedCommitment`) | KILLED |

**Kill Rate**: 25/25 killed (100.0%).
