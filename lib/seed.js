// Starter forum content. Figures are approximate national or regional benchmarks gathered in 2026 and are
// attributed to their sources; they are not quotes for any specific project. Admins can edit or delete everything.
const TEAM = 'Budget Bath Solutions Team';

const categories = [
  ['costs-budgeting', 'Costs & Budgeting', 'What bathroom projects cost in 2026 and how to plan a realistic budget.'],
  ['home-value', 'Home Value & Resale', 'Which bathroom updates pay off when you sell, and what Illinois homes are selling for.'],
  ['design-trends', 'Design Trends 2026', 'What designers and homeowners are choosing for new bathrooms this year.'],
  ['tile-materials', 'Tile & Materials', 'Tile, grout, waterproofing and fixtures, explained plainly.'],
  ['planning-permits', 'Planning, Permits & Timelines', 'How to prepare for a remodel, from first ideas to final walk-through.'],
  ['repairs-water', 'Repairs & Water Damage', 'Leaks, mold, failing grout and when a repair becomes a remodel.'],
  ['accessibility', 'Accessibility & Aging in Place', 'Safer, easier bathrooms for every stage of life.'],
  ['showcase', 'Project Showcase', 'Before-and-after stories and ideas from our projects.']
];

// [category slug, title, body, [replies], pinned]
const threads = [
  ['costs-budgeting', 'Start here: what does a bathroom remodel cost in 2026?',
    `A quick overview of the 2026 benchmarks homeowners ask about most. Every home is different, so treat these as planning ranges, not quotes.

Angi's 2026 data (28,000+ verified projects) puts the national average bathroom remodel at about $12,200, with most projects between roughly $6,650 and $17,700. HomeGuide's professional pricing is a little higher for larger rooms: about $2,500 to $10,000 for a small bath, $6,000 to $15,000 for a full bath, and $10,000 to $30,000 for a primary bath.

Remodeling Magazine's Cost vs. Value report, which prices a typical midrange remodel with a new tub or shower, vanity, toilet, tile and fixtures, lands closer to $26,000 for that fuller scope. The difference comes from scope: a refresh and a full gut are very different jobs.

Typical ranges by project type (planning figures):
- Cosmetic refresh (paint, vanity, fixtures, lighting): about $3,000 to $10,000
- Midrange remodel (new tub or shower, tile, vanity, toilet): about $15,000 to $30,000
- Upscale or luxury remodel (custom tile or stone, freestanding tub, glass steam shower, heated floors): about $50,000 to $90,000
- New bathroom addition: about $25,000 to $50,000 or more

Costs in the Chicago suburbs tend to run above national averages, so ask for a written, itemized estimate for your own bathroom. Ours is free.`,
    [[`Budget tip: a common rule of thumb is to add a 10% to 20% contingency to your budget. Older Illinois homes in particular can reveal surprises once walls and floors are open, such as old plumbing or subfloor damage.`, true]], true],
  ['costs-budgeting', 'Cost by bathroom size: half bath, guest bath, primary bath',
    `Angi's 2026 figures by room type are a useful starting point:
- Half bath or powder room (about 30 sq ft): roughly $1,500 to $15,000
- Guest or hall bath (about 80 sq ft): roughly $5,600 to $20,000
- Primary bath (about 120 sq ft): roughly $8,400 to $30,000

Per square foot, professional remodels commonly fall between about $70 and $250 depending on scope. Small bathrooms often cost more per square foot because plumbing rough-in, permits and fixtures are fixed costs spread over less space.

By size, Angi's table shows roughly $1,800 to $6,300 for 25 sq ft, $3,500 to $12,500 for 50 sq ft, $5,300 to $18,800 for 75 sq ft and $7,000 to $25,000 for 100 sq ft.`,
    [], false],
  ['costs-budgeting', 'Where does the money actually go? A typical bathroom budget breakdown',
    `Many homeowners are surprised how much goes to things behind the walls. A budget breakdown commonly cited from NKBA research looks like this:
- Cabinetry and hardware: about 18%
- Fixtures: about 17%
- Faucets and plumbing: about 16%
- Flooring: about 11%
- Countertops: about 9%
- Lighting and ventilation: about 7%
- Walls and ceilings: about 7%
- The rest: doors and windows, design services, disposal and permits

Labor is generally about 20% to 40% of a professional job, and materials and fixtures about 60% to 80%, though tile-heavy and custom work shifts that balance toward labor.

Where to save: choose standard sizes, keep plumbing where it is, and splurge on the things you touch daily (shower valve, faucet, lighting). Where not to save: waterproofing, ventilation and the tile prep that sits behind the finished surface.`,
    [], false],
  ['costs-budgeting', 'Fixture price ranges: sinks, toilets and what makes them expensive',
    `Angi's 2026 averages for common fixtures, installed prices vary:
- Sinks: wall-mount about $350 to $650; undermount about $170 to $2,000; pedestal about $330 to $730; vessel about $450 to $5,000
- Toilets: two-piece about $725; one-piece about $1,025; wall-mounted about $675; dual-flush about $350; smart toilets about $4,000

Features that raise cost quickly include smart bidet seats, wall-mounted fixtures (which need a framed carrier in the wall), custom vanities and specialty finishes.`,
    [], false],
  ['home-value', 'Does a bathroom remodel add value to my home?',
    `Short answer: yes, but the return depends on how much you spend.

Remodeling Magazine's Cost vs. Value report, the most-cited benchmark, shows a midrange bathroom remodel (around $26,000) recouping roughly 74% to 80% of its cost at resale, among the stronger returns of any interior project. Upscale remodels recoup far less, roughly 40% to 50%, because buyers and appraisers cap what they will pay for a bathroom relative to the rest of the house. The most recent NAR and NARI Remodeling Impact Report, which surveys Realtors, estimates around 50% recovery for a typical bathroom renovation.

Takeaways:
- A well-planned, midrange remodel is usually the best value if you plan to sell
- Cosmetic refreshes often return a high percentage of a small spend
- If you are staying put, comfort, safety and daily enjoyment are a legitimate part of the return

Before you decide, ask a local Realtor what buyers in your town expect. Our estimates are free if you want to compare scopes.`,
    [], true],
  ['home-value', 'What are homes selling for in our service area right now?',
    `Home values affect how much you should put into a remodel. As a rough guide from 2026 market data:
- The Illinois Realtors Chicago-area median sale price was around $400,000 in spring 2026, up roughly 5% from a year earlier
- DuPage County's median sale price was near $478,000 in mid-2026 according to county-level sales data
- Kane, Kendall and DeKalb counties generally sit below DuPage; check recent sales in your own neighborhood

A common planning guideline is to avoid over-improving: if your bathroom budget would make it the nicest room in a modestly priced home, buyers may not pay for it. A Realtor's comparative market analysis is free and will tell you what comparable homes with updated bathrooms sell for.`,
    [[`Figures here are market-wide medians and not predictions for any one home. Neighborhood, school district and condition can move a home's value far more than a single room.`, true]], false],
  ['home-value', 'Remodeling before you sell: what buyers notice',
    `Buyers notice bathrooms. In general, the updates that help most before listing are inexpensive and visible: fresh grout and caulk, a new vanity and mirror, updated lighting, a new toilet seat or toilet, and clean, neutral paint. Fixing visible damage matters more than adding luxury.

If a bathroom has water damage, soft floors or failing tile, repair it first, since inspectors flag it and it can derail a sale. Consider a tub-to-shower conversion carefully: many buyers like having at least one tub in the home.`,
    [], false],
  ['design-trends', 'The 2026 NKBA Bath Trends Report: what is in and what is out',
    `The National Kitchen & Bath Association's 2026 Bath Trends Report surveyed designers and highlights several clear directions:
- Light neutrals lead: 96% named neutrals the most popular bath colors, led by off-white (58%), light brown or tan (54%) and white (40%)
- Large-format floor tile: 80% expect it to be the most popular flooring over the next three years, and 91% say durability and easy upkeep are the top consideration for flooring
- Matte, brushed and satin faucet finishes (54%, 51% and 46%) are more popular than polished (39%)
- Showers over tubs: 55% say a larger shower is more important than a bathtub
- Patterned and textured tile is gaining ground, according to 66%
- Layered lighting: 88% list natural light as a top priority, 80% include nighttime lighting and 47% favor mirrors with integrated lighting
- A hotel or resort feel is expected to be popular, according to 77%
- Smart toilets: 51% expect them to rise in popularity

The bigger picture: wellness, durability and low maintenance. Full report: nkba.org.`,
    [], true],
  ['design-trends', 'Larger showers, fewer tubs: should you convert?',
    `NKBA's 2026 report finds more than half of designers (55%) say shower size matters more than having a tub, and that primary bath space allocation is a top priority for 89%. Steam, seating, shelving and spa-like features all fit better in a bigger shower.

Before converting, consider: Is this your only tub? (Buyers with young children often look for one.) Where is the drain, and what does the floor framing allow? Is the waterproofing plan solid? We are glad to walk through your layout at a free estimate.`,
    [], false],
  ['design-trends', 'Lighting, finishes and little upgrades that feel luxe',
    `Not every on-trend change needs a gut remodel. Options with strong visual payoff:
- Mirrors with integrated lighting, and warm, dimmable LED fixtures
- A motion-activated nightlight under the vanity
- Matte black, brushed brass or brushed nickel faucets in place of polished chrome
- A heated floor mat under tile (57% of designers expected heated flooring to grow in NKBA's 2025 report)
- Textured or patterned accent tile in a niche or behind the vanity
- A new exhaust fan with a humidity sensor, which protects everything else you install`,
    [], false],
  ['tile-materials', 'Porcelain vs ceramic vs natural stone: how to choose',
    `Porcelain is denser and absorbs less water than ceramic, which makes it a popular choice for floors and showers, especially in our freeze-thaw climate. Ceramic is typically easier to cut and often less expensive, and works well on walls. Natural stone such as marble or travertine looks beautiful but is softer, can stain or etch, and usually needs periodic sealing.

Match the tile to the surface: floors need traction (look at the slip-resistance rating), shower floors need small tile or a sloped system that handles water, and walls can be larger format for fewer grout lines.`,
    [], false],
  ['tile-materials', 'Why large-format tile is everywhere (and what it needs)',
    `Eighty percent of designers surveyed by NKBA for 2026 expect large-format flooring to lead over the next three years. Fewer grout lines mean a cleaner look and easier cleaning.

But large tile is less forgiving: the floor must be flat, so prep (leveling, proper underlayment, the right mortar and a back-buttering or large-notch technique) matters more. Ask whoever installs your tile how they will check flatness.`,
    [], false],
  ['tile-materials', 'Waterproofing a shower: the part you never see',
    `A beautiful shower fails if the waterproofing does. Modern systems use either a continuous waterproof membrane (sheet or liquid-applied) over cement board or foam board, or a waterproof foam board system with sealed seams. Details that matter: the shower floor must slope to the drain, corners and niches need sealed transitions, and curb and bench tops need a pitch so water runs back into the shower.

Ask your installer which system they use, and whether a flood test is done before tile goes on.`,
    [], false],
  ['planning-permits', 'How long does a bathroom remodel take?',
    `As a general guide, a cosmetic refresh takes a few days to two weeks, and a typical full remodel takes about two to six weeks of on-site work after materials are in. Layout changes, custom tile and special-order fixtures lengthen the schedule.

The biggest delays usually come from ordering: vanities, glass and specialty tile can take weeks. Order early, and have your contractor confirm quantities.`,
    [], false],
  ['planning-permits', 'Do I need a permit for a bathroom remodel in Kane, Kendall, DuPage or DeKalb County?',
    `Requirements vary by town. Many municipalities require permits when plumbing or electrical work is changed, walls are moved or a bathroom is added, and fewer require one for like-for-like cosmetic updates. Illinois also has plumbing licensing rules, so confirm who is allowed to do the plumbing work.

Call your local building department before starting, and ask us at your estimate; we will tell you what we expect for your town.`,
    [], false],
  ['planning-permits', 'Checklist: how to prepare for your free estimate',
    `You will get the most from an estimate if you come prepared:
1. Photos of your current bathroom and any trouble spots
2. A rough budget range (and your comfort with a contingency)
3. Pictures of styles you like
4. Your must-haves versus nice-to-haves
5. Your timeline and any deadlines (a sale, an event, a family visit)
6. Questions about permits, payment schedule and who will be on site

You can also create a free account on this site and upload photos ahead of time.`,
    [], false],
  ['repairs-water', 'Soft floor near the tub or toilet? What it can mean',
    `A floor that flexes or feels spongy near water fixtures can signal moisture in the subfloor. Causes include a slow leak at a supply line or drain, failing caulk or grout, or a wax ring leak. Do not ignore it: water damage tends to grow and can lead to mold.

Steps: shut off water if you suspect an active leak, check the ceiling below, look for staining around the fixture base, and have it inspected. If the subfloor is damaged, repairs often include replacing it before any new tile goes down.`,
    [], false],
  ['repairs-water', 'Cracked grout or loose tile: repair or replace?',
    `A few hairline grout cracks can often be repaired with fresh grout and caulk. Widespread loose tile, hollow-sounding tile, or grout that keeps failing in the same area suggests moisture or movement underneath, and patching the surface will not hold. Tell us what you see and send photos through your account.`,
    [], false],
  ['accessibility', 'Aging in place: bathroom upgrades worth considering',
    `NKBA's 2026 report found 32% of designers consider aging in place a mainstream trend and another 48% say it is on its way. Common upgrades:
- A curbless or low-threshold shower
- Grab bars (installed into blocking in the wall)
- A comfort-height toilet
- Slip-resistant tile and good lighting at night
- A handheld shower head and built-in seat
- Wider doorways where possible

Angi's 2026 data shows individual accessibility fixtures from about $100 to $3,000, and a fully accessible bathroom averaging about $9,000. Remodeling Magazine's universal-design bathroom benchmark was about $42,000 in its 2025 edition. Costs depend heavily on what the structure allows.`,
    [], false],
  ['showcase', 'Welcome to the Budget Bath Solutions community',
    `Welcome! This forum is for Illinois homeowners planning, comparing and learning about bathroom projects. Ask a question, share a project or tell us what you wish you had known.

Please be kind, avoid sharing personal contact details in public posts and remember that costs and building rules vary by town. Our team reads every post and replies when we can. For anything urgent, use the contact page.

Browse our Our Work page for photos from past projects.`,
    [], true]
];

module.exports = { TEAM, categories, threads };
