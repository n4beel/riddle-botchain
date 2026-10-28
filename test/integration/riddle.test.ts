import { spawn, execSync, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  parseEther,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { riddleAbi } from "@/lib/botchain/abi";
import { answerHash, commitmentFor, normalize } from "@/lib/riddle";

const PORT = 8632;
const RPC = `http://127.0.0.1:${PORT}`;
const CHAIN_ID = 968;

const localChain = defineChain({
  id: CHAIN_ID,
  name: "anvil",
  nativeCurrency: { name: "Test BOT", symbol: "tBOT", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
});

const ACCOUNTS = [
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", // 0: Alice (Creator)
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d", // 1: Bob (Solver 1)
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a", // 2: Charlie (Solver 2)
  "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6", // 3: Dave (Solver 3)
  "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a", // 4: Eve (Solver 4)
].map((k) => privateKeyToAccount(k as `0x${string}`));

describe("Riddle On-Chain Integration Tests", () => {
  let anvil: ChildProcess;
  let contractAddress: Address;

  const publicClient = createPublicClient({
    chain: localChain,
    transport: http(RPC),
  });

  const [alice, bob, charlie, dave, eve] = ACCOUNTS.map((account) =>
    createWalletClient({
      account,
      chain: localChain,
      transport: http(RPC),
    })
  );

  async function mineBlock() {
    await publicClient.request({
      method: "evm_mine" as any,
      params: [] as any,
    });
  }

  async function advanceTime(seconds: number) {
    await publicClient.request({
      method: "evm_increaseTime" as any,
      params: [seconds] as any,
    });
    await mineBlock();
  }

  beforeAll(async () => {
    try {
      execSync(`fuser -k ${PORT}/tcp 2>/dev/null || true`);
    } catch {}

    anvil = spawn("anvil", [
      "--port",
      String(PORT),
      "--chain-id",
      String(CHAIN_ID),
      "--silent",
    ]);

    for (let i = 0; i < 30; i++) {
      try {
        await publicClient.getBlockNumber();
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 100));
      }
    }

    const artifactPath = join(
      process.cwd(),
      "contracts",
      "out",
      "Riddle.sol",
      "Riddle.json"
    );
    const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));

    const deployHash = await alice.deployContract({
      abi: artifact.abi,
      bytecode: artifact.bytecode.object as `0x${string}`,
    });

    const receipt = await publicClient.waitForTransactionReceipt({
      hash: deployHash,
    });
    contractAddress = receipt.contractAddress!;
  });

  afterAll(() => {
    if (anvil) {
      anvil.kill("SIGKILL");
    }
  });

  it("deploys contract and initializes puzzleCount to 0", async () => {
    const count = await publicClient.readContract({
      address: contractAddress,
      abi: riddleAbi,
      functionName: "puzzleCount",
    });
    expect(count).toBe(0n);
  });

  it("Alice creates a riddle with prize pool and duration", async () => {
    const question = "What has roots that nobody sees, and is taller than trees?";
    const ans = "mountain";
    const aHash = answerHash(ans);

    const hash = await alice.writeContract({
      address: contractAddress,
      abi: riddleAbi,
      functionName: "create",
      args: [question, aHash, 86400n],
      value: parseEther("10"),
    });

    await publicClient.waitForTransactionReceipt({ hash });

    const count = await publicClient.readContract({
      address: contractAddress,
      abi: riddleAbi,
      functionName: "puzzleCount",
    });
    expect(count).toBe(1n);

    const puzzle = await publicClient.readContract({
      address: contractAddress,
      abi: riddleAbi,
      functionName: "puzzleOf",
      args: [1n],
    });

    expect(puzzle.creator.toLowerCase()).toBe(alice.account.address.toLowerCase());
    expect(puzzle.pool).toBe(parseEther("10"));
    expect(puzzle.question).toBe(question);
    expect(puzzle.solved).toBe(0);
    expect(puzzle.reclaimed).toBe(false);
  });

  it("Bob commits a sealed guess", async () => {
    const salt = "0x1111111111111111111111111111111111111111111111111111111111111111" as const;
    const comm = commitmentFor(1n, bob.account.address, "Mountain", salt);

    const hash = await bob.writeContract({
      address: contractAddress,
      abi: riddleAbi,
      functionName: "commitSolve",
      args: [1n, comm],
    });

    await publicClient.waitForTransactionReceipt({ hash });

    const [storedComm] = await publicClient.readContract({
      address: contractAddress,
      abi: riddleAbi,
      functionName: "commitmentOf",
      args: [1n, bob.account.address],
    });

    expect(storedComm).toBe(comm);
  });

  it("Bob attempting reveal in the same block reverts with TooSoon", async () => {
    const salt = "0x1111111111111111111111111111111111111111111111111111111111111111" as const;

    await expect(
      publicClient.simulateContract({
        account: bob.account,
        address: contractAddress,
        abi: riddleAbi,
        functionName: "reveal",
        args: [1n, "Mountain", salt],
      })
    ).rejects.toThrow();
  });

  it("Dave copying Bob's commitment cannot reveal as Dave (BadReveal)", async () => {
    // Dave copies Bob's commitment and commits it for himself
    const salt = "0x1111111111111111111111111111111111111111111111111111111111111111" as const;
    const bobsComm = commitmentFor(1n, bob.account.address, "Mountain", salt);

    const hash = await dave.writeContract({
      address: contractAddress,
      abi: riddleAbi,
      functionName: "commitSolve",
      args: [1n, bobsComm],
    });
    await publicClient.waitForTransactionReceipt({ hash });

    await mineBlock();

    // Now Dave tries to reveal the copied answer and salt
    // Because Dave's address != Bob's address, commitment computed for Dave will not match bobsComm
    await expect(
      publicClient.simulateContract({
        account: dave.account,
        address: contractAddress,
        abi: riddleAbi,
        functionName: "reveal",
        args: [1n, "Mountain", salt],
      })
    ).rejects.toThrow();
  });

  it("Mine 1 block, Bob reveals valid answer, receives 50% prize", async () => {
    await mineBlock();

    const salt = "0x1111111111111111111111111111111111111111111111111111111111111111" as const;
    const hash = await bob.writeContract({
      address: contractAddress,
      abi: riddleAbi,
      functionName: "reveal",
      args: [1n, "Mountain", salt],
    });
    await publicClient.waitForTransactionReceipt({ hash });

    const bobsPending = await publicClient.readContract({
      address: contractAddress,
      abi: riddleAbi,
      functionName: "pending",
      args: [bob.account.address],
    });
    expect(bobsPending).toBe(parseEther("5"));

    const puzzle = await publicClient.readContract({
      address: contractAddress,
      abi: riddleAbi,
      functionName: "puzzleOf",
      args: [1n],
    });
    expect(puzzle.solved).toBe(1);

    const winners = await publicClient.readContract({
      address: contractAddress,
      abi: riddleAbi,
      functionName: "winnersOf",
      args: [1n],
    });
    expect(winners[0].toLowerCase()).toBe(bob.account.address.toLowerCase());
  });

  it("Charlie commits and reveals, receiving 30% prize", async () => {
    const salt = "0x2222222222222222222222222222222222222222222222222222222222222222" as const;
    const comm = commitmentFor(1n, charlie.account.address, "mountain", salt);

    const h1 = await charlie.writeContract({
      address: contractAddress,
      abi: riddleAbi,
      functionName: "commitSolve",
      args: [1n, comm],
    });
    await publicClient.waitForTransactionReceipt({ hash: h1 });

    await mineBlock();

    const h2 = await charlie.writeContract({
      address: contractAddress,
      abi: riddleAbi,
      functionName: "reveal",
      args: [1n, "mountain", salt],
    });
    await publicClient.waitForTransactionReceipt({ hash: h2 });

    const charliePending = await publicClient.readContract({
      address: contractAddress,
      abi: riddleAbi,
      functionName: "pending",
      args: [charlie.account.address],
    });
    expect(charliePending).toBe(parseEther("3"));
  });

  it("Eve commits and reveals, receiving 20% prize", async () => {
    const salt = "0x3333333333333333333333333333333333333333333333333333333333333333" as const;
    const comm = commitmentFor(1n, eve.account.address, "mountain", salt);

    const h1 = await eve.writeContract({
      address: contractAddress,
      abi: riddleAbi,
      functionName: "commitSolve",
      args: [1n, comm],
    });
    await publicClient.waitForTransactionReceipt({ hash: h1 });

    await mineBlock();

    const h2 = await eve.writeContract({
      address: contractAddress,
      abi: riddleAbi,
      functionName: "reveal",
      args: [1n, "mountain", salt],
    });
    await publicClient.waitForTransactionReceipt({ hash: h2 });

    const evePending = await publicClient.readContract({
      address: contractAddress,
      abi: riddleAbi,
      functionName: "pending",
      args: [eve.account.address],
    });
    expect(evePending).toBe(parseEther("2"));

    const puzzle = await publicClient.readContract({
      address: contractAddress,
      abi: riddleAbi,
      functionName: "puzzleOf",
      args: [1n],
    });
    expect(puzzle.solved).toBe(3);
  });

  it("Bob withdraws his 50% winnings via withdraw()", async () => {
    const balBefore = await publicClient.getBalance({
      address: bob.account.address,
    });

    const hash = await bob.writeContract({
      address: contractAddress,
      abi: riddleAbi,
      functionName: "withdraw",
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    const gasUsed = receipt.gasUsed * receipt.effectiveGasPrice;

    const balAfter = await publicClient.getBalance({
      address: bob.account.address,
    });

    expect(balAfter + gasUsed - balBefore).toBe(parseEther("5"));

    const pendingAfter = await publicClient.readContract({
      address: contractAddress,
      abi: riddleAbi,
      functionName: "pending",
      args: [bob.account.address],
    });
    expect(pendingAfter).toBe(0n);
  });

  it("Alice reclaims puzzle after 3 solved (dust / unspent)", async () => {
    const hash = await alice.writeContract({
      address: contractAddress,
      abi: riddleAbi,
      functionName: "reclaim",
      args: [1n],
    });
    await publicClient.waitForTransactionReceipt({ hash });

    const puzzle = await publicClient.readContract({
      address: contractAddress,
      abi: riddleAbi,
      functionName: "puzzleOf",
      args: [1n],
    });
    expect(puzzle.reclaimed).toBe(true);
  });

  it("Non-creator cannot reclaim (reverts)", async () => {
    // Alice creates riddle 2
    const hash = await alice.writeContract({
      address: contractAddress,
      abi: riddleAbi,
      functionName: "create",
      args: ["Second riddle?", answerHash("answer"), 86400n],
      value: parseEther("1"),
    });
    await publicClient.waitForTransactionReceipt({ hash });

    await advanceTime(86401);

    // Bob tries to reclaim riddle 2
    await expect(
      publicClient.simulateContract({
        account: bob.account,
        address: contractAddress,
        abi: riddleAbi,
        functionName: "reclaim",
        args: [2n],
      })
    ).rejects.toThrow();
  });
});
