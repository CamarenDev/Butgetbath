// Additional forum topics: plumbing emergencies, tile advantages, hiring and local pages.
// General guidance only. Active flooding, sewage backups, gas smells or electrical hazards need emergency services or a licensed plumber first.
const { counties } = require('../content');

const categories = [
  ['emergencies', 'Plumbing Emergencies & Leaks', 'What to do right now about overflowing toilets, leaking showers, dripping sinks and burst pipes.'],
  ['contractors', 'Hiring a Contractor', 'How to compare bids, read contracts and choose a bathroom remodeler you can trust.']
];

const SAFETY = 'Safety first: if water is near outlets, light fixtures or an electrical panel, stay out of the room and shut off power at the breaker only if you can reach it without standing in water. If you smell gas or see sewage backing up through multiple drains, leave and call emergency services or a licensed plumber right away.';

// [category slug, title, body, replies, pinned]
const threads = [
  ['emergencies', 'Toilet overflowing? What to do right now, step by step',
    `An overflowing toilet is stressful, but the first two minutes matter most. Here is what to do.

1. Stop the water. Reach behind the toilet and turn the shutoff valve (the small oval handle near the floor) clockwise. If it will not turn, lift the tank lid and push the rubber flapper down, or lift the float so the tank stops refilling.
2. Do not flush again. Flushing a clogged toilet sends more water into the bowl.
3. Contain the water. Lay down towels, use a wet-dry vacuum if you have one, and open a window for ventilation.
4. Try a flange plunger. A flange (ball-shaped) plunger seals better than a cup plunger. Push gently first, then plunge firmly for 15 to 20 seconds.
5. Know when to stop. If water rises again, other drains gurgle, or the overflow looks like sewage, the clog may be in the main line. Call a licensed plumber.

After the cleanup: toilet overflow water can soak into flooring and subfloor. Check for soft spots, lifting tile, staining on the ceiling below and musty smells over the next few days. Water-damaged flooring should be dried quickly or replaced to avoid mold.

${SAFETY}`,
    [[`If your toilet overflows often, the cause is not always the toilet. A partial clog, a failing wax ring, or an undersized or older drain line can be behind it. After the emergency is handled, we can look at flooring repairs or a new toilet and floor installation as part of a bathroom update. Request a free estimate from the Contact page.`, true]], false],
  ['emergencies', 'Shower leaking: how to find the source and what to do next',
    `A leaking shower can show up as water on the floor outside the shower, a stain on the ceiling below, or a musty smell. Finding the source decides the fix.

Common causes:
- Cracked or missing caulk at corners, the tub or shower base and around fixtures
- Worn door seals or sweeps on a glass shower door
- Failing grout or cracked tile that lets water behind the wall
- A leaking shower pan or liner, often only visible once the floor is opened
- A dripping valve, shower arm or drain connection inside the wall

What to do now:
1. Stop using the shower until you know where the water is going.
2. Dry the area and run the shower briefly in sections (head only, then door side, then drain) to see where water escapes.
3. Re-caulk with 100% silicone suitable for wet areas, after removing old caulk and drying the joint fully.
4. Check below: look at the ceiling or wall under the bathroom for stains or bubbling paint.
5. If water keeps appearing after caulking, or the floor feels soft, the leak is likely behind the tile or in the pan. That needs a professional.

Mold can begin to grow within 24 to 48 hours in damp materials, according to the EPA, so dry wet areas quickly.

Persistent leaks in older showers often mean the waterproofing has reached the end of its life. In that case a shower remodel with a properly sloped, waterproofed base usually costs less than repeated patching.`,
    [], false],
  ['emergencies', 'Dripping faucet or sink: causes, quick fixes and when to call a pro',
    `A slow drip is easy to ignore, but the EPA's WaterSense program notes that a faucet dripping once per second can waste more than 3,000 gallons of water per year, and the drip can stain your sink and signal worn parts.

Typical causes:
- A worn washer or O-ring in a compression faucet
- A worn cartridge in a single-handle faucet
- Mineral buildup from hard water, common in much of northern Illinois
- A corroded valve seat

Quick steps:
1. Close the shutoff valves under the sink (turn clockwise), then open the faucet to release pressure.
2. Plug the drain so small parts cannot fall in.
3. Take the handle apart and replace the worn washer, O-ring or cartridge with an exact match. Take the old part to the hardware store.
4. Reassemble, turn the water on slowly, and check for leaks.

A leak under the sink is different: check supply lines, the P-trap and the drain connections. A cabinet floor that is swollen or stained means the leak has been going on a while.

If the faucet is old, replacing it is often better than rebuilding it. Matte, brushed and satin finishes are the 2026 favorites in NKBA's report. If you are updating the vanity at the same time, we can help you plan it.`,
    [], false],
  ['emergencies', 'Water coming through the ceiling below a bathroom: emergency checklist',
    `Water or a spreading stain on the ceiling under a bathroom means water is escaping from the bathroom above. Act quickly.

1. Stop using the bathroom above: no showers, tubs, toilets or sinks.
2. If water is actively dripping, shut off the main water valve (usually where the water line enters the home or near the water meter).
3. Protect belongings and place a bucket under the drip. If the ceiling bulges, carefully puncture the lowest point with a screwdriver over a bucket to release trapped water and prevent a collapse.
4. Turn off power to any ceiling light or fan that is wet, using the breaker.
5. Take photos and notes for your insurance claim, and call your insurer if the damage is significant.
6. Call a licensed plumber to find and fix the source. Then dry the ceiling and framing completely.

${SAFETY}

Once the source is fixed, drywall, subfloor and tile often need repair. We can help with the bathroom side of the repair and rebuild.`,
    [], false],
  ['emergencies', 'Burst or leaking pipe in the bathroom: shut it off fast',
    `A burst or badly leaking pipe can release gallons per minute. Know where your shutoffs are before you need them.

Immediate steps:
1. Shut off the water at the nearest fixture valve if you can reach it, or at the main shutoff.
2. Open a faucet at the lowest level of the house to drain remaining water from the lines.
3. Turn off the water heater if the leak involves hot water lines and the heater may run dry.
4. Remove water: mop, towels, wet-dry vacuum. Move rugs and furniture.
5. Call a licensed plumber, and photograph everything for your insurer.

In Illinois winters, pipes in exterior walls and unheated areas can freeze and split. Keep bathroom doors and cabinet doors open on very cold nights, and know that a pipe that has frozen once is at risk again.

${SAFETY}`,
    [], false],
  ['emergencies', 'Toilet running constantly or leaking at the base',
    `A toilet that runs, hisses or leaks at the base wastes water. The EPA notes that a leaking toilet can waste about 200 gallons a day, and a leak at the base can rot the subfloor.

Running toilet: usually a worn flapper, a flapper chain that is too tight or too loose, or a fill valve that needs adjusting or replacing. These parts are inexpensive. A quick test: add a few drops of food coloring to the tank. If color shows in the bowl without flushing, the flapper is leaking.

Leak at the base: usually a failed wax ring or loose closet bolts. Do not keep using it. Water at the base seeps into the floor. Replacing the wax ring (or a modern gasket) means pulling the toilet, and the floor should be inspected for soft spots before it is reset.

If the floor around the toilet has been wet for a while, tile can loosen and the subfloor can need repair. That is common work for our bathroom flooring and tile projects.`,
    [], false],
  ['emergencies', 'Slow or clogged bathroom drains: what to try before calling for help',
    `Slow drains are usually hair and soap buildup. Try this order:
1. Remove the stopper or strainer and clear visible hair.
2. Use a plastic drain-cleaning strip or a small hand auger. These are cheap and effective.
3. Flush with hot (not boiling) water. Avoid chemical drain cleaners, which can damage some pipes and are hazardous if you later need a plumber to open the line.
4. Clean the P-trap under a sink: place a bucket, unscrew the slip nuts, empty and rinse it, then reassemble.

Call a plumber if multiple fixtures drain slowly, if you hear gurgling, or if water backs up in the tub when you flush. Those signs point to a main-line problem.

Prevention: hair catchers in showers, no wipes or paper towels in toilets (even "flushable" ones), and ventilation fans that actually remove moisture.`,
    [], false],
  ['emergencies', 'Mold after a bathroom leak: what homeowners should know',
    `Mold can start growing in as little as 24 to 48 hours on materials that stay wet, per the EPA. After a leak:
- Dry everything fast with towels, fans and dehumidifiers
- Throw out soaked porous materials such as carpet or wet insulation that cannot be dried
- Small surface mold on hard, nonporous surfaces can often be cleaned with detergent and water. Wear gloves, eye protection and a mask.
- If mold covers a large area (the EPA uses roughly 10 square feet as a guide), returns after cleaning, or is behind walls, get a professional assessment

The fix is the water source. Cleaning without fixing the leak only buys time. A bathroom ventilation fan sized for the room and vented outdoors is one of the best prevention upgrades.`,
    [], false],
  ['emergencies', 'When a bathroom leak or repair becomes a full remodel',
    `Not every leak needs a gut remodel. A good rule: repair when the damage is limited and caught early, remodel when the same problems keep returning.

Signs it may be time to remodel:
- You have patched the same leak, grout or caulk repeatedly
- The floor is soft or the subfloor is stained
- Tile is loose across a wide area or sounds hollow
- The shower base or surround is cracked or old waterproofing has failed
- Fixtures are corroded and parts are hard to find
- The layout no longer works for your household

Cost context: midrange bathroom remodels in 2026 commonly run from about $15,000 to $30,000, with simple updates far less. Spending on repeated repairs adds up. A written estimate lets you compare. Our estimates are free.`,
    [], false],
  ['tile-materials', '10 advantages of tile in a bathroom',
    `Tile is the most common finish in bathrooms for good reason. Here are the main advantages.

1. Water resistance. Porcelain and ceramic tile do not absorb water the way wood or carpet can. With proper waterproofing underneath, tile handles daily moisture well.
2. Durability. Porcelain is dense and hard-wearing. A well-installed tile floor can outlast many other flooring types.
3. Easy cleaning. Glazed tile wipes clean and resists stains. Matte textured finishes help hide water spots.
4. Hygiene. Tile does not trap dust, dander or odors like carpet, and it does not harbor allergens.
5. Design variety. Colors, sizes, patterns and textures are nearly endless. NKBA's 2026 report found patterned and textured tile gaining ground (66%) and large-format floors expected to lead (80%).
6. Slip resistance options. Look for tile rated for wet areas, such as a DCOF of 0.42 or higher under ANSI A326.3 for wet interior use.
7. Works with heated floors. Tile conducts heat well, which is why electric radiant mats under tile are popular.
8. Fire resistance. Tile does not burn.
9. Resale appeal. Updated, neutral tile is a common feature of the midrange remodels that recoup the most at resale.
10. Low long-term maintenance. Tile does not need refinishing. Grout may need cleaning and occasional sealing.

Honest trade-offs: tile can feel cold underfoot (heated floors fix this), grout needs upkeep, and results depend on the quality of the installation and waterproofing behind it. See our tile installation page or request a free estimate.`,
    [[`Installation matters as much as the tile. A flat, well-prepared surface and proper waterproofing are what make tile last.`, true]], true],
  ['tile-materials', 'Tile vs vinyl plank vs laminate in a bathroom: which holds up best?',
    `Bathrooms are the wettest room in the house, so flooring choices matter.

Tile (porcelain or ceramic): best for water resistance and longevity; many style options; heated floor friendly; higher installed cost and longer install; grout needs care.

Luxury vinyl plank (LVP): waterproof planks, warmer underfoot and quicker to install; can dent or scratch; lower resale appeal in some markets; water can still get underneath at seams and edges.

Laminate: generally not recommended for full bathrooms because standard laminate can swell when wet, though some products are rated water-resistant.

Our view: for showers and wet areas, tile with proper waterproofing is the benchmark. For a budget refresh of a low-use powder room, vinyl plank can be reasonable. We are happy to talk through options for your bathroom.`,
    [], false],
  ['tile-materials', 'Does tile add value to a home?',
    `Tile on its own does not carry a price tag at appraisal, but it plays a major role in the updated bathrooms buyers look for. Remodeling Magazine's Cost vs. Value report shows midrange bathroom remodels, which typically include new tile, recouping roughly 74% to 80% of cost at resale, with upscale projects recouping much less.

What helps: neutral colors (NKBA's 2026 report found 96% of designers name neutrals the most popular; off-white, light tan and white lead), durable large-format tile, clean grout lines and proper waterproofing. What hurts: very bold trends in a modestly priced home, cracked tile and mismatched repairs.

Tip: choose tile you love and that fits your home's style, then keep the rest of the palette neutral. A local Realtor can tell you what buyers in your town expect.`,
    [], false],
  ['tile-materials', 'Heated bathroom floors under tile: cost, benefits and how it works',
    `Electric radiant floor heating is a popular add-on under bathroom tile. A thin heating mat or cable sits under the tile and warms it, usually controlled by a programmable thermostat with a floor sensor.

Benefits: warm floors on cold Illinois mornings, faster drying of tile after a shower, and a spa-like feel. In NKBA's 2025 report 57% of designers expected heated flooring to grow in popularity.

Things to know: it is easiest to add when the floor is already being redone, since it sits in the tile setting bed. It needs a dedicated circuit, and the heating cost for a small bathroom is usually modest. Ask us to include it in your estimate when we quote a tile floor.`,
    [], false],
  ['tile-materials', 'How to clean and maintain bathroom tile and grout',
    `Good habits keep tile looking new.
- Daily: squeegee shower walls or run the exhaust fan for 20 to 30 minutes after showering.
- Weekly: clean with a pH-neutral cleaner. Avoid acidic cleaners on natural stone, which can etch it.
- Grout: scrub stained grout with a soft brush and a baking soda paste or a grout cleaner. Cement-based grout should be sealed periodically; epoxy and many premium grouts need less or no sealing.
- Caulk: replace failed silicone caulk at corners and where tile meets the tub. This is the first line of defense against leaks.
- Avoid: abrasive pads, steel wool and mixing cleaning chemicals (never mix bleach and ammonia).

Re-grouting can refresh a tired floor for much less than replacing it, when the tile and the waterproofing underneath are sound.`,
    [], false],
  ['contractors', 'How to choose a bathroom remodeling contractor in Illinois',
    `A good contractor makes a remodel feel manageable. Use this checklist when comparing bids.

1. Get at least two or three written, itemized estimates that cover the same scope.
2. Ask about licensing and insurance. Illinois has licensing rules for plumbing work, and your town may require contractor registration. Ask for proof of liability insurance and workers' compensation.
3. Insist on a written contract. Illinois' Home Repair and Remodeling Act requires written contracts with specific consumer information for most residential jobs, so confirm details with your contractor and the Illinois Attorney General's consumer resources.
4. Understand payment terms. Avoid paying the full amount up front. A deposit and payments tied to progress are normal.
5. Ask how changes are handled in writing, who is on site day to day, and what the schedule looks like.
6. Ask about permits, and who pulls them.
7. Check references and recent photos of similar work.
8. Trust your communication experience. A contractor who answers questions plainly before the contract usually keeps doing so after.

We offer free in-home estimates with a written scope and schedule.`,
    [], true],
  ['planning-permits', 'Bathroom remodeling in Kane, Kendall, DuPage and DeKalb counties: what to know',
    `We serve homeowners across ${counties.map(c => c.name).join(', ')} in northern Illinois. Whether you live in an older home in a historic downtown or a newer subdivision, a few local points apply.

- Older homes often have galvanized or cast-iron plumbing, plaster walls and subfloors that have seen decades of moisture. Plan for a contingency of 10% to 20%.
- Freeze-thaw winters put stress on outside-wall plumbing. Insulation and ventilation matter.
- Hard water is common. Choose fixtures and finishes that stand up to mineral buildup.
- Permit rules vary by town. Check with your building department, and ask us.
- Scheduling: spring and early summer fill up first. Reach out early.

Planning benchmarks for 2026: Angi's national average is about $12,200 with most projects between roughly $6,650 and $17,700, while a fuller midrange remodel is closer to $26,000 in the Cost vs. Value report. Chicago-area costs often run above national averages.`,
    [], false],
  ...counties.map(c => ['planning-permits', `Bathroom remodeling in ${c.name}, Illinois: costs, timelines and local tips`,
    `Homeowners in ${c.cities.slice(0, 6).join(', ')} and across ${c.name} ask us the same questions: what will it cost, how long will it take, and who can I trust? Here is a straightforward guide.

Costs: In 2026 Angi puts the national average bathroom remodel at about $12,200, with most projects between roughly $6,650 and $17,700. A fuller midrange remodel with new tub or shower, tile, vanity and toilet is closer to $26,000 in the Remodeling Magazine Cost vs. Value report. Costs in the Chicago suburbs frequently run above national averages. Your layout, finishes and what is behind the walls set the final price.

Timeline: a refresh can take days to two weeks; a typical full remodel takes about two to six weeks of work once materials arrive. Order tile, vanities and glass early.

Permits: rules differ by town and project. Check with your local building department before work starts.

What we do in ${c.name}: bathroom remodeling, tile installation, shower and tub remodeling and other home projects. ${c.blurb}

Next step: request a free estimate and we will give you a written scope and schedule for your home.`,
    [], false])
];

module.exports = { categories, threads };
