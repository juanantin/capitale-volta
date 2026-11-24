// Capitale keeper (ported from VICE's, which ran its launched city): the regular housekeeping
// that keeps the city running. Everything it does, anyone may do; the keeper wallet has no
// special rights and only needs a little HYPE for gas. Each action is simulated first and only
// sent when it would do something.
//
//   1. claim $CAPITALE's creator fees from Montra (the city tax, in HYPE);
//   2. claim the HYPE that reward tokens paying their holders owe the vault (more city tax);
//   3. settle the week after the Sunday deadline (and the early bird when it ends);
//   4. request a buy (one order; the vault enforces sizes, spacing and the 4% price check);
//      after 24h without buys the vault's scheduler rests until someone calls requestBuy;
//   5. pay the ops share out once it is worth it.
//   (If the price oracle has a poke() to refresh a stored reference, it is called first.)
//
// Env: KEEPER_PRIVATE_KEY (secret), CAPITALE_VAULT (or the LIVE vault in web/lib/config.ts),
//      ELYSIUM_RPC (optional), DRY_RUN=1 to only report.
// The private key is read from the environment only; it is never printed or stored.

import { readFileSync } from "node:fs";
import { createPublicClient, createWalletClient, defineChain, formatUnits, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const chain = defineChain({
  id: 99901,
  name: "Elysium",
  nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 },
  rpcUrls: { default: { http: [process.env.ELYSIUM_RPC || "https://rpc.volta.family"] } },
});

const vaultAbi = parseAbi([
  "function oracle() view returns (address)",
  "function income() view returns (address)",
  "function weekEnd() view returns (uint256)",
  "function earlyBirdEnd() view returns (uint256)",
  "function earlyBirdFinalized() view returns (bool)",
  "function schedulerActive() view returns (bool)",
  "function opsFunds() view returns (uint256)",
  "function pausedUntil() view returns (uint256)",
  "function collectCreatorFees() returns (uint256)",
  "function claimHolderRewards() returns (uint256)",
  "function settle()",
  "function requestBuy() returns (bool)",
  "function payOps()",
]);
const oracleAbi = parseAbi(["function poke() returns (uint256)", "function incomeUsd() view returns (uint256)"]);

/** Pay the ops share once it is worth at least this much (USD). */
const OPS_MIN_USD = Number(process.env.OPS_MIN_USD || 25);

function vaultAddress() {
  if (process.env.CAPITALE_VAULT) return process.env.CAPITALE_VAULT;
  try {
    const cfg = readFileSync(new URL("../web/lib/config.ts", import.meta.url), "utf8");
    // The real city (LIVE) first; until it is set, a rehearsal city (REHEARSAL) if there is one.
    for (const name of ["LIVE", "REHEARSAL"]) {
      const start = cfg.indexOf(`export const ${name}`);
      if (start < 0) continue;
      const m = cfg.slice(start).match(/vault:\s*"(0x[0-9a-fA-F]{40})"/);
      const end = cfg.indexOf("export const", start + 10);
      if (m && (end < 0 || start + m.index < end)) return m[1];
    }
  } catch {
    /* no config */
  }
  return null;
}

const log = (...a) => console.log(new Date().toISOString(), ...a);

async function main() {
  const vault = vaultAddress();
  if (!vault) {
    log("No live city yet (set CAPITALE_VAULT or LIVE.vault in web/lib/config.ts). Nothing to do.");
    return;
  }
  const dry = process.env.DRY_RUN === "1";
  const pk = process.env.KEEPER_PRIVATE_KEY;
  if (!pk && !dry) throw new Error("KEEPER_PRIVATE_KEY is not set (add it as a repository secret).");
  const account = pk ? privateKeyToAccount(pk.startsWith("0x") ? pk : `0x${pk}`) : null;
  const pub = createPublicClient({ chain, transport: http() });
  const wallet = account ? createWalletClient({ chain, transport: http(), account }) : null;

  const v = { address: vault, abi: vaultAbi };
  const oracle = await pub.readContract({ ...v, functionName: "oracle" });
  const o = { address: oracle, abi: oracleAbi };
  if (account) {
    const gas = await pub.getBalance({ address: account.address });
    log(`keeper ${account.address} has ${formatUnits(gas, 18)} HYPE for gas`);
    if (gas < 10n ** 16n) log("WARNING: keeper is low on HYPE; top it up.");
  }

  /** Simulate, then send only if the call would succeed (and `want` says it is useful). */
  async function act(label, target, functionName, want = () => true) {
    try {
      const sim = await pub.simulateContract({ address: target.address, abi: target.abi, functionName, account: account?.address ?? vault });
      if (!want(sim.result)) {
        log(`${label}: nothing to do`);
        return;
      }
      if (dry || !wallet) {
        log(`${label}: would send (dry run)`, sim.result ?? "");
        return;
      }
      // Swaps through v4 hooks are easy to under-estimate (VICE learned this): send 30% more gas.
      const est = await pub.estimateContractGas({ address: target.address, abi: target.abi, functionName, account });
      // Sign locally with the keeper's own key (public RPCs don't sign for anyone).
      const hash = await wallet.writeContract({ ...sim.request, account, gas: (est * 13n) / 10n });
      const r = await pub.waitForTransactionReceipt({ hash });
      log(`${label}: ${r.status} ${hash}`);
    } catch (e) {
      log(`${label}: skipped (${(e.shortMessage || e.message || String(e)).split("\n")[0]})`);
    }
  }

  const block = await pub.getBlock();
  const now = Number(block.timestamp);

  // 0. Oracle reference, if this oracle keeps one (an oracle without poke() just skips).
  await act("poke oracle", o, "poke");

  // 1. Creator fees from Montra, 2. holder rewards of the tokens the vault holds.
  await act("collect creator fees", v, "collectCreatorFees", (amount) => amount > 0n);
  await act("claim holder rewards", v, "claimHolderRewards", (amount) => amount > 0n);

  // 3. Settlement.
  const [weekEnd, ebEnd, ebDone] = await Promise.all([
    pub.readContract({ ...v, functionName: "weekEnd" }),
    pub.readContract({ ...v, functionName: "earlyBirdEnd" }),
    pub.readContract({ ...v, functionName: "earlyBirdFinalized" }),
  ]);
  if (now >= Number(weekEnd) || (!ebDone && now >= Number(ebEnd))) await act("settle", v, "settle");

  // 4. Buy (only while the scheduler is active; it rests after 24h without buys).
  const active = await pub.readContract({ ...v, functionName: "schedulerActive" });
  const paused = Number(await pub.readContract({ ...v, functionName: "pausedUntil" }));
  if (!active) log("buy: scheduler resting (24h without buys); anyone can restart it with requestBuy()");
  else if (paused > now) log(`buy: paused after a rejected order until ${new Date(paused * 1000).toISOString()}`);
  else await act("buy", v, "requestBuy", (bought) => bought === true);

  // 5. Ops share (in HYPE).
  const [opsFunds, hypeUsd] = await Promise.all([
    pub.readContract({ ...v, functionName: "opsFunds" }),
    pub.readContract({ ...o, functionName: "incomeUsd" }),
  ]);
  const opsUsd = Number(formatUnits(opsFunds, 18)) * Number(formatUnits(hypeUsd, 18));
  log(`ops share waiting: ${formatUnits(opsFunds, 18)} HYPE (~$${opsUsd.toFixed(2)})`);
  if (opsUsd >= OPS_MIN_USD) await act("pay ops", v, "payOps");
}

main().catch((e) => {
  console.error(new Date().toISOString(), "keeper failed:", e.shortMessage || e.message || e);
  process.exit(1);
});
