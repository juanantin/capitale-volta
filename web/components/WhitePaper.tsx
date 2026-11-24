import { DISTRICTS, GAME, TICKER, TOKENS } from "../lib/config";

export default function WhitePaper() {
  const earnsList = DISTRICTS.map((d) => `${d.city} earns ${TOKENS[d.earns].token}`).join(", ");
  return (
    <article className="tab paper">
      <h2>{GAME.name} — White Paper</h2>
      <p className="muted small">Version 0.2 · draft for review</p>

      <h3>1. What is {GAME.name}?</h3>
      <p>
        {GAME.name} is a city-building game on Elysium. You burn {TICKER} to build a {GAME.building} on a map of Italy.
        Every {GAME.building} is an NFT that receives a share of the city&apos;s purchases of five of Montra&apos;s top
        tokens. You build in one of five cities, and each city earns one token: {earnsList}. Your city also decides where
        your {GAME.building} stands and which team you are on in the weekly street race.
      </p>

      <h3>2. {TICKER} and the city tax</h3>
      <ul>
        <li>{TICKER} launches on Montra, the launchpad on Elysium, in its own Uniswap v4 pool paired with HYPE. Its whole supply is locked in that pool as liquidity, for good. Every trade pays the pool&apos;s fee in HYPE.</li>
        <li>Of that fee, 0.4% of each trade goes to the Montra protocol and the rest (the creator side) goes to whoever the pool names. {TICKER}&apos;s pool names the {GAME.name} vault, so the creator side is the city tax. The vault has no function to hand it on.</li>
        <li>Anyone can call collectCreatorFees() to move the tax from Montra into the vault; the keeper does it regularly.</li>
        <li>Some reward tokens pay their holders in HYPE. The vault holds those tokens for the residents, so anyone can call claimHolderRewards() to collect that HYPE, which becomes more city tax.</li>
        <li>70% of the tax buys each city&apos;s token for its residents, 15% goes to the weekly street race, and 15% stays in HYPE for operations (paid to a 2-of-3 multisig).</li>
      </ul>

      <h3>3. How purchases work</h3>
      <ul>
        <li>A keeper checks the vault regularly. Once a minimum amount of HYPE is waiting, it buys, capped per order, one order at a time, at least 10 minutes apart. Anything left waits for the next check.</li>
        <li>Each order is split across the five cities by how many {GAME.buildings} each has, so every {GAME.building} gets the same value. Each city&apos;s part buys its token on Montra.</li>
        <li>Every swap is checked against the pool&apos;s average price; if a fill is more than 4% worse, the whole order is rejected, the HYPE stays in the vault and buying pauses for 6 hours.</li>
        <li>An order runs with a fixed gas budget, so nobody can make it fail (and pause buying) by sending too little gas.</li>
        <li>Until the first {GAME.building} exists, the residents&apos; share simply waits in the vault.</li>
        <li>If nothing is bought for 24 hours, the keeper rests. Anyone can restart it by calling requestBuy().</li>
        <li>Tax that is not spent in a week rolls over to the next.</li>
      </ul>

      <h3>4. Buildings</h3>
      <ul>
        <li>3,000 {GAME.buildings} in total. Il Sindaco&apos;s hall, #0, is minted at launch; it earns nothing.</li>
        <li>To build: choose a city ({DISTRICTS.map((d) => d.city).join(", ")}) and one of 3 styles. Both are permanent. Optionally enter the number of the building that invited you.</li>
        <li>Numbers are sequential across the country. Within a city, earlier {GAME.buildings} get the plots nearest its landmark.</li>
        <li>{GAME.name} {GAME.buildings} are normal NFTs: you can sell or transfer them. Unclaimed rewards and height move with the building.</li>
        <li>Invites are decorations only (flags, lanterns, fireworks). There is no referral income.</li>
        <li>When all 3,000 are built, the city is complete and building closes.</li>
      </ul>

      <h3>5. Price</h3>
      <ul>
        <li>Early bird: the first 300 {GAME.buildings} cost $40, for 6 hours from launch. If they sell out early, the next phase opens when the 6 hours end.</li>
        <li>Then: #1–800 $52 · #801–1,500 $68 · #1,501–2,300 $88 · #2,301–3,000 $120.</li>
        <li>You pay by burning {TICKER}: tokens burned = USD price ÷ {TICKER} price. Burned tokens go to the dead address forever.</li>
        <li>During early bird the price used follows drops at once and follows rises only after they hold for 60 seconds. Afterwards it is the lower of the spot price and a 30-minute average, so pumping the price never makes building cheaper.</li>
        <li>You set a maximum burn. If the price moves above it, the build is cancelled.</li>
      </ul>

      <h3>6. Rewards</h3>
      <ul>
        <li>Each city&apos;s part of a purchase is split equally among that city&apos;s {GAME.buildings} that exist at that moment.</li>
        <li>Purchases during the early-bird window go to each city&apos;s early-bird pool, shared among that city&apos;s early-bird {GAME.buildings} when the window ends.</li>
        <li>claim / claimMany pays every token your {GAME.buildings} have earned in one transaction. There is no cooldown and rewards never expire. If one token can&apos;t be transferred, it is skipped and stays claimable.</li>
      </ul>

      <h3>7. Height</h3>
      <p>
        A {GAME.building} grows with the total value it has claimed (valued at purchase time): L1 $0 · L2 $5 · L3 $20 · L4 $50
        · L5 $100, then one more floor for every extra $50, with no limit. Height is cosmetic.
      </p>

      <h3>8. Street race</h3>
      <ul>
        <li>The city with the most new {GAME.buildings} in the week wins the 15% street pool, shared equally by all its {GAME.buildings}. Tied cities share it equally per {GAME.building}.</li>
        <li>If nobody built that week, every city that has {GAME.buildings} shares the pool.</li>
        <li>The week closes every Sunday at 20:00 Rome time. The winner is only known then, so the street pool waits in HYPE during the week and is bought in the winning city&apos;s own token right after.</li>
        <li>After all 3,000 are built, the race ends and the street pool is shared across the whole city.</li>
      </ul>

      <h3>9. Settlement</h3>
      <p>
        Weeks close automatically: the first build, buy or claim after the Sunday deadline settles the past week (the
        street pool). Anyone can also call settle().
      </p>

      <h3>10. Permissions and safety</h3>
      <ul>
        <li>Anyone: collect fees and holder rewards, trigger buys, settle the week, pay out the ops share, restart the keeper.</li>
        <li>Residents: claim for their own {GAME.buildings}.</li>
        <li>Ops multisig (2-of-3): receives the 15% ops share, nothing else.</li>
        <li>No contract has a withdrawal function. Oracle, swap route and buy-rule changes go through a public 48-hour timelock. The NFT and the vault cannot be upgraded.</li>
      </ul>

      <h3>11. Risks</h3>
      <p className="muted">
        Reward tokens can fall in value or become illiquid; Montra&apos;s tokens are young and their pools are small. Smart
        contracts can have bugs, and {GAME.name}&apos;s contracts have not been audited. Prices come from on-chain averages
        that can be wrong in extreme markets. Only use money you can afford to lose.
      </p>

      <h3>12. The map</h3>
      <p className="muted">
        The coastline of Italy and its neighbours comes from Natural Earth (public domain). Buildings and landmarks are
        original engraved art.
      </p>

      {GAME.x && (
        <>
          <h3>13. Follow the city</h3>
          <p>
            News, weekly results and launch updates: <a href={GAME.x} target="_blank" rel="noreferrer">{GAME.xHandle}</a> on X.
          </p>
        </>
      )}
    </article>
  );
}
