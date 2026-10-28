import { decodeEventLog, type Log } from "viem";
import { riddleAbi } from "./botchain/abi";

export interface CreatedEvent {
  id: bigint;
  creator: `0x${string}`;
  question: string;
  answerHash: `0x${string}`;
  pool: bigint;
  deadline: bigint;
}

export interface CommittedEvent {
  id: bigint;
  solver: `0x${string}`;
  blockNumber: bigint;
}

export interface SolvedEvent {
  id: bigint;
  solver: `0x${string}`;
  rank: number;
  payout: bigint;
  answer: string;
}

export interface ReclaimedEvent {
  id: bigint;
  amount: bigint;
}

export interface WithdrawnEvent {
  to: `0x${string}`;
  amount: bigint;
}

export function parseRiddleLog(log: { data: `0x${string}`; topics: [`0x${string}`, ...`0x${string}`[]] | [] }) {
  try {
    return decodeEventLog({
      abi: riddleAbi,
      data: log.data,
      topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
    });
  } catch {
    return null;
  }
}
