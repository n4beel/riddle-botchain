import { activeBotChain } from "@/lib/botchain/chain";
import { decodeErrorResult } from "viem";
import { riddleAbi } from "./botchain/abi";

export function describeError(err: unknown): string {
  // A wallet on the other BOT Chain network: writes are pinned to this build's chain (lib/useChainWrite.ts), so wagmi
  // refuses before the wallet opens. Say what to do, not the library's name for it.
  if (/ConnectorChainMismatch|chain mismatch|does not match the target chain/i.test(err instanceof Error ? `${err.name} ${err.message}` : String(err))) {
    return `Your wallet is on a different network. Switch it to ${activeBotChain.name}, then try again.`;
  }
  if (!err) return "Transaction failed.";

  const errorObj = err as {
    data?: `0x${string}`;
    error?: { data?: `0x${string}` };
    cause?: { data?: `0x${string}` };
    message?: string;
  };

  const hexData =
    errorObj.data ||
    errorObj.error?.data ||
    errorObj.cause?.data;

  if (hexData && typeof hexData === "string" && hexData.startsWith("0x")) {
    try {
      const decoded = decodeErrorResult({
        abi: riddleAbi,
        data: hexData,
      });

      switch (decoded.errorName) {
        case "TooSoon":
          return "Wait for the next block, then show your answer.";
        case "WrongAnswer":
          return "That isn't the answer.";
        case "PrizesTaken":
          return "All three prizes are taken.";
        case "CreatorCannotSolve":
          return "Creators cannot solve their own riddles.";
        case "BadReveal":
          return "Reveal data does not match your commitment.";
        case "Closed":
          return "This riddle has expired.";
        case "AlreadyCommitted":
          return "You have already sealed a guess for this riddle.";
        case "NoCommitment":
          return "No sealed guess found for this address.";
        case "AlreadyWon":
          return "You have already won a prize for this riddle.";
        case "NoPrize":
          return "You must deposit a prize pool.";
        case "BadAnswerHash":
          return "Answer hash cannot be zero.";
        case "BadQuestion":
          return "Question must be between 1 and 140 bytes.";
        case "BadDuration":
          return "Duration must be between 1 hour and 90 days.";
        case "NoSuchPuzzle":
          return "Riddle does not exist.";
        case "OnlyCreator":
          return "Only the creator can reclaim this riddle.";
        case "NotReclaimable":
          return "Riddle cannot be reclaimed yet.";
        case "AlreadyReclaimed":
          return "This riddle has already been reclaimed.";
        case "NothingToWithdraw":
          return "No pending balance to withdraw.";
        case "TransferFailed":
          return "BOT transfer failed.";
        case "ReentrancyGuardReentrantCall":
          return "Reentrant call detected.";
        default:
          return "Transaction reverted with contract error.";
      }
    } catch {
      // Hex didn't match riddleAbi errors
    }
  }

  const msg = errorObj.message || "";
  if (msg.includes("User rejected") || msg.includes("denied transaction")) {
    return "Transaction was cancelled in wallet.";
  }
  if (msg.includes("insufficient funds")) {
    return "Insufficient BOT balance for transaction and gas.";
  }

  return "Transaction failed. Please try again.";
}
