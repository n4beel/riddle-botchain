# Riddle

> Post a riddle. Pay the first three solvers.

An anti-front-running riddle escrow protocol on BOT Chain where creators deposit a prize pool and inscribe a question alongside the keccak256 hash of the normalized answer. Solvers prove knowledge of the secret answer through a two-step commit-reveal scheme. The first three valid reveals receive 50% / 30% / 20% of the pool. Unawarded funds and rounding dust are reclaimed by the creator after the deadline or after all three prizes are awarded. Built for the BOT Chain ecosystem under **Archetype AK · Scroll**.

## What it is

A creator (a community host, game master, or quiz organizer) funds a prize pool and inscribes a riddle on BOT Chain:
- **Zero-knowledge on wire**: The plaintext answer is **never** sent to the network or stored on-chain. Only the keccak256 hash of the normalized answer is inscribed. A downloadable backup of the secret answer is generated before submission.
- **Anti-Front-Running Commit-Reveal**: Solvers cannot simply submit the answer in plaintext, as searchers and bots would copy it from the mempool. Instead, solvers **commit** a blinded hash:
  $$\text{commitment} = \text{keccak256}(\text{abi.encode}(id, \text{msg.sender}, \text{normalize}(answer), salt))$$
  bound to the solver's address.
- **One-Block Wait**: Solvers must wait until at least the next block before calling `reveal(id, answer, salt)`.
- **Ranked 50% / 30% / 20% Payouts**: The first 3 distinct solvers receive 50%, 30%, and 20% of the prize pool respectively, credited directly to their pull payment till.
- **Creator Reclaim**: The creator can reclaim remaining unspent pool funds after the deadline, or immediately settle rounding dust after all 3 winners are recorded.
- **Pull Payments**: Solvers and creators securely withdraw their funds via zero-then-transfer, non-reentrant pull payments (`withdraw()`).

## What it cannot do (stated on the main screen)

- **The creator knows the answer and can play through other wallets.** Treat prizes as a community game rather than an auditable competition.
- **Once anyone shows the answer, it is public.** Later solvers can copy it, but rank behind earlier ones.
- **Answers are matched as trimmed, lowercase text.** Spelling counts.

## Archetype AK · Scroll

- **Ground**: Parchment `#F2E6C9`
- **Surface**: Warm Parchment `#FBF3DC` / Elevated `#EDE0BE` / Overlay `#E4D5AD`
- **Text**: Antique ink `#2D1E12`, muted `#65513D`, tertiary `#8C755E`, fine `#6D5841`
- **Accent**: Verdigris `#1F7A5C` (`#FFFFFF` ink)
- **Borders**: Parchment border `#D8C79B`, subtle `#E7DAB5`, strong `#BFAC7D`
- **Wallet Menu**: `--menu-bg #FBF3DC` · `--menu-fg #2D1E12` · `--menu-muted #65513D` · `--menu-border #D8C79B` · `--menu-hover-bg #F0E2BC` · `--menu-danger #9E1F2B`
- **Typography**: Cinzel (riddle headings), Alegreya (the riddle text), Inconsolata (hashes, answers).

## Signature Components

- **Parchment Scroll (`ParchmentScroll.tsx`)**: Central vertical parchment scroll with rolled ends top and bottom, riddle set in Alegreya at reading size, wax-green seal displaying prize pool and countdown deadline, and 3 medal slots (1st 50%, 2nd 30%, 3rd 20%) filling with winner addresses and payouts.
- **Solver Slip (`SolverSlip.tsx`)**: Drawer/slip sliding out from the right of the scroll (on 360px mobile viewports: docked as bottom sheet):
  - Step 1: "Seal your guess" (writes commitment)
  - Step 2: "Wait one block" (shows block counter & anti-front-running indicator)
  - Step 3: "Show your answer" (reveals answer + secret salt)
- **Scroll Shelf & Rolled Cylinders (`ScrollShelf.tsx` & `RolledScrollCard.tsx`)**: Homepage `/` renders riddles exclusively as horizontal rolled cylinders on a wooden shelf (no generic cards).
- **Limitation Block (`LimitationBlock.tsx`)**: Prominent panel with heading `What a riddle can't prove` and the 3 exact statements from spec §3.4.

## Contract Architecture (`contracts/src/Riddle.sol`)

- `create(string question, bytes32 answerHash, uint64 durationSecs) payable returns (uint256 id)`: Question ≤ 140 bytes, duration 3,600s..7,776,000s, `msg.value > 0`. Emits `Created`.
- `commitSolve(uint256 id, bytes32 commitment)`: Enforces deadline (`Closed`), valid commitment, non-creator (`CreatorCannotSolve`), and single commitment per solver (`AlreadyCommitted`). Emits `Committed`.
- `reveal(uint256 id, string answer, bytes32 salt)`: Enforces deadline, commitment presence (`NoCommitment`), strictly after commit block (`TooSoon`), commitment verification (`BadReveal`), normalized answer hash match (`WrongAnswer`), fewer than 3 winners (`PrizesTaken`), and not already a winner (`AlreadyWon`). Emits `Solved`.
- `reclaim(uint256 id)`: Creator only (`OnlyCreator`), after deadline or once 3 solved (`NotReclaimable`), once (`AlreadyReclaimed`). Emits `Reclaimed`.
- `withdraw()`: Non-reentrant pull payment withdrawal for solvers and creators.
- Views: `puzzleOf(id)`, `winnersOf(id)`, `commitmentOf(id, who)`, `latest(offset, count)` (≤ 50), `commitmentFor(id, solver, answer, salt)`, `normalize(string)`, `pending(addr)`, `puzzleCount()`.

## Verification & Testing

- **Foundry Contracts**: 21 unit & fuzz tests + 3 stateful invariant suites (128,000 calls across 256 runs) passing with 0 reverts.
- **Mutation Analysis**: 25/25 mutants killed (100.0% kill rate, documented in `contracts/DECISIONS.md`).
- **Integration**: 4 ABI type matching tests + 11 on-chain integration tests passing on port `8632`.
- **Browser Walkthrough**: Automated Headless Chrome CDP walkthrough across Desktop (1280px) and Mobile (360px) verifying 0px overflow, footer links, Charlie proving answer "teeth" on `/riddle/2`, Alice reclaiming expired pool on `/riddle/5`, Charlie withdrawing winnings on `/me`, and Alice creating a new riddle with downloadable backup on `/new` with **0 console errors**.
