export default function WhitePaper() {
  return (
    <article className="tab paper">
      <h2>Capitale — White Paper</h2>
      <p className="muted small">Version 0.1 · draft for review</p>

      <h3>1. What is Capitale?</h3>
      <p>
        Capitale is a city-building game on Elysium. You burn $CAPITALE to build a palazzo on an engraved map of
        Italy. Every palazzo is an NFT that receives a share of the city&apos;s purchases. You build in one of four
        cities, and each city earns one token: Milano earns SENT, Roma earns $VOLTA, Venezia earns VOID, and Napoli
        earns whichever of the three the weekly vote picks. Your city also decides where your palazzo stands and which
        team you are on in the weekly street race.
      </p>

      <h3>2. $CAPITALE and the city tax</h3>
      <ul>
        <li>$CAPITALE launches on Volta, the Uniswap launchpad on Elysium, paired with $VOLTA. Every trade pays the pool&apos;s swap fee in $VOLTA.</li>
        <li>Of that fee, Volta&apos;s rules send 70% to the launch&apos;s chosen split and 30% to the Volta protocol. Capitale sends its whole share to the creator, and the creator NFT is held by the CapitaleVault, so the creator share is the city tax. Nobody can take that NFT out of the vault.</li>
        <li>Anyone can call collectCreatorFees() to move the tax from Volta&apos;s fee escrow into the vault; the keeper does it every hour.</li>
        <li>70% of the tax buys each city&apos;s token for its residents, 15% goes to the weekly street race, and 15% stays in $VOLTA for operations (paid to a 2-of-3 multisig).</li>
      </ul>

      <h3>3. How purchases work</h3>
      <ul>
        <li>A keeper checks the vault every hour. Once a minimum amount of $VOLTA is waiting, it buys, capped per order, one order at a time, at least 10 minutes apart. Anything left waits for the next hour.</li>
        <li>Each order is split across the four cities by how many palazzi each has, so every palazzo gets the same value. Each city&apos;s part buys its token; cities on the same token share one swap.</li>
        <li>Roma&apos;s part (and Napoli&apos;s, in a week the vote picks $VOLTA) needs no swap: the $VOLTA is simply set aside for those residents.</li>
        <li>SENT and VOID are bought through their Volta pools. Every swap is checked against the pool&apos;s average price; if a fill is more than 4% worse, the whole order is rejected, the $VOLTA stays in the vault and buying pauses for 6 hours.</li>
        <li>Until the first palazzo exists, the residents&apos; share simply waits in the vault.</li>
        <li>If nothing is bought for 24 hours, the keeper rests. Anyone can restart it by calling requestBuy().</li>
        <li>Tax that is not spent in a week rolls over to the next.</li>
      </ul>

      <h3>4. Buildings</h3>
      <ul>
        <li>3,000 palazzi in total. The Mayor&apos;s palazzo, #0, is minted at launch; it earns nothing and has no vote.</li>
        <li>To build: choose a city (Milano, Roma, Napoli or Venezia) and one of 3 styles. Both are permanent. Optionally enter the number of the building that invited you.</li>
        <li>Numbers are sequential across the city. Within a city, earlier buildings get the plots nearest its landmark.</li>
        <li>Palazzi are normal NFTs: you can sell or transfer them. Unclaimed rewards and height move with the building.</li>
        <li>Invites are decorations only (flags, neon signs, fireworks). There is no referral income.</li>
        <li>When all 3,000 are built, the city is complete and building closes.</li>
      </ul>

      <h3>5. Price</h3>
      <ul>
        <li>Early bird: the first 300 palazzi cost $40, for 6 hours from launch. If they sell out early, the next phase opens when the 6 hours end.</li>
        <li>Then: #1–800 $52 · #801–1,500 $68 · #1,501–2,300 $88 · #2,301–3,000 $120.</li>
        <li>You pay by burning $CAPITALE: tokens burned = USD price ÷ $CAPITALE price. Burned tokens go to the dead address forever.</li>
        <li>During early bird the price used follows drops at once and follows rises only after they hold for 60 seconds. Afterwards it is the lower of the spot price and the 30-minute average, so pumping the price never makes building cheaper.</li>
        <li>You set a maximum burn. If the price moves above it, the build is cancelled.</li>
      </ul>

      <h3>6. Rewards</h3>
      <ul>
        <li>Each city&apos;s part of a purchase is split equally among that city&apos;s palazzi that exist at that moment.</li>
        <li>Purchases during the early-bird window go to each city&apos;s early-bird pool, shared among that city&apos;s early-bird palazzi when the window ends.</li>
        <li>claim / claimMany pays every token a palazzo has earned in one transaction (a Napoli palazzo can hold all three). There is no cooldown and rewards never expire. If one token can&apos;t be transferred, it is skipped and stays claimable.</li>
      </ul>

      <h3>7. Height</h3>
      <p>
        A palazzo grows with the total value it has claimed (valued at purchase time): L1 $0 · L2 $5 · L3 $20 · L4 $50
        · L5 $100, then one more floor for every extra $50, with no limit. Height is cosmetic.
      </p>

      <h3>8. Weekly vote</h3>
      <ul>
        <li>Each palazzo, in any city, has one vote per week for the token Napoli earns next week. Milano, Roma and Venezia always keep their own token.</li>
        <li>Voting closes every Sunday at 20:00 Rome time. Most votes wins; a tie or no votes keeps the current token.</li>
        <li>A palazzo that already voted keeps that vote for the week even if it is sold.</li>
      </ul>

      <h3>9. Street competition</h3>
      <ul>
        <li>The city with the most new palazzi in the week wins the 15% street pool, shared equally by all its palazzi. Tied cities share it equally per palazzo.</li>
        <li>If nobody built that week, every city that has buildings shares the pool.</li>
        <li>The winner is only known at the deadline, so the street pool waits in $VOLTA during the week and is bought in the winning city&apos;s own token right after.</li>
        <li>After all 3,000 are built, the competition ends and the street pool is shared across the whole city.</li>
      </ul>

      <h3>10. Settlement</h3>
      <p>
        Weeks close automatically: the first vote, build, buy or claim after the Sunday deadline settles the past week
        (vote result and street pool). Anyone can also call settle().
      </p>

      <h3>11. Permissions and safety</h3>
      <ul>
        <li>Anyone: trigger buys, settle the week, pay out the ops share, restart the keeper.</li>
        <li>Residents: vote and claim for their own palazzi.</li>
        <li>Ops multisig (2-of-3): receives the 15% ops share, nothing else.</li>
        <li>No contract has a withdrawal function. Oracle, swap route and buy-rule changes go through a public 48-hour timelock. The NFT and the vault cannot be upgraded.</li>
      </ul>

      <h3>12. Risks</h3>
      <p className="muted">
        Reward tokens can fall in value or become illiquid. Smart contracts can have bugs; Capitale will be audited
        before mainnet, but audits do not remove all risk. Prices come from on-chain averages that can be wrong in
        extreme markets. Only use money you can afford to lose.
      </p>
    </article>
  );
}
