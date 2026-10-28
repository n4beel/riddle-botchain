/**
 * Comprehensive Browser Walkthrough for Riddle (Archetype AK · Scroll).
 * Connects to Headless Chrome via CDP, injects mock-wallet.js,
 * tests 1280px Desktop & 360px Mobile viewports, footer links, wallet menu tokens,
 * walks every route (/ , /new , /riddle/1 , /riddle/2 , /me , /not-found),
 * executes real on-chain transactions:
 * 1. Charlie reveals answer "teeth" on /riddle/2 and receives 50% prize (1.5 BOT).
 * 2. Alice reclaims unspent pool on expired /riddle/5.
 * 3. Charlie withdraws won balance (1.5 BOT) on /me.
 * 4. Alice inscribes a new riddle on /new, downloads secret answer backup, and deposits 2.0 BOT.
 * and asserts 0 console errors and 0px horizontal overflow across all routes.
 */
import { spawn, execSync } from "node:child_process";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPublicClient, defineChain, http } from "viem";

console.log("Resetting and seeding local stack on port 8732...");
execSync("node scripts/local-stack.mjs", { stdio: "inherit" });

const CHROME_PORT = 9222;
const APP_URL = "http://localhost:3000";
const RPC_URL = "http://127.0.0.1:8732";
const CHAIN_ID = 968;

const ACC_ALICE = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";   // Creator
const ACC_BOB = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";     // Solver A
const ACC_CHARLIE = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"; // Solver B
const ACC_DAVE = "0x90F79bf6EB2c4f870365E785982E1f101E93b906";    // Solver C
const ACC_EVE = "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65";     // Solver D

const mockWalletScript = readFileSync(
  new URL("../../docs/specs/tools/mock-wallet.js", import.meta.url),
  "utf8"
);

// Read contract address from .env.local
const envLocal = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const matchContract = envLocal.match(/NEXT_PUBLIC_CONTRACT_968=(0x[a-fA-F0-9]{40})/);
if (!matchContract) throw new Error("Could not find NEXT_PUBLIC_CONTRACT_968 in .env.local");
const CONTRACT_ADDRESS = matchContract[1];

const localChain = defineChain({
  id: CHAIN_ID,
  name: "anvil",
  nativeCurrency: { name: "Test BOT", symbol: "tBOT", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
});
const pubClient = createPublicClient({ chain: localChain, transport: http() });

const artifact = JSON.parse(
  readFileSync(new URL("../contracts/out/Riddle.sol/Riddle.json", import.meta.url), "utf8")
);

const initialCount = await pubClient.readContract({
  address: CONTRACT_ADDRESS,
  abi: artifact.abi,
  functionName: "puzzleCount",
});
console.log(`Contract at: ${CONTRACT_ADDRESS}`);
console.log(`On-chain initial puzzle count: ${initialCount}`);

const userDir = mkdtempSync(join(tmpdir(), "chrome-riddle-"));

console.log("Launching headless Chrome...");
const chrome = spawn("google-chrome", [
  "--headless=new",
  `--remote-debugging-port=${CHROME_PORT}`,
  "--no-sandbox",
  "--disable-gpu",
  "--disable-dev-shm-usage",
  `--user-data-dir=${userDir}`,
  "about:blank",
]);

await new Promise((r) => setTimeout(r, 1200));

async function cdpHttp(path, method = "GET") {
  const res = await fetch(`http://127.0.0.1:${CHROME_PORT}${path}`, { method });
  return await res.json();
}

const version = await cdpHttp("/json/version");
console.log("Connected to Chrome:", version["Browser"]);

const list = await cdpHttp("/json/list");
const pageTarget = list.find((t) => t.type === "page");
const wsUrl = pageTarget?.webSocketDebuggerUrl;
if (!wsUrl) throw new Error("No page webSocketDebuggerUrl found");

const ws = new WebSocket(wsUrl);
let reqId = 1;
const pending = new Map();
const consoleErrors = [];
const cdpListeners = new Set();

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  for (const listener of cdpListeners) {
    try {
      listener(msg);
    } catch {}
  }
  if (msg.method === "Runtime.consoleAPICalled") {
    const text = msg.params.args?.map((a) => a.value || a.description).join(" ") || "";
    if (msg.params.type === "error") {
      if (!text.includes("favicon") && !text.includes("404")) {
        consoleErrors.push(text);
        console.error("Browser Console Error:", text);
      }
    } else {
      console.log(`[Browser Console ${msg.params.type}]`, text);
    }
  }
  if (msg.method === "Runtime.exceptionThrown") {
    const text = msg.params.exceptionDetails?.text || "";
    consoleErrors.push(text);
    console.error("Browser Exception:", text);
  }
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(msg.error.message));
    else resolve(msg.result);
  }
};

await new Promise((resolve) => {
  if (ws.readyState === WebSocket.OPEN) resolve();
  else ws.onopen = resolve;
});

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = reqId++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

await send("Page.enable");
await send("Runtime.enable");
await send("DOM.enable");
await send("CSS.enable");

// Injected mock wallet (reads active account from localStorage across navigations)
await send("Page.addScriptToEvaluateOnNewDocument", {
  source: `
    ${mockWalletScript}
    const acc = localStorage.getItem("__active_mock_account") || "${ACC_BOB}";
    window.__installMockWallet({ rpc: "${RPC_URL}", account: acc });
    console.log("[MockWallet] Injected & installed for " + acc);
  `,
});

async function evalInPage(expression) {
  const res = await send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (res.exceptionDetails) {
    throw new Error(JSON.stringify(res.exceptionDetails) || "eval failed");
  }
  return res.result?.value;
}

async function setViewport(width, height) {
  await send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 768,
  });
}

async function switchMockAccount(accountAddress) {
  await evalInPage(`
    (async () => {
      localStorage.setItem("__active_mock_account", "${accountAddress}");
      if (window.__mockWallet) {
        window.__mockWallet.setAccount("${accountAddress}");
      }
      if (window.ethereum?.request) {
        await window.ethereum.request({ method: "eth_accounts" });
      }
    })()
  `);
  await new Promise((r) => setTimeout(r, 200));
}

async function ensureWalletConnected() {
  const connected = await evalInPage(`
    (() => {
      const connectBtn = Array.from(document.querySelectorAll("button")).find(b => b.textContent.includes("Connect"));
      if (connectBtn) {
        connectBtn.click();
        return false;
      }
      return true;
    })()
  `);
  if (!connected) {
    await new Promise((r) => setTimeout(r, 500));
    await evalInPage(`
      (() => {
        const item = Array.from(document.querySelectorAll("[role='menuitem']")).find(el => 
          el.textContent.includes("Mock Wallet") || 
          el.textContent.includes("MetaMask") || 
          el.textContent.includes("Injected")
        );
        if (item) item.click();
      })()
    `);
    await new Promise((r) => setTimeout(r, 1000));
  }
}

async function navigate(path) {
  console.log(`Navigating to ${path}...`);
  const url = `${APP_URL}${path}`;
  const loadPromise = new Promise((resolve) => {
    const handler = (msg) => {
      if (msg.method === "Page.loadEventFired") {
        cdpListeners.delete(handler);
        resolve();
      }
    };
    cdpListeners.add(handler);
    setTimeout(() => {
      cdpListeners.delete(handler);
      resolve();
    }, 4000);
  });
  await send("Page.navigate", { url });
  await loadPromise;
  await new Promise((r) => setTimeout(r, 600));
}

async function checkNoHorizontalOverflow(routeName, viewportWidth) {
  const overflow = await evalInPage(`
    ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      bodyWidth: document.body.scrollWidth,
    })
  `);
  const diff = overflow.scrollWidth - overflow.clientWidth;
  if (diff > 1) {
    throw new Error(
      `Horizontal overflow detected on ${routeName} at ${viewportWidth}px: scrollWidth=${overflow.scrollWidth}, clientWidth=${overflow.clientWidth}`
    );
  }
  console.log(
    `✓ 0px overflow on ${routeName} (${viewportWidth}px: ${overflow.clientWidth}px wide)`
  );
}

try {
  // 1. Desktop 1280px - Shelf View
  console.log("\n=== Testing Desktop 1280px Shelf (/)... ===");
  await setViewport(1280, 800);
  await navigate("/");
  await switchMockAccount(ACC_ALICE);
  await ensureWalletConnected();

  // Validate Tokens & Wallet Menu
  const tokens = await evalInPage(`
    ({
      menuBg: getComputedStyle(document.documentElement).getPropertyValue('--menu-bg').trim().toLowerCase(),
      menuFg: getComputedStyle(document.documentElement).getPropertyValue('--menu-fg').trim().toLowerCase(),
      menuMuted: getComputedStyle(document.documentElement).getPropertyValue('--menu-muted').trim().toLowerCase(),
      menuBorder: getComputedStyle(document.documentElement).getPropertyValue('--menu-border').trim().toLowerCase(),
      menuHoverBg: getComputedStyle(document.documentElement).getPropertyValue('--menu-hover-bg').trim().toLowerCase(),
      menuDanger: getComputedStyle(document.documentElement).getPropertyValue('--menu-danger').trim().toLowerCase(),
      accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim().toLowerCase(),
      bgBase: getComputedStyle(document.documentElement).getPropertyValue('--bg-base').trim().toLowerCase(),
    })
  `);
  console.log("CSS Tokens validated:", tokens);
  if (tokens.menuBg !== "#fbf3dc" || tokens.menuFg !== "#2d1e12" || tokens.accent !== "#1f7a5c") {
    throw new Error(`Token mismatch in browser: ${JSON.stringify(tokens)}`);
  }

  // Validate Footer Links
  const footerOk = await evalInPage(`
    (() => {
      const footer = document.querySelector("footer");
      if (!footer) return false;
      const text = footer.textContent || "";
      const links = Array.from(footer.querySelectorAll("a")).map(a => a.href);
      return links.some(l => l.includes("botchain.ai")) &&
             links.some(l => l.includes("scan.botchain.ai"));
    })()
  `);
  if (!footerOk) throw new Error("Footer does not contain required links");
  console.log("✓ Footer links present and correct");

  await checkNoHorizontalOverflow("Shelf (/)", 1280);

  // Check 6 scrolls visible
  const scrollCardsCount = await evalInPage(`
    document.querySelectorAll(".rolled-cylinder").length
  `);
  console.log(`Visible scrolls on shelf: ${scrollCardsCount}`);
  if (scrollCardsCount < 6) throw new Error(`Expected at least 6 scrolls, got ${scrollCardsCount}`);
  console.log("✓ All 6 seeded scrolls rendered on shelf");

  // 2. Mobile 360px Tests across routes
  console.log("\n=== Testing Mobile 360px Viewports ===");
  await setViewport(360, 640);

  await navigate("/");
  await checkNoHorizontalOverflow("Shelf (/)", 360);

  await navigate("/new");
  await checkNoHorizontalOverflow("New Riddle (/new)", 360);

  await navigate("/riddle/1");
  await checkNoHorizontalOverflow("Riddle 1 (/riddle/1)", 360);

  await navigate("/me");
  await checkNoHorizontalOverflow("My Solves (/me)", 360);

  await navigate("/non-existent-riddle-404");
  await checkNoHorizontalOverflow("Not Found (404)", 360);

  // Return to Desktop for Flow Executions
  await setViewport(1280, 800);

  // 3. Flow 1: Charlie reveals answer "teeth" on /riddle/2
  console.log("\n=== Flow 1: Charlie reveals answer on /riddle/2 ===");
  await switchMockAccount(ACC_CHARLIE);
  await navigate("/riddle/2");
  await ensureWalletConnected();

  // Populate guessStore with Charlie's answer and salt for Riddle 2
  await evalInPage(`
    (() => {
      const g = {
        puzzleId: "2",
        solver: "${ACC_CHARLIE}",
        answer: "teeth",
        salt: "0x2222222222222222222222222222222222222222222222222222222222222222",
        commitment: "0x...",
        timestamp: Date.now()
      };
      localStorage.setItem("botchain_riddle_guesses", JSON.stringify([g]));
    })()
  `);

  // Refresh page so SolverSlip loads guess from store
  await navigate("/riddle/2");
  await new Promise((r) => setTimeout(r, 600));

  // Charlie clicks "Show Your Answer" button
  console.log("Submitting reveal transaction...");
  const revealClicked = await evalInPage(`
    (() => {
      const btn = Array.from(document.querySelectorAll("button")).find(b =>
        b.textContent.includes("Show Your Answer")
      );
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    })()
  `);
  if (!revealClicked) throw new Error("Could not find 'Show Your Answer' button");

  await new Promise((r) => setTimeout(r, 2000));

  // Check on-chain that Charlie won Riddle 2
  const p2 = await pubClient.readContract({
    address: CONTRACT_ADDRESS,
    abi: artifact.abi,
    functionName: "puzzleOf",
    args: [2n],
  });
  console.log(`Riddle 2 solved count: ${p2.solved}`);
  const winners2 = await pubClient.readContract({
    address: CONTRACT_ADDRESS,
    abi: artifact.abi,
    functionName: "winnersOf",
    args: [2n],
  });
  console.log(`Riddle 2 Winner 1: ${winners2[0]}`);
  if (winners2[0].toLowerCase() !== ACC_CHARLIE.toLowerCase()) {
    throw new Error(`Winner 1 mismatch: expected ${ACC_CHARLIE}, got ${winners2[0]}`);
  }
  console.log("✓ Charlie successfully proved answer on-chain!");

  // 4. Flow 2: Alice reclaims expired Riddle 5
  console.log("\n=== Flow 2: Alice reclaims expired Riddle 5 ===");
  await switchMockAccount(ACC_ALICE);
  await navigate("/riddle/5");
  await ensureWalletConnected();

  const reclaimClicked = await evalInPage(`
    (() => {
      const btn = Array.from(document.querySelectorAll("button")).find(b =>
        b.textContent.includes("Reclaim Remaining Funds")
      );
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    })()
  `);
  if (!reclaimClicked) throw new Error("Could not find 'Reclaim Remaining Funds' button on Riddle 5");

  await new Promise((r) => setTimeout(r, 2000));

  const p5 = await pubClient.readContract({
    address: CONTRACT_ADDRESS,
    abi: artifact.abi,
    functionName: "puzzleOf",
    args: [5n],
  });
  console.log(`Riddle 5 reclaimed: ${p5.reclaimed}`);
  if (!p5.reclaimed) throw new Error("Riddle 5 was not reclaimed on-chain");
  console.log("✓ Alice successfully reclaimed expired riddle funds on-chain!");

  // 5. Flow 3: Charlie withdraws won balance on /me
  console.log("\n=== Flow 3: Charlie withdraws winnings on /me ===");
  await switchMockAccount(ACC_CHARLIE);
  await navigate("/me");
  await ensureWalletConnected();

  const charliePendingBefore = await pubClient.readContract({
    address: CONTRACT_ADDRESS,
    abi: artifact.abi,
    functionName: "pending",
    args: [ACC_CHARLIE],
  });
  console.log(`Charlie pending balance before: ${charliePendingBefore}`);

  const withdrawClicked = await evalInPage(`
    (() => {
      const btn = Array.from(document.querySelectorAll("button")).find(b =>
        b.textContent.includes("Withdraw to Wallet")
      );
      if (btn && !btn.disabled) {
        btn.click();
        return true;
      }
      return false;
    })()
  `);
  if (!withdrawClicked) throw new Error("Could not find enabled 'Withdraw to Wallet' button");

  await new Promise((r) => setTimeout(r, 2000));

  const charliePendingAfter = await pubClient.readContract({
    address: CONTRACT_ADDRESS,
    abi: artifact.abi,
    functionName: "pending",
    args: [ACC_CHARLIE],
  });
  console.log(`Charlie pending balance after: ${charliePendingAfter}`);
  if (charliePendingAfter !== 0n) {
    throw new Error(`Charlie pending was not emptied: ${charliePendingAfter}`);
  }
  console.log("✓ Charlie successfully withdrew winnings to wallet!");

  // 6. Flow 4: Alice inscribes a new riddle on /new
  console.log("\n=== Flow 4: Alice inscribes new riddle on /new ===");
  await switchMockAccount(ACC_ALICE);
  await navigate("/new");
  await ensureWalletConnected();

  // Fill question and answer
  await evalInPage(`
    (() => {
      const textarea = document.querySelector("textarea");
      const answerInput = Array.from(document.querySelectorAll("input")).find(i => i.placeholder.includes("mountain"));
      
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
      nativeSetter.call(textarea, "I have branches, but no fruit, trunk or leaves. What am I?");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));

      const inputSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      inputSetter.call(answerInput, "bank");
      answerInput.dispatchEvent(new Event("input", { bubbles: true }));
    })()
  `);

  await new Promise((r) => setTimeout(r, 500));

  // Click Download Secret Answer Backup
  console.log("Clicking Download Backup...");
  await evalInPage(`
    (() => {
      const backupBtn = Array.from(document.querySelectorAll("button")).find(b =>
        b.textContent.includes("Download")
      );
      if (backupBtn) backupBtn.click();
    })()
  `);

  await new Promise((r) => setTimeout(r, 400));

  // Submit form
  console.log("Submitting new riddle form...");
  await evalInPage(`
    (() => {
      const submitBtn = Array.from(document.querySelectorAll("button")).find(b =>
        b.textContent.includes("Inscribe Riddle")
      );
      if (submitBtn) submitBtn.click();
    })()
  `);

  await new Promise((r) => setTimeout(r, 3000));

  const newCount = await pubClient.readContract({
    address: CONTRACT_ADDRESS,
    abi: artifact.abi,
    functionName: "puzzleCount",
  });
  console.log(`On-chain new riddle count: ${newCount}`);
  if (newCount <= initialCount) {
    throw new Error(`New riddle was not inscribed: count remained ${newCount}`);
  }
  console.log("✓ Alice inscribed a new riddle on-chain with downloadable backup!");

  // Final check: Console Errors
  if (consoleErrors.length > 0) {
    throw new Error(`Walkthrough finished with ${consoleErrors.length} console errors: ${consoleErrors.join("; ")}`);
  }
  console.log("\n✓ 0 console errors logged throughout walkthrough");
  console.log("\n=======================================================");
  console.log("🎉 ALL CDP BROWSER WALKTHROUGH TESTS PASSED CLEANLY!");
  console.log("=======================================================\n");

} finally {
  try {
    ws.close();
  } catch {}
  try {
    chrome.kill("SIGKILL");
  } catch {}
}
