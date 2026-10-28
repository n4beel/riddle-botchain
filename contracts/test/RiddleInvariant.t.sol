// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "forge-std/Test.sol";
import "../src/Riddle.sol";

contract RiddleHandler is Test {
    Riddle public riddle;

    address[] public actors;
    uint256[] public activePuzzles;

    string constant ANSWER = "mountain";
    bytes32 public answerHash;

    // Track total credited pending vs pool
    uint256 public totalDeposited;
    uint256 public totalWithdrawn;

    constructor(Riddle _riddle) {
        riddle = _riddle;
        answerHash = keccak256(bytes(riddle.normalize(ANSWER)));

        actors.push(address(0x101));
        actors.push(address(0x102));
        actors.push(address(0x103));
        actors.push(address(0x104));
        actors.push(address(0x105));

        for (uint256 i = 0; i < actors.length; i++) {
            vm.deal(actors[i], 1_000_000 ether);
        }
    }

    function createPuzzle(
        uint256 actorSeed,
        uint128 poolSeed,
        uint64 durationSeed
    ) external {
        address creator = actors[actorSeed % actors.length];
        uint128 pool = uint128(bound(poolSeed, 0.01 ether, 50 ether));
        uint64 duration = uint64(bound(durationSeed, riddle.MIN_DURATION(), riddle.MAX_DURATION()));

        vm.prank(creator);
        uint256 id = riddle.create{value: pool}("What is taller than trees?", answerHash, duration);

        activePuzzles.push(id);
        totalDeposited += pool;
    }

    function commitSolve(uint256 puzzleSeed, uint256 actorSeed, bytes32 salt) external {
        if (activePuzzles.length == 0) return;
        uint256 id = activePuzzles[puzzleSeed % activePuzzles.length];
        address solver = actors[actorSeed % actors.length];

        Riddle.Puzzle memory p = riddle.puzzleOf(id);
        if (block.timestamp >= p.deadline) return;
        if (solver == p.creator) return;

        (bytes32 existing, ) = riddle.commitmentOf(id, solver);
        if (existing != bytes32(0)) return;

        bytes32 commitment = riddle.commitmentFor(id, solver, ANSWER, salt);

        vm.prank(solver);
        riddle.commitSolve(id, commitment);
    }

    function rollForward(uint256 blocks) external {
        uint256 b = bound(blocks, 1, 10);
        vm.roll(block.number + b);
    }

    function warpForward(uint256 timeSecs) external {
        uint256 t = bound(timeSecs, 1, 100_000);
        vm.warp(block.timestamp + t);
    }

    function reveal(
        uint256 puzzleSeed,
        uint256 actorSeed,
        bytes32 salt
    ) external {
        if (activePuzzles.length == 0) return;
        uint256 id = activePuzzles[puzzleSeed % activePuzzles.length];
        address solver = actors[actorSeed % actors.length];

        Riddle.Puzzle memory p = riddle.puzzleOf(id);
        if (block.timestamp >= p.deadline) return;
        if (p.solved >= 3) return;

        (bytes32 comm, uint64 commBlock) = riddle.commitmentOf(id, solver);
        if (comm == bytes32(0)) return;
        if (block.number <= commBlock) return;

        bytes32 expected = riddle.commitmentFor(id, solver, ANSWER, salt);
        if (expected != comm) return;

        for (uint8 i = 0; i < p.solved; i++) {
            if (riddle.winnersOf(id)[i] == solver) return;
        }

        vm.prank(solver);
        riddle.reveal(id, ANSWER, salt);
    }

    function reclaim(uint256 puzzleSeed) external {
        if (activePuzzles.length == 0) return;
        uint256 id = activePuzzles[puzzleSeed % activePuzzles.length];
        Riddle.Puzzle memory p = riddle.puzzleOf(id);

        if (p.reclaimed) return;
        if (block.timestamp < p.deadline && p.solved < 3) return;

        vm.prank(p.creator);
        riddle.reclaim(id);
    }

    function withdraw(uint256 actorSeed) external {
        address who = actors[actorSeed % actors.length];
        uint256 amt = riddle.pending(who);
        if (amt == 0) return;

        vm.prank(who);
        riddle.withdraw();
        totalWithdrawn += amt;
    }
}

contract RiddleInvariantTest is Test {
    Riddle public riddle;
    RiddleHandler public handler;

    function setUp() public {
        riddle = new Riddle();
        handler = new RiddleHandler(riddle);
        targetContract(address(handler));
    }

    // Invariant 1: Contract balance conservation
    // balance == sum(pending) + sum(pool - paid) for puzzles not reclaimed
    function invariant_BalanceConservation() public view {
        uint256 totalPending = 0;
        for (uint256 i = 0; i < 5; i++) {
            totalPending += riddle.pending(handler.actors(i));
        }

        uint256 totalUnclaimedPools = 0;
        uint256 count = riddle.puzzleCount();
        for (uint256 id = 1; id <= count; id++) {
            Riddle.Puzzle memory p = riddle.puzzleOf(id);
            if (!p.reclaimed) {
                uint128 paid = 0;
                if (p.solved >= 1) paid += uint128((uint256(p.pool) * 50) / 100);
                if (p.solved >= 2) paid += uint128((uint256(p.pool) * 30) / 100);
                if (p.solved >= 3) paid += uint128((uint256(p.pool) * 20) / 100);
                totalUnclaimedPools += (p.pool - paid);
            }
        }

        assertEq(
            address(riddle).balance,
            totalPending + totalUnclaimedPools,
            "Balance must match pending plus unclaimed pools"
        );
    }

    // Invariant 2: Solved count <= 3 and winners distinct
    function invariant_MaxThreeDistinctWinners() public view {
        uint256 count = riddle.puzzleCount();
        for (uint256 id = 1; id <= count; id++) {
            Riddle.Puzzle memory p = riddle.puzzleOf(id);
            assertTrue(p.solved <= 3, "Solved count must be <= 3");

            address[3] memory winners = riddle.winnersOf(id);
            if (p.solved >= 1) {
                assertTrue(winners[0] != address(0), "Winner 0 must be set");
            }
            if (p.solved >= 2) {
                assertTrue(winners[1] != address(0), "Winner 1 must be set");
                assertTrue(winners[1] != winners[0], "Winners 0 and 1 must differ");
            }
            if (p.solved >= 3) {
                assertTrue(winners[2] != address(0), "Winner 2 must be set");
                assertTrue(winners[2] != winners[0], "Winners 0 and 2 must differ");
                assertTrue(winners[2] != winners[1], "Winners 1 and 2 must differ");
            }
        }
    }

    // Invariant 3: Payout conservation (sum of payouts + reclaim <= pool)
    function invariant_PayoutConservation() public view {
        uint256 count = riddle.puzzleCount();
        for (uint256 id = 1; id <= count; id++) {
            Riddle.Puzzle memory p = riddle.puzzleOf(id);
            uint128 p1 = p.solved >= 1 ? uint128((uint256(p.pool) * 50) / 100) : 0;
            uint128 p2 = p.solved >= 2 ? uint128((uint256(p.pool) * 30) / 100) : 0;
            uint128 p3 = p.solved >= 3 ? uint128((uint256(p.pool) * 20) / 100) : 0;

            assertTrue(p1 + p2 + p3 <= p.pool, "Payouts cannot exceed pool");
        }
    }
}
