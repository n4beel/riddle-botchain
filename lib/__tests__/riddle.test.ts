import { describe, expect, it } from "vitest";
import { encodeErrorResult, parseEther } from "viem";
import {
  normalize,
  answerHash,
  commitmentFor,
  payouts,
  determinePhase,
  type Puzzle,
} from "../riddle";
import { describeError } from "../errors";
import { riddleAbi } from "../botchain/abi";

describe("Riddle Lib Tests", () => {
  describe("normalize", () => {
    it("matches contract test vectors exactly", () => {
      expect(normalize("")).toBe("");
      expect(normalize("   ")).toBe("");
      expect(normalize("\t\n\r  ")).toBe("");
      expect(normalize("Mountain")).toBe("mountain");
      expect(normalize("  HELLO   WORLD  ")).toBe("hello world");
      expect(normalize("A  B   C    D")).toBe("a b c d");
      expect(normalize("answer123!")).toBe("answer123!");
      expect(normalize("The   Quick   BROWN   Fox")).toBe("the quick brown fox");
    });
  });

  describe("answerHash", () => {
    it("hashes normalized answer with keccak256", () => {
      const h1 = answerHash("Mountain");
      const h2 = answerHash("  mountain  ");
      expect(h1).toBe(h2);
      expect(h1.startsWith("0x")).toBe(true);
      expect(h1.length).toBe(66);
    });
  });

  describe("commitmentFor", () => {
    it("produces deterministic 32-byte hash", () => {
      const solver = "0x0000000000000000000000000000000000000021" as const;
      const salt = "0x0000000000000000000000000000000000000000000000000000000000000111" as const;
      const comm1 = commitmentFor(1n, solver, "Mountain", salt);
      const comm2 = commitmentFor(1n, solver, "  mountain ", salt);
      expect(comm1).toBe(comm2);
      expect(comm1.startsWith("0x")).toBe(true);
      expect(comm1.length).toBe(66);

      // Different solver -> different commitment
      const otherSolver = "0x0000000000000000000000000000000000000022" as const;
      const commOther = commitmentFor(1n, otherSolver, "Mountain", salt);
      expect(commOther).not.toBe(comm1);
    });
  });

  describe("payouts", () => {
    it("calculates 50% / 30% / 20% splits", () => {
      const pool = parseEther("10");
      const [p1, p2, p3] = payouts(pool);
      expect(p1).toBe(parseEther("5"));
      expect(p2).toBe(parseEther("3"));
      expect(p3).toBe(parseEther("2"));
      expect(p1 + p2 + p3).toBe(pool);
    });

    it("handles rounding dust properly", () => {
      const pool = 100000000000000001n;
      const [p1, p2, p3] = payouts(pool);
      expect(p1).toBe(50000000000000000n);
      expect(p2).toBe(30000000000000000n);
      expect(p3).toBe(20000000000000000n);
      expect(pool - (p1 + p2 + p3)).toBe(1n);
    });
  });

  describe("determinePhase", () => {
    const defaultPuzzle: Puzzle = {
      id: 1n,
      creator: "0x1111111111111111111111111111111111111111",
      pool: parseEther("10"),
      deadline: 100000n,
      answerHash: "0x1234567890123456789012345678901234567890123456789012345678901234",
      solved: 0,
      reclaimed: false,
      question: "What is it?",
    };

    it("identifies reclaimed state", () => {
      const phase = determinePhase({
        puzzle: { ...defaultPuzzle, reclaimed: true },
      });
      expect(phase).toBe("reclaimed");
    });

    it("identifies all 3 solved state", () => {
      const phase = determinePhase({
        puzzle: { ...defaultPuzzle, solved: 3 },
      });
      expect(phase).toBe("all_solved");
    });

    it("identifies expired state", () => {
      const phase = determinePhase({
        puzzle: defaultPuzzle,
        currentTime: 100001n,
      });
      expect(phase).toBe("expired");
    });

    it("identifies won state", () => {
      const phase = determinePhase({
        puzzle: defaultPuzzle,
        currentTime: 50000n,
        userHasWon: true,
      });
      expect(phase).toBe("won");
    });

    it("identifies sealed_waiting state in same block", () => {
      const phase = determinePhase({
        puzzle: defaultPuzzle,
        currentTime: 50000n,
        userCommitment: "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
        userCommitBlock: 100n,
        currentBlock: 100n,
      });
      expect(phase).toBe("sealed_waiting");
    });

    it("identifies ready_to_reveal state in next block", () => {
      const phase = determinePhase({
        puzzle: defaultPuzzle,
        currentTime: 50000n,
        userCommitment: "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
        userCommitBlock: 100n,
        currentBlock: 101n,
      });
      expect(phase).toBe("ready_to_reveal");
    });

    it("identifies open state when no commitment", () => {
      const phase = determinePhase({
        puzzle: defaultPuzzle,
        currentTime: 50000n,
      });
      expect(phase).toBe("open");
    });
  });

  describe("describeError", () => {
    it("decodes contract custom errors correctly", () => {
      const encodeErr = (name: string) =>
        encodeErrorResult({
          abi: riddleAbi,
          errorName: name as any,
        });

      expect(describeError({ data: encodeErr("TooSoon") })).toBe(
        "Wait for the next block, then show your answer."
      );
      expect(describeError({ data: encodeErr("WrongAnswer") })).toBe(
        "That isn't the answer."
      );
      expect(describeError({ data: encodeErr("PrizesTaken") })).toBe(
        "All three prizes are taken."
      );
      expect(describeError({ data: encodeErr("CreatorCannotSolve") })).toBe(
        "Creators cannot solve their own riddles."
      );
      expect(describeError({ data: encodeErr("BadReveal") })).toBe(
        "Reveal data does not match your commitment."
      );
      expect(describeError({ data: encodeErr("Closed") })).toBe(
        "This riddle has expired."
      );
      expect(describeError({ data: encodeErr("AlreadyCommitted") })).toBe(
        "You have already sealed a guess for this riddle."
      );
      expect(describeError({ data: encodeErr("NoCommitment") })).toBe(
        "No sealed guess found for this address."
      );
      expect(describeError({ data: encodeErr("NoPrize") })).toBe(
        "You must deposit a prize pool."
      );
    });

    it("handles generic rejection and balance errors", () => {
      expect(describeError({ message: "User rejected the request." })).toBe(
        "Transaction was cancelled in wallet."
      );
      expect(describeError({ message: "insufficient funds for gas * price + value" })).toBe(
        "Insufficient BOT balance for transaction and gas."
      );
      expect(describeError(null)).toBe("Transaction failed.");
    });
  });
});
