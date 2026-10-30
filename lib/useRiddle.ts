"use client";

import { activeBotChain } from "@/lib/botchain/chain";
import { assertActiveChain, checkedWrite, waitSuccess } from "@/lib/useChainWrite";
import { useState, useCallback } from "react";
import {
  useAccount,
  useChainId,
  usePublicClient,
  useWalletClient,
} from "wagmi";
import { type Address, parseEther } from "viem";
import { useToast } from "@/components/ui/Toast";
import { riddleAbi } from "./botchain/abi";
import { getDeployment, isDeployed } from "./botchain/deployment";
import { type BotChainId, isBotChainId } from "./botchain/chain";
import { describeError } from "./errors";
import type { Puzzle } from "./riddle";

export function useRiddle() {
  const chainId = useChainId();
  const currentChainId: BotChainId = isBotChainId(chainId) ? chainId : 968;
  const deployment = getDeployment(currentChainId);
  const deployed = isDeployed(currentChainId);

  const publicClient = usePublicClient(); // stable-hook-result
  const { data: walletClient } = useWalletClient(); // stable-hook-result
  const { address } = useAccount();
  const { toast } = useToast();

  const [isTransacting, setIsTransacting] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);

  // --- Reads ---

  const fetchPuzzleCount = useCallback(async (): Promise<bigint> => {
    if (!publicClient || !deployed) return 0n; // honesty-ok: counter starts at zero
    try {
      const count = await publicClient.readContract({
        address: deployment.address,
        abi: riddleAbi,
        functionName: "puzzleCount",
      });
      return count;
    } catch {
      return 0n; // honesty-ok: initial count
    }
  }, [publicClient, deployed, deployment.address]);

  const fetchLatest = useCallback(
    async (offset: bigint = 0n, count: bigint = 50n): Promise<Puzzle[]> => {
      if (!publicClient || !deployed) return [];
      try {
        const [items, ids] = await publicClient.readContract({
          address: deployment.address,
          abi: riddleAbi,
          functionName: "latest",
          args: [offset, count],
        });

        return items.map((p, index) => ({
          id: ids[index],
          creator: p.creator,
          pool: BigInt(p.pool),
          deadline: BigInt(p.deadline),
          answerHash: p.answerHash,
          solved: Number(p.solved),
          reclaimed: Boolean(p.reclaimed),
          question: p.question,
        }));
      } catch (err) {
        console.error("fetchLatest error:", err);
        return [];
      }
    },
    [publicClient, deployed, deployment.address]
  );

  const fetchPuzzle = useCallback(
    async (
      id: bigint
    ): Promise<{
      puzzle: Puzzle | null;
      winners: readonly [`0x${string}`, `0x${string}`, `0x${string}`];
    }> => {
      if (!publicClient || !deployed || id <= 0n) {
        return {
          puzzle: null,
          winners: [
            "0x0000000000000000000000000000000000000000",
            "0x0000000000000000000000000000000000000000",
            "0x0000000000000000000000000000000000000000",
          ],
        };
      }
      try {
        const [p, winners] = await Promise.all([
          publicClient.readContract({
            address: deployment.address,
            abi: riddleAbi,
            functionName: "puzzleOf",
            args: [id],
          }),
          publicClient.readContract({
            address: deployment.address,
            abi: riddleAbi,
            functionName: "winnersOf",
            args: [id],
          }),
        ]);

        const puzzle: Puzzle = {
          id,
          creator: p.creator,
          pool: BigInt(p.pool),
          deadline: BigInt(p.deadline),
          answerHash: p.answerHash,
          solved: Number(p.solved),
          reclaimed: Boolean(p.reclaimed),
          question: p.question,
        };

        return { puzzle, winners };
      } catch (err) {
        console.error("fetchPuzzle error:", err);
        return {
          puzzle: null,
          winners: [
            "0x0000000000000000000000000000000000000000",
            "0x0000000000000000000000000000000000000000",
            "0x0000000000000000000000000000000000000000",
          ],
        };
      }
    },
    [publicClient, deployed, deployment.address]
  );

  const fetchCommitment = useCallback(
    async (
      id: bigint,
      solver: Address
    ): Promise<{ commitment: `0x${string}`; blockNumber: bigint }> => {
      if (!publicClient || !deployed || id <= 0n) {
        return {
          commitment:
            "0x0000000000000000000000000000000000000000000000000000000000000000",
          blockNumber: 0n, // honesty-ok: default block number
        };
      }
      try {
        const [commitment, blockNumber] = await publicClient.readContract({
          address: deployment.address,
          abi: riddleAbi,
          functionName: "commitmentOf",
          args: [id, solver],
        });
        return { commitment, blockNumber: BigInt(blockNumber) };
      } catch {
        return {
          commitment:
            "0x0000000000000000000000000000000000000000000000000000000000000000",
          blockNumber: 0n, // honesty-ok: default block number
        };
      }
    },
    [publicClient, deployed, deployment.address]
  );

  const fetchPendingBalance = useCallback(
    async (user: Address): Promise<bigint> => {
      if (!publicClient || !deployed) return 0n; // honesty-ok: unread balance
      try {
        const balance = await publicClient.readContract({
          address: deployment.address,
          abi: riddleAbi,
          functionName: "pending",
          args: [user],
        });
        return BigInt(balance);
      } catch {
        return 0n; // honesty-ok: unread balance
      }
    },
    [publicClient, deployed, deployment.address]
  );

  // --- Writes ---

  const createRiddle = useCallback(
    async (
      question: string,
      answerHash: `0x${string}`,
      durationSecs: bigint,
      poolWei: bigint
    ): Promise<bigint | null> => {
      if (!walletClient || !publicClient || !deployed) {
        toast("error", "Please connect your wallet on the BotChain network.");
        return null;
      }

      setIsTransacting(true);
      try {
        await assertActiveChain(walletClient);
        const hash = await checkedWrite(walletClient, publicClient, {
          address: deployment.address,
          abi: riddleAbi,
          functionName: "create",
          args: [question, answerHash, durationSecs],
          value: poolWei,
        });

        setTxHash(hash);
        toast("info", "Inscribing riddle on the chain...");

        const receipt = await waitSuccess(publicClient, hash);
        toast("success", "Riddle inscribed successfully!");

        // Parse return or log
        const count = await fetchPuzzleCount();
        return count;
      } catch (err) {
        console.error("createRiddle error:", err);
        toast("error", describeError(err));
        return null;
      } finally {
        setIsTransacting(false);
      }
    },
    [walletClient, publicClient, deployed, deployment.address, toast, fetchPuzzleCount]
  );

  const commitSolve = useCallback(
    async (id: bigint, commitment: `0x${string}`): Promise<boolean> => {
      if (!walletClient || !publicClient || !deployed) {
        toast("error", "Please connect your wallet.");
        return false;
      }

      setIsTransacting(true);
      try {
        await assertActiveChain(walletClient);
        const hash = await checkedWrite(walletClient, publicClient, {
          address: deployment.address,
          abi: riddleAbi,
          functionName: "commitSolve",
          args: [id, commitment],
        });

        setTxHash(hash);
        toast("info", "Sealing your guess on-chain...");

        await waitSuccess(publicClient, hash);
        toast("success", "Guess sealed! Wait for the next block to reveal.");
        return true;
      } catch (err) {
        console.error("commitSolve error:", err);
        toast("error", describeError(err));
        return false;
      } finally {
        setIsTransacting(false);
      }
    },
    [walletClient, publicClient, deployed, deployment.address, toast]
  );

  const reveal = useCallback(
    async (id: bigint, answer: string, salt: `0x${string}`): Promise<boolean> => {
      if (!walletClient || !publicClient || !deployed) {
        toast("error", "Please connect your wallet.");
        return false;
      }

      setIsTransacting(true);
      try {
        await assertActiveChain(walletClient);
        const hash = await checkedWrite(walletClient, publicClient, {
          address: deployment.address,
          abi: riddleAbi,
          functionName: "reveal",
          args: [id, answer, salt],
        });

        setTxHash(hash);
        toast("info", "Verifying your answer on-chain...");

        await waitSuccess(publicClient, hash);
        toast("success", "Answer proved! You have claimed your prize medal.");
        return true;
      } catch (err) {
        console.error("reveal error:", err);
        toast("error", describeError(err));
        return false;
      } finally {
        setIsTransacting(false);
      }
    },
    [walletClient, publicClient, deployed, deployment.address, toast]
  );

  const reclaim = useCallback(
    async (id: bigint): Promise<boolean> => {
      if (!walletClient || !publicClient || !deployed) {
        toast("error", "Please connect your wallet.");
        return false;
      }

      setIsTransacting(true);
      try {
        await assertActiveChain(walletClient);
        const hash = await checkedWrite(walletClient, publicClient, {
          address: deployment.address,
          abi: riddleAbi,
          functionName: "reclaim",
          args: [id],
        });

        setTxHash(hash);
        toast("info", "Reclaiming riddle funds...");

        await waitSuccess(publicClient, hash);
        toast("success", "Riddle pool reclaimed into your pending till!");
        return true;
      } catch (err) {
        console.error("reclaim error:", err);
        toast("error", describeError(err));
        return false;
      } finally {
        setIsTransacting(false);
      }
    },
    [walletClient, publicClient, deployed, deployment.address, toast]
  );

  const withdraw = useCallback(async (): Promise<boolean> => {
    if (!walletClient || !publicClient || !deployed) {
      toast("error", "Please connect your wallet.");
      return false;
    }

    setIsTransacting(true);
    try {
      await assertActiveChain(walletClient);
      const hash = await checkedWrite(walletClient, publicClient, {
        address: deployment.address,
        abi: riddleAbi,
        functionName: "withdraw",
      });

      setTxHash(hash);
      toast("info", "Withdrawing BOT to your wallet...");

      await waitSuccess(publicClient, hash);
      toast("success", "Funds withdrawn to your wallet!");
      return true;
    } catch (err) {
      console.error("withdraw error:", err);
      toast("error", describeError(err));
      return false;
    } finally {
      setIsTransacting(false);
    }
  }, [walletClient, publicClient, deployed, deployment.address, toast]);

  return {
    deployed,
    deployment,
    currentChainId,
    isTransacting,
    txHash,
    fetchPuzzleCount,
    fetchLatest,
    fetchPuzzle,
    fetchCommitment,
    fetchPendingBalance,
    createRiddle,
    commitSolve,
    reveal,
    reclaim,
    withdraw,
  };
}
