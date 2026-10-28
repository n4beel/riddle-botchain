/**
 * Local stack runner and seeder for Riddle (Archetype AK · Scroll).
 *
 * Spawns anvil on port 8732 with chain id 968, deploys Riddle, and seeds state per spec §5:
 * - Riddle 1: Open (no commits). Pool 5 BOT.
 * - Riddle 2: Sealed guess by Account 2 (Charlie), ready to show. Pool 3 BOT.
 * - Riddle 3: One solver paid (rank 1). Pool 2 BOT.
 * - Riddle 4: All three solved (50/30/20). Pool 10 BOT.
 * - Riddle 5: Expired with unspent pool. Pool 1.5 BOT.
 * - Riddle 6: Reclaimed. Pool 4 BOT.
 *
 * Usage:
 *   node scripts/local-stack.mjs
 *   npm run dev
 */

import { spawn, execSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  encodeAbiParameters,
  http,
  keccak256,
  parseAbiParameters,
  parseEther,
  toHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const PORT = 8732;
const RPC = `http://127.0.0.1:${PORT}`;
const CHAIN_ID = 968;

const KEYS = [
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", // 0: Alice (Creator)
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d", // 1: Bob (Solver A)
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a", // 2: Charlie (Solver B)
  "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6", // 3: Dave (Solver C)
  "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a", // 4: Eve (Solver D)
];

const accounts = KEYS.map((k) => privateKeyToAccount(k));

const local = defineChain({
  id: CHAIN_ID,
  name: "anvil",
  nativeCurrency: { name: "Test BOT", symbol: "tBOT", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
});

try {
  execSync(`fuser -k ${PORT}/tcp 2>/dev/null || true`);
} catch {}

console.log(`Starting anvil on port ${PORT}...`);
spawn(
  "anvil",
  [
    "--port",
    String(PORT),
    "--chain-id",
    String(CHAIN_ID),
    "--accounts",
    "10",
    "--balance",
    "1000",
    "--silent",
  ],
  { detached: true, stdio: "ignore" }
).unref();

const pub = createPublicClient({ chain: local, transport: http() });

for (let i = 0; i < 40; i++) {
  try {
    await pub.getBlockNumber();
    break;
  } catch {
    await new Promise((r) => setTimeout(r, 100));
  }
}

const [alice, bob, charlie, dave, eve] = accounts.map((acc) =>
  createWalletClient({ account: acc, chain: local, transport: http() })
);

const artifact = JSON.parse(
  readFileSync("contracts/out/Riddle.sol/Riddle.json", "utf8")
);

console.log("Deploying Riddle contract...");
const deployTx = await alice.deployContract({
  abi: artifact.abi,
  bytecode: artifact.bytecode.object,
});
const deployReceipt = await pub.waitForTransactionReceipt({ hash: deployTx });
const contractAddress = deployReceipt.contractAddress;
const startBlock = deployReceipt.blockNumber;
console.log(`Deployed Riddle to ${contractAddress} at block ${startBlock}`);

function normalize(input) {
  let res = "";
  let inSpace = true;
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    if (code === 32 || code === 9 || code === 10 || code === 13) {
      if (!inSpace) {
        res += " ";
        inSpace = true;
      }
    } else {
      if (code >= 65 && code <= 90) {
        res += String.fromCharCode(code + 32);
      } else {
        res += input[i];
      }
      inSpace = false;
    }
  }
  if (res.endsWith(" ")) res = res.slice(0, -1);
  return res;
}

function answerHash(ans) {
  return keccak256(toHex(normalize(ans)));
}

function commitmentFor(id, solver, ans, salt) {
  const norm = normalize(ans);
  const encoded = encodeAbiParameters(
    parseAbiParameters("uint256, address, string, bytes32"),
    [id, solver, norm, salt]
  );
  return keccak256(encoded);
}

async function mineBlock() {
  await pub.request({ method: "evm_mine", params: [] });
}

async function increaseTime(seconds) {
  await pub.request({ method: "evm_increaseTime", params: [seconds] });
  await mineBlock();
}

// 1. Riddle 1: Open (no commits)
console.log("Seeding Riddle 1: Open (no commits)...");
const txR1 = await alice.writeContract({
  address: contractAddress,
  abi: artifact.abi,
  functionName: "create",
  args: [
    "What has roots that nobody sees, is taller than trees, up, up it goes, and yet never grows?",
    answerHash("mountain"),
    86400n * 30n,
  ],
  value: parseEther("5"),
});
await pub.waitForTransactionReceipt({ hash: txR1 });

// 2. Riddle 2: Charlie has sealed a guess (ready to show)
console.log("Seeding Riddle 2: Sealed guess by Charlie...");
const txR2 = await alice.writeContract({
  address: contractAddress,
  abi: artifact.abi,
  functionName: "create",
  args: [
    "Thirty white horses on a red hill, first they champ, then they stamp, then they stand still.",
    answerHash("teeth"),
    86400n * 14n,
  ],
  value: parseEther("3"),
});
await pub.waitForTransactionReceipt({ hash: txR2 });

const saltCharlie = "0x2222222222222222222222222222222222222222222222222222222222222222";
const commCharlie = commitmentFor(2n, charlie.account.address, "teeth", saltCharlie);
const txCommR2 = await charlie.writeContract({
  address: contractAddress,
  abi: artifact.abi,
  functionName: "commitSolve",
  args: [2n, commCharlie],
});
await pub.waitForTransactionReceipt({ hash: txCommR2 });
await mineBlock(); // Charlie is ready to reveal

// 3. Riddle 3: One solver paid (rank 1)
console.log("Seeding Riddle 3: One solver paid (Bob)...");
const txR3 = await alice.writeContract({
  address: contractAddress,
  abi: artifact.abi,
  functionName: "create",
  args: [
    "Voiceless it cries, wingless flutters, toothless bites, mouthless mutters.",
    answerHash("wind"),
    86400n * 7n,
  ],
  value: parseEther("2"),
});
await pub.waitForTransactionReceipt({ hash: txR3 });

const saltBobR3 = "0x1111111111111111111111111111111111111111111111111111111111111111";
const commBobR3 = commitmentFor(3n, bob.account.address, "wind", saltBobR3);
const txCommR3 = await bob.writeContract({
  address: contractAddress,
  abi: artifact.abi,
  functionName: "commitSolve",
  args: [3n, commBobR3],
});
await pub.waitForTransactionReceipt({ hash: txCommR3 });
await mineBlock();

const txRevR3 = await bob.writeContract({
  address: contractAddress,
  abi: artifact.abi,
  functionName: "reveal",
  args: [3n, "wind", saltBobR3],
});
await pub.waitForTransactionReceipt({ hash: txRevR3 });

// 4. Riddle 4: All three solved
console.log("Seeding Riddle 4: All three solved (Bob, Charlie, Dave)...");
const txR4 = await alice.writeContract({
  address: contractAddress,
  abi: artifact.abi,
  functionName: "create",
  args: [
    "An eye in a blue face saw an eye in a green face. That eye is like to this eye, said the first eye.",
    answerHash("sun"),
    86400n * 10n,
  ],
  value: parseEther("10"),
});
await pub.waitForTransactionReceipt({ hash: txR4 });

// Solvers commit
const s1 = "0x1111111111111111111111111111111111111111111111111111111111111111";
const s2 = "0x2222222222222222222222222222222222222222222222222222222222222222";
const s3 = "0x3333333333333333333333333333333333333333333333333333333333333333";

const c1 = commitmentFor(4n, bob.account.address, "sun", s1);
const c2 = commitmentFor(4n, charlie.account.address, "sun", s2);
const c3 = commitmentFor(4n, dave.account.address, "sun", s3);

await pub.waitForTransactionReceipt({
  hash: await bob.writeContract({ address: contractAddress, abi: artifact.abi, functionName: "commitSolve", args: [4n, c1] }),
});
await pub.waitForTransactionReceipt({
  hash: await charlie.writeContract({ address: contractAddress, abi: artifact.abi, functionName: "commitSolve", args: [4n, c2] }),
});
await pub.waitForTransactionReceipt({
  hash: await dave.writeContract({ address: contractAddress, abi: artifact.abi, functionName: "commitSolve", args: [4n, c3] }),
});

await mineBlock();

// Reveals
await pub.waitForTransactionReceipt({
  hash: await bob.writeContract({ address: contractAddress, abi: artifact.abi, functionName: "reveal", args: [4n, "sun", s1] }),
});
await pub.waitForTransactionReceipt({
  hash: await charlie.writeContract({ address: contractAddress, abi: artifact.abi, functionName: "reveal", args: [4n, "sun", s2] }),
});
await pub.waitForTransactionReceipt({
  hash: await dave.writeContract({ address: contractAddress, abi: artifact.abi, functionName: "reveal", args: [4n, "sun", s3] }),
});

// 5. Riddle 5: Expired with unspent pool
console.log("Seeding Riddle 5: Expired with unspent pool...");
const txR5 = await alice.writeContract({
  address: contractAddress,
  abi: artifact.abi,
  functionName: "create",
  args: [
    "It cannot be seen, cannot be felt, cannot be heard, cannot be smelt. It lies behind stars and under hills.",
    answerHash("dark"),
    3600n, // 1 hour
  ],
  value: parseEther("1.5"),
});
await pub.waitForTransactionReceipt({ hash: txR5 });

// 6. Riddle 6: Reclaimed
console.log("Seeding Riddle 6: Reclaimed...");
const txR6 = await alice.writeContract({
  address: contractAddress,
  abi: artifact.abi,
  functionName: "create",
  args: [
    "Alive without breath, as cold as death; never thirsty, ever drinking, all in mail never clinking.",
    answerHash("fish"),
    3600n, // 1 hour
  ],
  value: parseEther("4"),
});
await pub.waitForTransactionReceipt({ hash: txR6 });

// Advance time past 1 hour so Riddle 5 & Riddle 6 expire
await increaseTime(3601);

// Reclaim Riddle 6
const txRec6 = await alice.writeContract({
  address: contractAddress,
  abi: artifact.abi,
  functionName: "reclaim",
  args: [6n],
});
await pub.waitForTransactionReceipt({ hash: txRec6 });

console.log("\nRoles Table:");
console.log("------------------------------------------------------------------------------------------------");
console.log("| Role                 | Index | Address                                    | Private Key (first 10) |");
console.log("------------------------------------------------------------------------------------------------");
console.log(`| Creator (Alice)      | 0     | ${accounts[0].address} | ${KEYS[0].slice(0, 10)}... |`);
console.log(`| Solver A (Bob)       | 1     | ${accounts[1].address} | ${KEYS[1].slice(0, 10)}... |`);
console.log(`| Solver B (Charlie)   | 2     | ${accounts[2].address} | ${KEYS[2].slice(0, 10)}... |`);
console.log(`| Solver C (Dave)      | 3     | ${accounts[3].address} | ${KEYS[3].slice(0, 10)}... |`);
console.log(`| Solver D (Eve)       | 4     | ${accounts[4].address} | ${KEYS[4].slice(0, 10)}... |`);
console.log("------------------------------------------------------------------------------------------------\n");

console.log("Seeded Status Table:");
console.log("------------------------------------------------------------------------------------------------");
console.log("| ID | Question Preview          | Pool      | Solved | State       | Solver / Creator State     |");
console.log("------------------------------------------------------------------------------------------------");
console.log("| 1  | What has roots that...    | 5.00 BOT  | 0/3    | Open        | Fresh riddle on shelf      |");
console.log("| 2  | Thirty white horses...    | 3.00 BOT  | 0/3    | Sealed      | Charlie ready to reveal    |");
console.log("| 3  | Voiceless it cries...     | 2.00 BOT  | 1/3    | In Progress | Bob won 1.0 BOT (50%)      |");
console.log("| 4  | An eye in a blue face...  | 10.0 BOT  | 3/3    | Complete    | 3 prizes awarded (5/3/2)   |");
console.log("| 5  | It cannot be seen...      | 1.50 BOT  | 0/3    | Expired     | Alice can Reclaim unspent  |");
console.log("| 6  | Alive without breath...   | 4.00 BOT  | 0/3    | Reclaimed   | Alice reclaimed 4.0 BOT    |");
console.log("------------------------------------------------------------------------------------------------\n");

// Write .env.local
const envContent = [
  `NEXT_PUBLIC_BOTCHAIN_NETWORK=testnet`,
  `NEXT_PUBLIC_BOHR_RPC=${RPC}`,
  `NEXT_PUBLIC_CONTRACT_968=${contractAddress}`,
  `NEXT_PUBLIC_DEPLOY_BLOCK_968=${startBlock}`,
  "",
].join("\n");

writeFileSync(".env.local", envContent);
console.log("Wrote .env.local");

try {
  mkdirSync("deployments", { recursive: true });
} catch {}
writeFileSync(
  "deployments/localhost.json",
  JSON.stringify(
    { address: contractAddress, chainId: CHAIN_ID, network: "localhost" },
    null,
    2
  )
);
console.log("Wrote deployments/localhost.json");
console.log(`\nLocal stack ready on port ${PORT}!`);
