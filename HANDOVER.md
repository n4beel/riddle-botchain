# Riddle Handover Report

## 1. What Was Built
Riddle is a commit-reveal treasure riddle registry in native BOT built for the BOT Chain ecosystem (Bohr testnet, chain ID 968) under **Archetype AK · Scroll**.

Key components:
- **Smart Contract (`contracts/src/Riddle.sol`)**:
  - `post(question, answerHash, durationSecs)` payable: Inscribes a riddle with bounded question (1..140 bytes), normalized answer hash (`keccak256(bytes(normalize(answer)))`), 1 hour to 90 days duration (3600..7776000s), and initial prize pool > 0. Emits `Created`.
  - `commitSolve(id, commitment)`: Submits a cryptographic solve commitment `keccak256(abi.encode(id, solver, norm, salt))` to prevent mempool front-running. Blocks creator self-solving (`CreatorCannotSolve`), expired riddles (`Expired`), duplicate commitments from same solver (`AlreadyCommitted`), and filled riddles (`PrizesTaken`). Emits `Committed`.
  - `reveal(id, answer, salt)`: Reveals answer strictly after commitment block (`TooSoon`), before deadline (`Expired`), matching question answer hash (`WrongAnswer`), and matching commitment (`BadReveal`). Awards first 3 valid reveals 50% / 30% / 20% of the prize pool directly into pending balances (`pending[solver] += amount`). Emits `Solved`.
  - `reclaim(id)`: Creator reclaims remaining unallocated prize pool after expiration (`now >= deadline`) or once all 3 prizes have been claimed. Credits `pending[creator] += remaining`. Emits `Reclaimed`.
  - `withdraw()`: Non-reentrant pull payment withdrawal for all solver winnings and creator reclaims. Emits `Withdrawn`.
  - Views: `riddleOf(id)`, `solversOf(id)`, `commitmentsOf(id)`, `commitmentOf(id, solver)`, `hasSolved(id, solver)`, `latest(offset, count)` (≤ 50), `byCreator(addr)`, `pending(addr)`, `riddleCount()`.
- **Frontend Architecture (Archetype AK · Scroll)**:
  - Palette: Ground Parchment `#F2E6C9`, Surface `#FBF3DC`, Ink `#2D1E12`, Muted `#65513D`, Accent Verdigris `#1F7A5C` (`#FFFFFF` ink), Borders `#D8C79B`.
  - Typography: Cinzel (headings & classical inscription titles), Alegreya (riddle body & literary narrative), Inconsolata (hashes, answer stamps, commitments, addresses).
  - Signature Components:
    - `ParchmentScroll.tsx`: Physical parchment scroll container with rolled wooden dowels, ribbon badges, wax seals, and block-timestamp synchronized countdown timer.
    - `SolverSlip.tsx`: Numbered solver reward vouchers (1st Gold 50%, 2nd Silver 30%, 3rd Bronze 20%) with stamped answer and block timestamp.
    - `ScrollShelf.tsx`: Responsive scroll shelf (strictly 1 scroll per row at 360px mobile).
    - `RolledScrollCard.tsx`: Rolled parchment scroll card with wax seal indicating riddle status.
    - `LimitationBlock.tsx`: Fine print panel with heading `Fine print` and the 3 exact statements from spec §3.4.
  - Routes:
    - `/`: Scroll library shelf, active riddle counts, prize pool metrics, and fine print limitations.
    - `/new`: Inscription desk where creators craft questions, input secret answers, and download cryptographic JSON backup receipts while ensuring the plain answer never leaves the browser.
    - `/riddle/[id]`: The scroll sanctum displaying full riddle question, commit-reveal solving interface with local salt management, wax seal status, and solver slips.
    - `/me`: Solver and Scribe chambers displaying unrevealed commitments ready to show, solved treasures, created scrolls with reclaim buttons, and till withdrawal station.
    - `app/not-found.tsx`: Lost scroll 404 screen.

---

## 2. Verification Results

### Foundry Unit & Fuzz Tests
```bash
$ cd contracts && forge test
Ran 21 tests for test/Riddle.t.sol:RiddleTest
[PASS] testFuzz_PayoutConservation(uint128) (runs: 256)
[PASS] test_ByCreator()
[PASS] test_CommitAndRevealFlow()
[PASS] test_CopycatFails()
[PASS] test_CreatorCannotSolve()
[PASS] test_DuplicateCommitReverts()
[PASS] test_ExpiredCommitReverts()
[PASS] test_ExpiredRevealReverts()
[PASS] test_LatestRiddles()
[PASS] test_MaxDurationBoundary()
[PASS] test_MaxQuestionBoundary()
[PASS] test_MinDurationBoundary()
[PASS] test_NonCreatorReclaimReverts()
[PASS] test_PrizesTakenReverts()
[PASS] test_ReclaimBeforeExpiryReverts()
[PASS] test_ReclaimSuccess()
[PASS] test_ReentrantWithdrawBlocked()
[PASS] test_RevealSameBlockReverts()
[PASS] test_ThreeSolversExactPayouts()
[PASS] test_WithdrawEmptyReverts()
[PASS] test_ZeroPoolReverts()
Suite result: ok. 21 passed; 0 failed; 0 skipped
```

### Foundry Invariant Suites
```bash
$ cd contracts && forge test --match-contract RiddleInvariantTest
Ran 3 tests for test/RiddleInvariant.t.sol:RiddleInvariantTest
[PASS] invariant_BalanceConservation() (runs: 256, calls: 128000, reverts: 0)
[PASS] invariant_MaxThreeSolvers() (runs: 256, calls: 128000, reverts: 0)
[PASS] invariant_PayoutScheduleNeverExceedsPool() (runs: 256, calls: 128000, reverts: 0)
Suite result: ok. 3 passed; 0 failed; 0 skipped
```

### Mutation Analysis
- 25/25 mutants killed across core contract functions (`post`, `commitSolve`, `reveal`, `reclaim`, `withdraw`).
- Kill rate: **100.0%**. Full mutant breakdown documented in `contracts/DECISIONS.md`.

### Vitest Unit, Lint & Integration Tests
```bash
$ npm test && npx vitest run test/integration
✓ lib/botchain/__tests__/deployment.test.ts (4 tests)
✓ lib/__tests__/contract-limits.test.ts (1 test)
✓ lib/botchain/__tests__/wagmi-chains.test.ts (2 tests)
✓ lib/botchain/__tests__/active-chain.test.ts (5 tests)
✓ lib/__tests__/wallet.test.ts (6 tests)
✓ lib/botchain/__tests__/amount.test.ts (7 tests)
✓ lib/botchain/__tests__/chain.test.ts (10 tests)
✓ lib/__tests__/riddle.test.ts (15 tests)
✓ test/lint/hook-deps.test.ts (4 tests)
Test Files  9 passed (9)
Tests       54 passed (54)

✓ test/integration/abi-matches-contract.test.ts (4 tests)
✓ test/integration/riddle.test.ts (11 tests)
Test Files  2 passed (2)
Tests       15 passed (15)
```

### Browser Walkthrough (`scripts/browser-walkthrough.mjs`)
- Executed automated Headless Chrome CDP walkthrough across Desktop (1280px) and Mobile (360px).
- Verified **0px horizontal overflow** across all routes (`/`, `/new`, `/riddle/1`, `/me`, `/_not-found`).
- Verified **strictly 1 scroll card per row** at 360px.
- Verified `--menu-*` contrast tokens and 3 shared UI footer links.
- Verified limitation copy with all 3 statements.
- Executed 4 live on-chain transactions via injected mock wallet:
  1. Charlie revealed stored solve for Riddle 2 ("echo") on `/riddle/2`, winning 1.5 BOT (50% prize).
  2. Alice reclaimed unallocated funds on expired Riddle 5 on `/riddle/5` (2.0 BOT).
  3. Charlie withdrew accumulated till balance (1.5 BOT) to wallet on `/me`.
  4. Alice inscribed a new riddle on `/new`, verified client-side answer hashing, downloaded JSON backup receipt, and verified on-chain creation.
- Asserted **0 browser console errors**.

### Static Policy Checks
```bash
$ python3 scripts/check-tokens.py riddle
0 project(s) with undefined tokens
$ python3 scripts/check-ui-contract.py riddle
riddle: ok
$ python3 scripts/check-distinct.py riddle
43 projects compared; 0 pair/file problem(s)
$ python3 scripts/check-honesty.py riddle
honesty: 0 finding(s) in 1 project(s)
```

---

## 3. Mainnet Activity Recipe (Labelled Developer Wallets)
1. **Wallet 1 (Scribe Alice)**: Calls `post("What has keys but no locks, space but no room, you can enter but cannot go outside?", 0x..., 86400)` payable with 1.0 BOT (1 tx).
2. **Wallet 2 (Solver Bob)**: Calls `commitSolve(1, commitment_bob)` (1 tx).
3. **Time advances 1 block**.
4. **Wallet 2 (Solver Bob)**: Calls `reveal(1, "keyboard", salt_bob)` (1 tx; wins 1st prize 0.50 BOT).
5. **Wallet 3 (Solver Charlie)**: Calls `commitSolve(1, commitment_charlie)` (1 tx).
6. **Time advances 1 block**.
7. **Wallet 3 (Solver Charlie)**: Calls `reveal(1, "A Keyboard", salt_charlie)` (1 tx; wins 2nd prize 0.30 BOT).
8. **Wallet 4 (Solver Dave)**: Calls `commitSolve(1, commitment_dave)` (1 tx).
9. **Time advances 1 block**.
10. **Wallet 4 (Solver Dave)**: Calls `reveal(1, "keyboard!", salt_dave)` (1 tx; wins 3rd prize 0.20 BOT).
11. **Wallet 2 (Solver Bob)**: Calls `withdraw()` to pull 0.50 BOT winnings (1 tx).
12. **Wallet 3 (Solver Charlie)**: Calls `withdraw()` to pull 0.30 BOT winnings (1 tx).
13. **Wallet 4 (Solver Dave)**: Calls `withdraw()` to pull 0.20 BOT winnings (1 tx).
Total: ≥ 13 on-chain transactions across 4 labelled wallets.
