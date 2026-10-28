// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "forge-std/Test.sol";
import "../src/Riddle.sol";

contract Attacker {
    Riddle public riddle;
    bool public attacked;
    bytes public innerRevertReason;

    constructor(Riddle _riddle) {
        riddle = _riddle;
    }

    function attack() external {
        riddle.withdraw();
    }

    receive() external payable {
        if (!attacked) {
            attacked = true;
            (, bytes memory data) = address(riddle).call(abi.encodeWithSelector(riddle.withdraw.selector));
            innerRevertReason = data;
        }
    }
}

contract RiddleTest is Test {
    Riddle public riddle;

    address public creator = address(0x10);
    address public solver1 = address(0x21);
    address public solver2 = address(0x22);
    address public solver3 = address(0x23);
    address public solver4 = address(0x24);

    string constant QUESTION = "What has roots that nobody sees, and is taller than trees?";
    string constant ANSWER = "mountain";
    bytes32 constant SALT1 = bytes32(uint256(111));
    bytes32 constant SALT2 = bytes32(uint256(222));
    bytes32 constant SALT3 = bytes32(uint256(333));
    bytes32 constant SALT4 = bytes32(uint256(444));

    bytes32 answerHash;

    function setUp() public {
        riddle = new Riddle();
        answerHash = keccak256(bytes(riddle.normalize(ANSWER)));

        vm.deal(creator, 100_000 ether);
        vm.deal(solver1, 10 ether);
        vm.deal(solver2, 10 ether);
        vm.deal(solver3, 10 ether);
        vm.deal(solver4, 10 ether);
    }

    function _createDefaultPuzzle(uint128 pool, uint64 duration) internal returns (uint256) {
        vm.prank(creator);
        return riddle.create{value: pool}(QUESTION, answerHash, duration);
    }

    function test_CreateBounds() public {
        // Zero prize
        vm.prank(creator);
        vm.expectRevert(Riddle.NoPrize.selector);
        riddle.create{value: 0}(QUESTION, answerHash, 86400);

        // Zero answerHash
        vm.prank(creator);
        vm.expectRevert(Riddle.BadAnswerHash.selector);
        riddle.create{value: 1 ether}(QUESTION, bytes32(0), 86400);

        // Empty question
        vm.prank(creator);
        vm.expectRevert(Riddle.BadQuestion.selector);
        riddle.create{value: 1 ether}("", answerHash, 86400);

        // Too long question (> 140 bytes)
        bytes memory longQ = new bytes(141);
        for (uint256 i = 0; i < 141; i++) longQ[i] = "a";
        vm.prank(creator);
        vm.expectRevert(Riddle.BadQuestion.selector);
        riddle.create{value: 1 ether}(string(longQ), answerHash, 86400);

        // Too short duration (< 3600)
        vm.prank(creator);
        vm.expectRevert(Riddle.BadDuration.selector);
        riddle.create{value: 1 ether}(QUESTION, answerHash, 3599);

        // Too long duration (> 7776000)
        vm.prank(creator);
        vm.expectRevert(Riddle.BadDuration.selector);
        riddle.create{value: 1 ether}(QUESTION, answerHash, 7776001);

        // Valid creation
        uint256 id = _createDefaultPuzzle(10 ether, 86400);
        assertEq(id, 1);
        assertEq(riddle.puzzleCount(), 1);

        Riddle.Puzzle memory p = riddle.puzzleOf(1);
        assertEq(p.creator, creator);
        assertEq(p.pool, 10 ether);
        assertEq(p.deadline, block.timestamp + 86400);
        assertEq(p.answerHash, answerHash);
        assertEq(p.solved, 0);
        assertFalse(p.reclaimed);
        assertEq(p.question, QUESTION);
    }

    function test_CommitThenRevealPaysFirstWinner() public {
        uint256 id = _createDefaultPuzzle(10 ether, 86400);

        bytes32 commitment = riddle.commitmentFor(id, solver1, "Mountain", SALT1);

        vm.prank(solver1);
        riddle.commitSolve(id, commitment);

        (bytes32 storedComm, uint64 storedBlock) = riddle.commitmentOf(id, solver1);
        assertEq(storedComm, commitment);
        assertEq(storedBlock, block.number);

        // Advance 1 block
        vm.roll(block.number + 1);

        vm.prank(solver1);
        riddle.reveal(id, "  MOUNTAIN  ", SALT1);

        assertEq(riddle.pending(solver1), 5 ether); // 50% of 10 ether
        Riddle.Puzzle memory p = riddle.puzzleOf(id);
        assertEq(p.solved, 1);
        address[3] memory winners = riddle.winnersOf(id);
        assertEq(winners[0], solver1);

        // Withdraw
        uint256 balBefore = solver1.balance;
        vm.prank(solver1);
        riddle.withdraw();
        assertEq(solver1.balance - balBefore, 5 ether);
        assertEq(riddle.pending(solver1), 0);
    }

    function test_RevealInSameBlockReverts() public {
        uint256 id = _createDefaultPuzzle(10 ether, 86400);
        bytes32 commitment = riddle.commitmentFor(id, solver1, ANSWER, SALT1);

        vm.prank(solver1);
        riddle.commitSolve(id, commitment);

        // Try reveal in exact same block without rolling
        vm.prank(solver1);
        vm.expectRevert(Riddle.TooSoon.selector);
        riddle.reveal(id, ANSWER, SALT1);
    }

    function test_WrongAnswerReverts() public {
        uint256 id = _createDefaultPuzzle(10 ether, 86400);
        bytes32 commitment = riddle.commitmentFor(id, solver1, "sea", SALT1);

        vm.prank(solver1);
        riddle.commitSolve(id, commitment);

        vm.roll(block.number + 1);

        vm.prank(solver1);
        vm.expectRevert(Riddle.WrongAnswer.selector);
        riddle.reveal(id, "sea", SALT1);
    }

    function test_BadSaltReverts() public {
        uint256 id = _createDefaultPuzzle(10 ether, 86400);
        bytes32 commitment = riddle.commitmentFor(id, solver1, ANSWER, SALT1);

        vm.prank(solver1);
        riddle.commitSolve(id, commitment);

        vm.roll(block.number + 1);

        bytes32 wrongSalt = bytes32(uint256(999999));
        vm.prank(solver1);
        vm.expectRevert(Riddle.BadReveal.selector);
        riddle.reveal(id, ANSWER, wrongSalt);
    }

    function test_CopyingAnotherSolversCommitFails() public {
        uint256 id = _createDefaultPuzzle(10 ether, 86400);
        bytes32 commitment1 = riddle.commitmentFor(id, solver1, ANSWER, SALT1);

        vm.prank(solver1);
        riddle.commitSolve(id, commitment1);

        // Attacker solver2 sees commitment1 in mempool and tries to commit the same bytes32
        vm.prank(solver2);
        riddle.commitSolve(id, commitment1);

        vm.roll(block.number + 1);

        // Solver2 reveals with the same answer and salt, but commitment was bound to solver1!
        vm.prank(solver2);
        vm.expectRevert(Riddle.BadReveal.selector);
        riddle.reveal(id, ANSWER, SALT1);

        // Solver1 reveals successfully
        vm.prank(solver1);
        riddle.reveal(id, ANSWER, SALT1);
        assertEq(riddle.pending(solver1), 5 ether);
    }

    function test_ThreeWinnersPayFiftyThirtyTwenty() public {
        uint256 id = _createDefaultPuzzle(10 ether, 86400);

        bytes32 comm1 = riddle.commitmentFor(id, solver1, ANSWER, SALT1);
        bytes32 comm2 = riddle.commitmentFor(id, solver2, ANSWER, SALT2);
        bytes32 comm3 = riddle.commitmentFor(id, solver3, ANSWER, SALT3);

        vm.prank(solver1);
        riddle.commitSolve(id, comm1);

        vm.prank(solver2);
        riddle.commitSolve(id, comm2);

        vm.prank(solver3);
        riddle.commitSolve(id, comm3);

        vm.roll(block.number + 1);

        // Rank 1: 50%
        vm.prank(solver1);
        riddle.reveal(id, ANSWER, SALT1);
        assertEq(riddle.pending(solver1), 5 ether);

        // Rank 2: 30%
        vm.prank(solver2);
        riddle.reveal(id, ANSWER, SALT2);
        assertEq(riddle.pending(solver2), 3 ether);

        // Rank 3: 20%
        vm.prank(solver3);
        riddle.reveal(id, ANSWER, SALT3);
        assertEq(riddle.pending(solver3), 2 ether);

        Riddle.Puzzle memory p = riddle.puzzleOf(id);
        assertEq(p.solved, 3);
        address[3] memory winners = riddle.winnersOf(id);
        assertEq(winners[0], solver1);
        assertEq(winners[1], solver2);
        assertEq(winners[2], solver3);
    }

    function test_FourthSolverRevertsPrizesTaken() public {
        uint256 id = _createDefaultPuzzle(10 ether, 86400);

        bytes32 comm1 = riddle.commitmentFor(id, solver1, ANSWER, SALT1);
        bytes32 comm2 = riddle.commitmentFor(id, solver2, ANSWER, SALT2);
        bytes32 comm3 = riddle.commitmentFor(id, solver3, ANSWER, SALT3);
        bytes32 comm4 = riddle.commitmentFor(id, solver4, ANSWER, SALT4);

        vm.prank(solver1);
        riddle.commitSolve(id, comm1);
        vm.prank(solver2);
        riddle.commitSolve(id, comm2);
        vm.prank(solver3);
        riddle.commitSolve(id, comm3);
        vm.prank(solver4);
        riddle.commitSolve(id, comm4);

        vm.roll(block.number + 1);

        vm.prank(solver1);
        riddle.reveal(id, ANSWER, SALT1);
        vm.prank(solver2);
        riddle.reveal(id, ANSWER, SALT2);
        vm.prank(solver3);
        riddle.reveal(id, ANSWER, SALT3);

        vm.prank(solver4);
        vm.expectRevert(Riddle.PrizesTaken.selector);
        riddle.reveal(id, ANSWER, SALT4);
    }

    function test_RevealAfterDeadlineReverts() public {
        uint256 id = _createDefaultPuzzle(10 ether, 3600);
        bytes32 commitment = riddle.commitmentFor(id, solver1, ANSWER, SALT1);

        vm.prank(solver1);
        riddle.commitSolve(id, commitment);

        vm.roll(block.number + 1);
        vm.warp(block.timestamp + 3601);

        vm.prank(solver1);
        vm.expectRevert(Riddle.Closed.selector);
        riddle.reveal(id, ANSWER, SALT1);
    }

    function test_CreatorCannotSolve() public {
        uint256 id = _createDefaultPuzzle(10 ether, 86400);
        bytes32 commitment = riddle.commitmentFor(id, creator, ANSWER, SALT1);

        vm.prank(creator);
        vm.expectRevert(Riddle.CreatorCannotSolve.selector);
        riddle.commitSolve(id, commitment);
    }

    function test_ReclaimLeftoverAfterDeadline() public {
        uint256 id = _createDefaultPuzzle(10 ether, 3600);

        bytes32 comm1 = riddle.commitmentFor(id, solver1, ANSWER, SALT1);
        vm.prank(solver1);
        riddle.commitSolve(id, comm1);

        vm.roll(block.number + 1);
        vm.prank(solver1);
        riddle.reveal(id, ANSWER, SALT1);

        // Cannot reclaim before deadline if < 3 solved
        vm.prank(creator);
        vm.expectRevert(Riddle.NotReclaimable.selector);
        riddle.reclaim(id);

        // Pass deadline
        vm.warp(block.timestamp + 3601);

        // Non-creator cannot reclaim
        vm.prank(solver1);
        vm.expectRevert(Riddle.OnlyCreator.selector);
        riddle.reclaim(id);

        // Creator reclaims leftover (10 ether - 5 ether = 5 ether)
        vm.prank(creator);
        riddle.reclaim(id);
        assertEq(riddle.pending(creator), 5 ether);
        assertTrue(riddle.puzzleOf(id).reclaimed);

        // Reclaim once
        vm.prank(creator);
        vm.expectRevert(Riddle.AlreadyReclaimed.selector);
        riddle.reclaim(id);
    }

    function test_ReclaimAfterThreeSolved() public {
        uint256 id = _createDefaultPuzzle(10 ether, 86400);

        bytes32 comm1 = riddle.commitmentFor(id, solver1, ANSWER, SALT1);
        bytes32 comm2 = riddle.commitmentFor(id, solver2, ANSWER, SALT2);
        bytes32 comm3 = riddle.commitmentFor(id, solver3, ANSWER, SALT3);

        vm.prank(solver1);
        riddle.commitSolve(id, comm1);
        vm.prank(solver2);
        riddle.commitSolve(id, comm2);
        vm.prank(solver3);
        riddle.commitSolve(id, comm3);

        vm.roll(block.number + 1);
        vm.prank(solver1);
        riddle.reveal(id, ANSWER, SALT1);
        vm.prank(solver2);
        riddle.reveal(id, ANSWER, SALT2);
        vm.prank(solver3);
        riddle.reveal(id, ANSWER, SALT3);

        // 3 solved allows immediate reclaim before deadline (for rounding dust / completeness)
        vm.prank(creator);
        riddle.reclaim(id);
        assertTrue(riddle.puzzleOf(id).reclaimed);
    }

    function test_RoundingDustToCreator() public {
        // Pool with odd amount: 100000000000000001 wei
        uint128 pool = 100000000000000001;
        uint256 id = _createDefaultPuzzle(pool, 86400);

        bytes32 comm1 = riddle.commitmentFor(id, solver1, ANSWER, SALT1);
        bytes32 comm2 = riddle.commitmentFor(id, solver2, ANSWER, SALT2);
        bytes32 comm3 = riddle.commitmentFor(id, solver3, ANSWER, SALT3);

        vm.prank(solver1);
        riddle.commitSolve(id, comm1);
        vm.prank(solver2);
        riddle.commitSolve(id, comm2);
        vm.prank(solver3);
        riddle.commitSolve(id, comm3);

        vm.roll(block.number + 1);
        vm.prank(solver1);
        riddle.reveal(id, ANSWER, SALT1);
        vm.prank(solver2);
        riddle.reveal(id, ANSWER, SALT2);
        vm.prank(solver3);
        riddle.reveal(id, ANSWER, SALT3);

        uint128 p1 = uint128((uint256(pool) * 50) / 100);
        uint128 p2 = uint128((uint256(pool) * 30) / 100);
        uint128 p3 = uint128((uint256(pool) * 20) / 100);
        uint128 dust = pool - (p1 + p2 + p3);
        assertEq(dust, 1);

        vm.prank(creator);
        riddle.reclaim(id);
        assertEq(riddle.pending(creator), dust);
    }

    function test_NormalizeVectors() public view {
        assertEq(riddle.normalize(""), "");
        assertEq(riddle.normalize("   "), "");
        assertEq(riddle.normalize("Mountain"), "mountain");
        assertEq(riddle.normalize("  HELLO   WORLD  "), "hello world");
        assertEq(riddle.normalize("A  B   C    D"), "a b c d");
        assertEq(riddle.normalize("answer123!"), "answer123!");
    }

    function test_ReentrantWithdrawBlocked() public {
        Attacker attacker = new Attacker(riddle);
        vm.deal(address(attacker), 10 ether);

        // Creator posts puzzle
        uint256 id = _createDefaultPuzzle(10 ether, 86400);

        // Attacker commits and solves
        bytes32 comm = riddle.commitmentFor(id, address(attacker), ANSWER, SALT1);
        vm.prank(address(attacker));
        riddle.commitSolve(id, comm);

        vm.roll(block.number + 1);
        vm.prank(address(attacker));
        riddle.reveal(id, ANSWER, SALT1);

        assertEq(riddle.pending(address(attacker)), 5 ether);

        // Attacker calls attack, receive() tries to re-enter, gets ReentrancyGuardReentrantCall
        vm.prank(address(attacker));
        attacker.attack();

        assertEq(
            attacker.innerRevertReason(),
            abi.encodeWithSelector(Riddle.ReentrancyGuardReentrantCall.selector)
        );
        assertEq(address(attacker).balance, 15 ether);
        assertEq(riddle.pending(address(attacker)), 0);
    }

    function test_CommitAfterDeadlineReverts() public {
        uint256 id = _createDefaultPuzzle(10 ether, 86400);
        vm.warp(block.timestamp + 86400);

        bytes32 comm = riddle.commitmentFor(id, solver1, ANSWER, SALT1);
        vm.prank(solver1);
        vm.expectRevert(Riddle.Closed.selector);
        riddle.commitSolve(id, comm);
    }

    function test_RevealWithoutCommitReverts() public {
        uint256 id = _createDefaultPuzzle(10 ether, 86400);
        vm.roll(block.number + 5);

        vm.prank(solver1);
        vm.expectRevert(Riddle.NoCommitment.selector);
        riddle.reveal(id, ANSWER, SALT1);
    }

    function test_WinnerCannotWinTwice() public {
        uint256 id = _createDefaultPuzzle(10 ether, 86400);

        bytes32 comm1 = riddle.commitmentFor(id, solver1, ANSWER, SALT1);
        bytes32 comm2 = riddle.commitmentFor(id, solver1, ANSWER, SALT2);

        vm.prank(solver1);
        riddle.commitSolve(id, comm1);

        // solver1 tries to commit again
        vm.prank(solver1);
        vm.expectRevert(Riddle.AlreadyCommitted.selector);
        riddle.commitSolve(id, comm2);
    }

    function test_WithdrawEmptyReverts() public {
        vm.prank(solver1);
        vm.expectRevert(Riddle.NothingToWithdraw.selector);
        riddle.withdraw();
    }

    function test_PaginationLatest() public {
        for (uint256 i = 0; i < 5; i++) {
            _createDefaultPuzzle(1 ether, 86400);
        }

        (Riddle.Puzzle[] memory list, uint256[] memory ids, uint256 total) = riddle.latest(0, 3);
        assertEq(total, 5);
        assertEq(list.length, 3);
        assertEq(ids.length, 3);
        assertEq(ids[0], 5);
        assertEq(ids[1], 4);
        assertEq(ids[2], 3);

        (Riddle.Puzzle[] memory list2, uint256[] memory ids2, ) = riddle.latest(3, 10);
        assertEq(list2.length, 2);
        assertEq(ids2[0], 2);
        assertEq(ids2[1], 1);
    }

    function testFuzz_PayoutConservation(uint128 pool) public {
        vm.assume(pool > 0 && pool <= 10_000 ether);

        uint256 id = _createDefaultPuzzle(pool, 86400);

        bytes32 comm1 = riddle.commitmentFor(id, solver1, ANSWER, SALT1);
        bytes32 comm2 = riddle.commitmentFor(id, solver2, ANSWER, SALT2);
        bytes32 comm3 = riddle.commitmentFor(id, solver3, ANSWER, SALT3);

        vm.prank(solver1);
        riddle.commitSolve(id, comm1);
        vm.prank(solver2);
        riddle.commitSolve(id, comm2);
        vm.prank(solver3);
        riddle.commitSolve(id, comm3);

        vm.roll(block.number + 1);
        vm.prank(solver1);
        riddle.reveal(id, ANSWER, SALT1);
        vm.prank(solver2);
        riddle.reveal(id, ANSWER, SALT2);
        vm.prank(solver3);
        riddle.reveal(id, ANSWER, SALT3);

        vm.prank(creator);
        riddle.reclaim(id);

        uint256 totalCredited = riddle.pending(solver1) +
            riddle.pending(solver2) +
            riddle.pending(solver3) +
            riddle.pending(creator);

        assertEq(totalCredited, pool, "Exact pool conservation");
    }
}
