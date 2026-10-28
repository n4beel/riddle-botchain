import {
  encodeAbiParameters,
  keccak256,
  parseAbiParameters,
  toHex,
  type Address,
} from "viem";

export interface Puzzle {
  id: bigint;
  creator: `0x${string}`;
  pool: bigint;
  deadline: bigint;
  answerHash: `0x${string}`;
  solved: number;
  reclaimed: boolean;
  question: string;
}

/**
 * Exact replica of Riddle.sol's normalize function:
 * - Trims leading & trailing ASCII whitespace (space, tab, newline, CR)
 * - Lowercases ASCII uppercase 'A'..'Z' to 'a'..'z'
 * - Collapses consecutive ASCII whitespace characters to a single space
 */
export function normalize(input: string): string {
  let res = "";
  let inSpace = true;

  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    // whitespace: space (32), tab (9), newline (10), CR (13)
    if (code === 32 || code === 9 || code === 10 || code === 13) {
      if (!inSpace) {
        res += " ";
        inSpace = true;
      }
    } else {
      // ASCII uppercase A-Z (65..90)
      if (code >= 65 && code <= 90) {
        res += String.fromCharCode(code + 32);
      } else {
        res += input[i];
      }
      inSpace = false;
    }
  }

  if (res.endsWith(" ")) {
    res = res.slice(0, -1);
  }

  return res;
}

/**
 * Computes keccak256 hash of normalized answer
 */
export function answerHash(answer: string): `0x${string}` {
  const norm = normalize(answer);
  return keccak256(toHex(norm));
}

/**
 * Computes commitment hash matching Riddle.sol:
 * keccak256(abi.encode(id, solver, normalize(answer), salt))
 */
export function commitmentFor(
  puzzleId: bigint,
  solver: Address,
  answer: string,
  salt: `0x${string}`
): `0x${string}` {
  const norm = normalize(answer);
  const encoded = encodeAbiParameters(
    parseAbiParameters("uint256, address, string, bytes32"),
    [puzzleId, solver, norm, salt]
  );
  return keccak256(encoded);
}

/**
 * Computes 50% / 30% / 20% prizes from a total pool
 */
export function payouts(pool: bigint): [bigint, bigint, bigint] {
  const p1 = (pool * 50n) / 100n;
  const p2 = (pool * 30n) / 100n;
  const p3 = (pool * 20n) / 100n;
  return [p1, p2, p3];
}

/**
 * Generates a random 32-byte salt as a hex string
 */
export function generateSalt(): `0x${string}` {
  const randomBytes = new Uint8Array(32);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(randomBytes);
  } else {
    for (let i = 0; i < 32; i++) {
      randomBytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return ("0x" +
    Array.from(randomBytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")) as `0x${string}`;
}

export type SolverPhase =
  | "reclaimed"
  | "all_solved"
  | "expired"
  | "won"
  | "ready_to_reveal"
  | "sealed_waiting"
  | "open";

export function determinePhase(params: {
  puzzle: Puzzle;
  userAddress?: Address;
  userCommitment?: `0x${string}`;
  userCommitBlock?: bigint;
  userHasWon?: boolean;
  currentBlock?: bigint;
  currentTime?: bigint;
}): SolverPhase {
  const {
    puzzle,
    userCommitment,
    userCommitBlock,
    userHasWon,
    currentBlock,
    currentTime = BigInt(Math.floor(Date.now() / 1000)),
  } = params;

  if (puzzle.reclaimed) return "reclaimed";
  if (puzzle.solved >= 3) return "all_solved";
  if (currentTime >= puzzle.deadline) return "expired";
  if (userHasWon) return "won";

  const hasCommit =
    userCommitment &&
    userCommitment !==
      "0x0000000000000000000000000000000000000000000000000000000000000000";

  if (hasCommit && userCommitBlock) {
    if (currentBlock && currentBlock > userCommitBlock) {
      return "ready_to_reveal";
    }
    return "sealed_waiting";
  }

  return "open";
}

// --- Browser Local Storage Store for Guesses ---

export interface StoredGuess {
  puzzleId: string;
  solver: `0x${string}`;
  answer: string;
  salt: `0x${string}`;
  commitment: `0x${string}`;
  committedBlock?: string;
  timestamp: number;
}

const STORAGE_KEY = "botchain_riddle_guesses";

export const guessStore = {
  save(guess: StoredGuess): void {
    if (typeof window === "undefined" || !window.localStorage) return;
    try {
      const all = guessStore.listAll();
      const idx = all.findIndex(
        (g) =>
          g.puzzleId === guess.puzzleId &&
          g.solver.toLowerCase() === guess.solver.toLowerCase()
      );
      if (idx >= 0) {
        all[idx] = guess;
      } else {
        all.push(guess);
      }
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    } catch {
      // ignore local storage errors
    }
  },

  get(puzzleId: bigint | string, solver: Address): StoredGuess | null {
    if (typeof window === "undefined" || !window.localStorage) return null;
    try {
      const all = guessStore.listAll();
      const pId = puzzleId.toString();
      const s = solver.toLowerCase();
      return (
        all.find((g) => g.puzzleId === pId && g.solver.toLowerCase() === s) ||
        null
      );
    } catch {
      return null;
    }
  },

  listBySolver(solver: Address): StoredGuess[] {
    if (typeof window === "undefined" || !window.localStorage) return [];
    try {
      const all = guessStore.listAll();
      const s = solver.toLowerCase();
      return all.filter((g) => g.solver.toLowerCase() === s);
    } catch {
      return [];
    }
  },

  listAll(): StoredGuess[] {
    if (typeof window === "undefined" || !window.localStorage) return [];
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      return JSON.parse(raw);
    } catch {
      return [];
    }
  },

  remove(puzzleId: bigint | string, solver: Address): void {
    if (typeof window === "undefined" || !window.localStorage) return;
    try {
      const all = guessStore.listAll();
      const pId = puzzleId.toString();
      const s = solver.toLowerCase();
      const filtered = all.filter(
        (g) => !(g.puzzleId === pId && g.solver.toLowerCase() === s)
      );
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    } catch {
      // ignore
    }
  },
};
