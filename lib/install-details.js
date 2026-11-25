'use strict';
// Install details: the small, tedious parts of every job that crews forget to price (protecting the work area, layout,
// caulking, touch-up, bagging debris, cleanup, testing, the customer walk-through) plus the specs, common mistakes and
// checks for each type of install. Every handyman category and every bathroom phase has an entry, and individual tasks
// add their own specs on top.
//
// Time: OVERHEAD gives the share of each phase or category that is setup and cleanup rather than "install" time. The
// library hours are install-only, so the estimator adds the overhead on top: total = install / (1 - share).

const CLOSEOUT = {
  daily: ['Sweep and vacuum the work area at the end of every day.', 'Bag trash and carry it out; never leave debris in the home overnight.', 'Wipe dust off surfaces outside the work area and re-check the floor protection.', 'Put tools and cords away from walkways, and cap or restore any water or power that was shut off.', 'Leave the toilet or a working bathroom available to the family when possible.'],
  final: ['Remove all protection, tape and zip walls and bag it.', 'HEPA-vacuum, then wipe floors, counters, sills, fixtures and glass; remove stickers, labels and adhesive residue.', 'Check every fixture, door, drawer and outlet for smudges, drips and loose parts.', 'Hand the customer spare tile, paint, keys, manuals, warranty cards and the care sheet.', 'Photograph the finished work and take a signed completion sign-off.'],
  disposal: ['Sort recyclables (metal, cardboard, clean wood) from trash.', 'Wrap sharp or heavy debris (glass, tile, cast iron) in bags or boxes so it can be lifted safely.', 'Do not put paint, solvents, adhesives or caulk tubes with liquid left in household trash: let latex paint dry out and take the rest to a hazardous-waste drop-off.', 'Remove everything the same day or load it into the dumpster; confirm the truck and dump fee when the job is priced.'],
  paperwork: ['Confirm the scope and any changes in writing before starting.', 'Photograph before, during and after (especially hidden work).', 'Record the hours, materials used and any change orders for job costing.']
};

// Share of total time spent on setup, masking, tool cleanup, debris and daily cleanup.
const OVERHEAD = {
  'Drywall & plaster': 0.15, 'Carpentry & trim': 0.1, 'Doors & windows': 0.1, Flooring: 0.1, Kitchen: 0.1, Plumbing: 0.12, Electrical: 0.08,
  'Smart home & security': 0.08, 'Exterior & roofing': 0.12, 'Deck, fence & concrete': 0.12, Painting: 0.15, 'Assembly & mounting': 0.08,
  'Safety, HVAC & seasonal': 0.1, 'General & haul-away': 0.05
};
const PHASE_OVERHEAD = {
  'Protect, set up and dust control': 0, 'Lead and asbestos testing (lab turnaround)': 0, 'Demolition and haul-away': 0.12, 'Demolition to the studs and subfloor': 0.12,
  'Framing, blocking and subfloor repairs': 0.08, 'Plumbing and electrical rough-in (licensed trades)': 0.1, 'Rough-in inspection': 0, 'Insulation and drywall hanging': 0.1,
  'Tape, mud and sand (dry time between coats)': 0.15, 'Backer and waterproofing': 0.08, 'Waterproofing cure and flood test': 0, 'Tile setting and grout': 0.12, 'Prime and paint': 0.15,
  'Fixtures, vanity, toilet, electrical trim-out': 0.08, 'Glass install (ordered after tile, 7 to 14 day lead time)': 0.05, 'Punch list, final clean and walk-through': 0
};
const MIN_OVERHEAD_HOURS = 0.1;
const r2 = n => Math.round(n * 100) / 100;

const phaseTotal = (name, hours) => { const s = PHASE_OVERHEAD[name] || 0; return s ? hours / (1 - s) : hours; };
const phaseShare = name => PHASE_OVERHEAD[name] || 0;

// Install hours, setup and cleanup hours, and the cushioned total for one handyman task line.
function taskHours(task, qty, cushion) {
  if (!task || !Number.isFinite(Number(task.hrs)) || Number(task.hrs) < 0 || Number(task.hrs) > 1000) throw new RangeError('Task hours must be between 0 and 1,000.');
  if (!Number.isFinite(qty) || qty < 0 || qty > 100000) throw new RangeError('Task quantity must be between 0 and 100,000.');
  if (!Number.isFinite(cushion) || cushion < 0 || cushion > 1) throw new RangeError('Labor cushion must be between 0 and 100 percent.');
  const work = r2(Math.max(task.min_hrs || 0, task.hrs * qty)), share = OVERHEAD[task.category] ?? 0.1;
  const overhead = r2(Math.max(MIN_OVERHEAD_HOURS, work / (1 - share) - work));
  return { work, overhead, total: r2((work + overhead) * (1 + cushion)) };
}

// What the setup and cleanup time covers, so the customer and crew can see where the minutes go.
const OVERHEAD_PARTS = ['Protect floors, furniture and the path to the work area', 'Gather and stage tools and materials', 'Measure, mark and lay out', 'Bag debris and clean up as you go', 'Touch up, caulk and finish details', 'Test the work and walk the customer through it'];

const D = (prep, specs, finish, cleanup, mistakes, verify) => ({ prep, specs, finish, cleanup, mistakes, verify });
const list = s => s.split('|').map(x => x.trim()).filter(Boolean);
const d = (prep, specs, finish, cleanup, mistakes, verify) => D(list(prep), list(specs), list(finish), list(cleanup), list(mistakes), list(verify));

const CATEGORY_DETAILS = {
  'Drywall & plaster': d(
    'Cover floors and nearby furniture and seal doorways with plastic|Find studs, pipes and wires before cutting (stud finder and a small test hole)|Shut off power to circuits behind the work',
    'Screws 16 in apart on walls, 12 in on ceilings, set just below the paper without breaking it|Stagger seams and keep joints off the corners of doors and windows|Three thin coats of compound, each feathered wider than the last, 24 hours dry between coats',
    'Prime the repair before paint so the patch does not flash|Match the texture (knockdown, orange peel) before priming|Caulk the gap at trim and ceilings',
    'Wet-sand or use a vacuum sander to control dust|HEPA-vacuum walls, floor and ledges|Wash tools and dispose of compound only in the trash, never down the drain',
    'Thick coats that crack or shrink|Sanding through the paper|Painting over dusty or unprimed compound',
    'Hold a work light flat to the wall to find ridges and low spots|Run a hand over the repair after priming'),
  'Carpentry & trim': d(
    'Measure twice and write the cut list|Acclimate wood trim in the room before cutting|Mark studs with painter tape so nails hit framing',
    'Nail trim into studs and plates, not just the drywall; 15 or 16 gauge nails, glued and nailed at corners|Cope inside corners and miter outside corners; leave a 1/8 in reveal at door and window casing|Sink nails slightly and fill the holes',
    'Fill nail holes with wood filler, sand and caulk the top edge and corners|Prime or paint bare ends before installing|Touch up paint on adjacent walls',
    'Vacuum sawdust from the floor, vents and the cut station|Bag off-cuts and keep any long pieces that the customer may want',
    'Cutting too short (leave the pencil line)|Nailing into pipes or wires|Gaps at the corners from out-of-square walls',
    'Check corner joints and gaps against a square and straightedge|Look along the length of the trim for waves'),
  'Doors & windows': d(
    'Protect the floor and remove window coverings and nearby wall hangings|Measure the opening and check it is plumb and square|Confirm the door swing, hardware and handing',
    'Shim behind each hinge and the lock side and keep a consistent 1/8 in gap around the door|Use 3 in screws in the top hinge to pull the jamb to the stud|Insulate gaps around windows with low-expansion foam and seal the exterior with flashing tape and sealant',
    'Caulk outside window and exterior door edges and paint or stain bare wood|Install the strike plate, bumper and weatherstrip|Touch up the paint on trim|Score and trim the shims flush',
    'Remove the old door or window, hardware and packaging from the site|Wipe glass and sills and vacuum the track|Bag old glazing, caulk and foam',
    'Out-of-plumb jambs that make the door swing open or closed on its own|Over-tightening screws that bow the jamb|Missing flashing that lets water in',
    'Open and close the door or window ten times and check it latches without rubbing|Spray a hose or water test on exterior units when possible'),
  Flooring: d(
    'Acclimate flooring in the room for the manufacturer time, often 48 hours|Check the subfloor is flat (about 3/16 in in 10 ft) and dry|Undercut door casings and remove base or shoe',
    'Leave the expansion gap the maker specifies, about 1/4 in at the walls|Stagger the end joints at least 6 in|Start from a straight reference line and dry-lay the first rows',
    'Install transitions, base and shoe and set them with finish nails|Fill gaps and nail holes with matching filler|Remove spacers and any adhesive squeeze-out right away',
    'Vacuum before and after, bag off-cuts and damaged boards|Mop with the cleaner the maker allows and keep spare planks for the customer',
    'Skipping the moisture test and flatness check|Gluing floating floors to the wall|Cutting the last row too narrow (balance the layout)',
    'Walk the floor and listen for hollow or clicking spots|Check for gaps at seams and for lippage'),
  Kitchen: d(
    'Empty the cabinets and counters and protect the floor|Shut off water, power and gas to the affected appliance and photograph the existing connections|Check the wall for studs, pipes and wires and the layout lines',
    'Hang wall cabinets from a level ledger and screw through the back rail into studs, not just the drywall|Shim cabinets plumb and level before tightening them together|Leave 1/8 in reveals on doors and align the drawer fronts',
    'Install toe-kick, filler strips, end panels and hardware and caulk the countertop and backsplash joints|Adjust the doors and drawers for even gaps',
    'Vacuum cabinet interiors and wipe all surfaces|Remove old cabinets, packaging and screws and bag debris|Return the shelf pins and shelves',
    'Cabinets that are not plumb, so doors will not align|Short screws that pull out|Forgetting the cutouts for sinks, pipes and outlets',
    'Load the shelves, open every door and drawer and test the appliances and faucet'),
  Plumbing: d(
    'Locate and test the shut-off valves before starting and photograph the existing connections|Lay down a drop cloth and keep a bucket, rags and a wet vacuum on hand|Tell the family when the water will be off',
    'Use new supply lines, washers and wax or gasket rings (never reuse them)|Use thread tape on threaded joints, but not on compression fittings|Hand-tighten, then a quarter to half turn more; do not overtighten',
    'Re-caulk the base or edges with 100 percent silicone and plumber putty where the maker calls for it|Label or write down the valve location for the customer|Re-attach the aerator after flushing the lines',
    'Drain and mop up water, wipe pipes dry and remove any old parts and packaging|Remove debris and test the area with a paper towel for drips',
    'Reusing old supply lines and gaskets|Over-tightening that cracks porcelain or fittings|Skipping the leak check after the walls and cabinets are closed',
    'Run the water for 10 minutes and check every joint with a dry paper towel|Re-check after 24 hours and flush the fixture or drain several times'),
  Electrical: d(
    'Turn off the breaker, tag it and test the circuit dead with a voltage tester|Photograph the existing wiring before disconnecting|Check the box, wire gauge and condition of insulation',
    'Match the wire gauge to the breaker (14 AWG on 15 A, 12 AWG on 20 A) and strip about 3/4 in|Tighten terminals to the torque on the device and pigtail the grounds|Use GFCI protection for bathrooms, kitchens, garages and outdoors and tamper-resistant devices where the code requires them|Do not overfill the box',
    'Install the cover plates plumb and label the circuits at the panel|Seal the gaps around the fixtures and boxes|Touch up the paint around the plates',
    'Bag wire trimmings and packaging|Vacuum drywall dust from the work area|Return the breaker only when all the covers are installed',
    'Working on a circuit that is not truly dead (always test it)|Loose terminals that overheat later|Mixing up line and load terminals on a GFCI',
    'Test with an outlet tester and push the GFCI test and reset buttons|Check the fixture or switch works with the load before closing the job'),
  'Smart home & security': d(
    'Confirm the Wi-Fi coverage, the app and the account before starting|Turn off the power for any wired device and test it dead|Photograph the old wiring and label the wires',
    'Check the voltage and the common (C) wire for thermostats and switches|Mount cameras and sensors at the manufacturer height and angle and keep them out of direct sun|Use the weather-rated fittings and drip loops outdoors',
    'Name the devices, set the schedules and share access with the customer|Update the firmware and test notifications|Seal outdoor penetrations with caulk',
    'Remove packaging and old devices and recycle electronics|Wipe fingerprints from lenses and screens',
    'Skipping a Wi-Fi signal test before drilling|Forgetting to reset or remove the old owner on used devices|Wiring without turning the power off',
    'Test each device from the app and with the customer|Give the customer the passwords and written instructions'),
  'Exterior & roofing': d(
    'Check the weather and the forecast and put a ladder on firm, level ground tied off at the top|Protect landscaping, windows and the driveway|Wear fall protection on roofs and keep the work site clear',
    'Flash and seal every penetration and overlap the courses so water sheds downward|Nail shingles with the specified nails at the correct line|Slope gutters about 1/16 in per foot toward the downspout|Use exterior-grade, corrosion-resistant fasteners and sealants',
    'Caulk, prime and paint bare wood and touch up the finish|Seal the exposed nail heads|Re-check the flashing and the gutter hangers',
    'Pick up every nail and scrap with a magnetic sweeper|Wash off dirt and debris from siding, windows and walks|Haul away old materials',
    'Working in wet or windy weather|Nailing through the wrong layer or too high on shingles|Caulking where water has to drain',
    'Hose-test the repair or wait for a rain and check for leaks|Look at the work from the ground and from the attic where possible'),
  'Deck, fence & concrete': d(
    'Call 811 (JULIE in Illinois) to locate the utilities before digging|Check the permit and setback requirements and mark the layout with string|Protect the lawn and the nearby walks',
    'Set the posts below frost depth (42 in in northern Illinois) in concrete and brace them plumb|Use joist hangers with the approved nails and flash the ledger against the house|Use hot-dip galvanized or stainless fasteners with treated lumber|Space deck boards about 1/8 in and keep the railings at 36 in high with openings under 4 in',
    'Seal the cut ends, stain or seal after the wood is dry and trim the screw heads flush|Backfill and compact the soil around the posts|Cure fresh concrete under a damp cover',
    'Collect the screws, off-cuts and concrete spills and rake the soil|Wash off any dust and mud from the walks|Remove the forms once the concrete has set',
    'Skipping the utility locate|Posts set shallow so they heave in winter|Sloping the deck or pad toward the house',
    'Check the level, post plumb, rail strength and the gate swing|Walk the deck and listen for loose boards'),
  Painting: d(
    'Move or cover the furniture, tape the trim and lay drop cloths|Wash greasy or dirty areas, fill holes and sand them smooth|Check the humidity and temperature are in the paint can range|Test for lead in pre-1978 homes',
    'Prime stains, bare patches and new drywall|Cut in the edges with a brush, then roll two coats, maintaining a wet edge|Allow the recoat time on the can, usually 2 to 4 hours|Use a bath or kitchen paint in wet rooms',
    'Pull the tape while the paint is slightly tacky and touch up any bleed|Re-attach the cover plates, hardware and vent covers|Label and leave the leftover paint for the customer',
    'Wash the brushes and rollers in a utility sink, never in a storm drain|Fold the drop cloths, bag the tape and the empty cans|Wipe the paint spatter from the floors and the windows',
    'Painting over dirty or glossy surfaces without sanding or priming|Pulling the tape after the paint has fully cured so that it peels|Skipping the second coat',
    'Check the walls in raking light for missed spots and drips|Leave windows open and cure for 30 days before scrubbing'),
  'Assembly & mounting': d(
    'Locate the studs and any pipes or wires behind the wall|Confirm the weight and the fastener rating and read the instructions|Protect the floor and surrounding items',
    'Fasten into studs or use the rated anchors (toggle bolts or the wall anchors) for hollow walls|Check the level with a laser or a bubble level before drilling|Use the mounting hardware that came with the item and the right size lag screws',
    'Fill the extra holes, touch up the paint and hide the cables|Add the cover plates and trim|Show the customer how to use or clean it',
    'Collect packaging, plastic and the old hardware and recycle|Vacuum the drilling dust and wipe the surfaces',
    'Anchoring heavy items into drywall only|Drilling without checking for pipes or wires|Skipping the final level check',
    'Pull test the mounted items and check they are level|Load test the shelves and the grab bars'),
  'Safety, HVAC & seasonal': d(
    'Turn off the power or gas to the equipment before servicing it|Check the filter size and the equipment tags|Wear gloves, eye protection and a respirator for dust or mold',
    'Replace the filters with the right MERV rating and direction arrow|Seal the air leaks with caulk and foam and insulate to the recommended R-value|Test the alarms and the detectors by pressing the test button',
    'Record the dates on the equipment and on the customer sheet|Set the reminders for the next service',
    'Dispose of the old filters and the debris|Vacuum around the equipment',
    'Skipping the safety shut-off|Using the wrong filter size|Blocking the vents with insulation',
    'Run the system and check the airflow and operation'),
  'General & haul-away': d(
    'Review the list of items and agree on the priority and what is to be kept|Photograph the areas before starting|Protect the floors and the path to the truck',
    'Lift with a partner or dolly and wrap the sharp items|Separate recyclables, hazardous waste and trash|Keep receipts for dump fees',
    'Sweep the area and leave it as clean as found|Hand over the keys and the receipts and note any items left',
    'Remove all debris and sweep the area and the truck path',
    'Taking items the customer did not agree to|Overloading the truck',
    'Walk the area with the customer and confirm all items are gone')
};

// Task-specific specs that go on top of the category details.
const T = (code, specs, finish, mistakes, verify) => [code, d('', specs, finish, '', mistakes, verify)];
const CODE_DETAILS = Object.fromEntries([
  T('pl-toilet', 'Rough-in is usually 12 in from the finished wall|The flange sits on top of the finished floor with a new wax ring or gasket and brass or stainless closet bolts|Tighten the bolts a little at a time, alternating sides, until the toilet does not rock', 'Caulk the base to the floor except at the back, trim the bolts and fit the covers|Install the seat and check the tank water line', 'Overtightening and cracking the porcelain|Reusing the old wax ring', 'Flush five times and check the base and the supply for leaks|Rock the bowl by hand to confirm it is solid'),
  T('pl-faucet-bath', 'Flush the lines before installing the aerator|Use new braided supply lines and tighten them hand-tight plus a quarter turn|Set the pop-up so the stopper opens and seals', 'Seal the base to the counter with silicone or the gasket supplied|Wipe the fixture clean and photograph the shut-off valves for the customer', 'Forgetting to flush the debris out of the lines|Dripping at the pop-up nut', 'Run hot and cold, fill and drain the sink and check beneath with a dry paper towel'),
  T('pl-faucet-kitchen', 'Flush the lines and set the sprayer hose so it can retract freely|Use new braided supply lines and tighten them securely|Mount the faucet to the deck with the nut and gasket for a tight, level seat', 'Seal the base with silicone if there is no gasket and reset the cabinet contents|Test the sprayer and the pull-down hose', 'Pinching the sprayer hose under the sink|Cross-connecting the hot and cold', 'Run hot and cold, fill and drain the sink and check beneath with a dry paper towel'),
  T('pl-water-heater', 'Install a new T&P valve and a discharge pipe to within 6 in of the floor|Add the dielectric unions or flexible connectors, an expansion tank where required, and seismic or code straps|Gas units need a sediment trap, a vent that rises at 1/4 in per foot and a gas leak check with leak detector', 'Label the shut-offs and set the temperature to 120 F|Fill in the tag with the install date', 'Turning on the burner or element before the tank is full|Skipping the vent and combustion air check', 'Check the carbon monoxide at the draft hood and fix any leaks|Record the pilot and the venting in the permit inspection'),
  T('pl-tub-caulk', 'Remove all old caulk and mildew and let the joint dry fully|Use 100 percent silicone or the tub-and-tile caulk and tool it with a damp finger or tool|Keep the tub filled with water while caulking so the joint is not stretched', 'Let the caulk cure 24 hours before showering', 'Caulking over old caulk or damp surfaces', 'Check for gaps and pinholes once cured'),
  T('pl-sump', 'Dig the pit to the correct depth and set the pump on a firm base, not on gravel|Install a check valve and a discharge pipe that carries water away from the foundation|Provide a dedicated GFCI-protected outlet and test with water', 'Fit the cover and label the pump outlet', 'Floats that bind on the pit wall', 'Fill the pit with water and watch the pump cycle'),
  T('pl-disposal', 'Wire the disposal into the dishwasher knock-out and use a new drain gasket|Connect the dishwasher drain through a high loop or an air gap|Mount the unit and align the trap before tightening', 'Run water through the disposal and check for leaks around the flange|Tell the customer what not to put down it', 'Leaving the dishwasher knock-out plug in', 'Run the dishwasher with the disposal on and check the drain'),
  T('el-outlet', 'Match the wire gauge to the breaker size and use a pigtail on the grounds|Fit the device flush with the wall and tighten the terminal screws|Use tamper-resistant receptacles', 'Test with an outlet tester and add the cover plate', 'Back-stabbing the wires instead of using the screws', 'Plug a tester in and confirm correct wiring'),
  T('el-gfci', 'Connect the incoming power to the LINE terminals and the downstream wires to the LOAD terminals|Bathrooms need a 20 A GFCI circuit and receptacles within 36 in of the basin edge|Label the outlet downstream of the GFCI', 'Test and reset buttons need to be working before the cover plate goes on', 'Swapping LINE and LOAD', 'Press TEST to trip it and RESET to restore it'),
  T('el-fan', 'Use a fan-rated box fastened into the framing or brace|Check the blade clearance of 7 ft from the floor and 18 in from walls|Balance the blades with the kit if it wobbles', 'Tighten every set screw and re-check after a day|Install the remote battery', 'Hanging it from a standard light box|Overtightening the blade screws', 'Run it on all speeds and check for wobble'),
  T('el-fixture', 'Support heavy fixtures from the box, not the wires|Use wire nuts rated for the wire size and wrap the tape on them|Match the bulb type and wattage to the label', 'Seal the canopy to the ceiling with a thin bead of caulk|Install the bulbs and the shades', 'Using a box that is not fixture-rated', 'Test the switch and the dimmers'),
  T('fl-lvp', 'Start from the longest straight wall with the correct expansion gap and stagger the seams by 6 in or more|Use a tapping block and pull bar, not a hammer on the plank edge|Undercut the door jambs so the plank slides under', 'Install transitions at doorways and reinstall the base and shoe', 'Gluing the floor down when it is a floating floor|Forgetting the expansion gap', 'Check the seams are tight and the floor does not move or click'),
  T('fl-tile', 'Check the floor is flat within 1/4 in in 10 ft (1/8 in for large tile) and fill the low spots|Comb thinset in one direction, back-butter large tiles and aim for 80 percent coverage dry or 95 percent wet|Use spacers, set the first row to a straight line and keep joints even', 'Wait 24 hours before grouting, clean the haze and seal the grout and stone|Caulk the changes of plane with matching silicone', 'Walking on the tile too soon|Hollow spots from poor coverage', 'Tap-test the tile for hollow spots and check the lippage with a straightedge'),
  T('dr-int-prehung', 'Set the unit plumb and square, shim at the hinges and the strike and nail through the shims|Use 3 in screws in the top hinge to pull the jamb into the stud|Leave about 1/8 in gaps on the sides and the top', 'Install the casing, fill the holes, caulk and paint|Fit the knob and the strike', 'Binding in the opening because the jamb is bowed', 'Check the door stays open and closed at any angle and latches without rubbing'),
  T('dr-lockset', 'Check the backset (2-3/8 or 2-3/4 in) and the door thickness|Align the latch and the strike so the bolt throws fully', 'Adjust the strike and fill the old screw holes', 'Stripped screws or a latch that does not reach the strike', 'Test with the door open and closed and with the key from outside'),
  T('wn-replace', 'Measure the opening in three places and order 1/4 to 1/2 in smaller|Set the window on a sill pan or flashing, shim and keep it plumb|Foam the gap with low-expansion foam and flash the exterior', 'Trim the interior, caulk the exterior and paint|Fit the screen and show the customer how the sash tilts', 'Using high-expansion foam that bows the frame|Missing the sill flashing', 'Open and close the sash and hose-test the exterior'),
  T('pt-walls', 'Use a quality 3/8 in nap roller and cut in with an angled brush, then roll two coats|Maintain a wet edge and work from top to bottom|Prime the patches and any stains', 'Pull the tape at the right time and touch up|Replace the plates', 'Skipping primer on patches (flashing)', 'Check in raking light for missed spots'),
  T('tr-base', 'Nail into the studs and the bottom plate with 15 or 16 gauge nails|Cope inside corners, miter outside corners and keep long runs in one piece where possible', 'Caulk the top edge, fill the nail holes and paint|Fit the shoe or quarter round', 'Short pieces and gaps from out-of-square corners', 'Run a hand along the joints for gaps'),
  T('as-tv', 'Find the studs and use the lag screws into the studs, spaced to the mount|Check the weight and the VESA pattern|Run the cable through an in-wall rated pass-through or conduit and keep power and low-voltage separate', 'Tidy the cables and fit the plates|Show the customer how to tilt and remove it', 'Mounting into drywall only', 'Pull test the mount and check it is level'),
  T('as-grab', 'The bar must be fastened into blocking or a stud and hold 250 lb|Mount it 33 to 36 in above the floor and 1-1/2 in off the wall|Seal the escutcheon with silicone in wet areas', 'Seal the flange with silicone', 'Fastening only into tile or drywall', 'Pull and push on it with body weight'),
  T('dk-new', 'Use a ledger flashed and lag-screwed to the rim joist, never nailed|Set the joists 16 in on center, add blocking and use the hangers with the right nails|Keep the guard at 36 in with balusters under 4 in apart and railings that resist 200 lb', 'Seal the cut ends, stain after the wood dries and add the stair rails', 'Nailing the ledger without flashing', 'Check the level, hanger nails, ledger bolts and the rail strength'),
  T('fn-new', 'Set posts at least 1/3 of their length (minimum 30 in) below grade and brace them plumb|Space posts 6 to 8 ft apart and keep the rails level', 'Seal the cut ends and finish the fence', 'Setting posts shallow so they lean', 'Check the posts for plumb and the gate for a smooth swing'),
  T('kt-cabinets', 'Find the highest point on the floor and mark the level lines|Screw the wall cabinets into the studs with 2-1/2 in screws and clamp them to line up the faces|Start with the corner cabinet and work out', 'Fit the toe-kick, scribe molding and filler strips and adjust the doors', 'Not shimming so the doors rack', 'Check each cabinet is plumb, level and square before the countertop'),
  T('kt-dishwasher', 'Use a high loop in the drain hose or an air gap and a new supply line|Level the machine and anchor it to the underside of the counter|Use a dedicated GFCI-protected circuit', 'Fit the toe-kick and clean out the debris', 'Kinking the drain hose or the supply line', 'Run a full cycle and check the leaks beneath'),
  T('sm-thermostat', 'Confirm the C wire or add the power extender and label every wire before you disconnect|Turn off the power at the furnace breaker', 'Set up the schedule and the app', 'Wiring without labeling', 'Test heat, cool and fan from the thermostat'),
  T('ex-gutter-replace', 'Slope the gutters 1/16 in per foot to the downspout and use hangers about every 24 in|Use end caps and sealant at every joint and the downspout outlets', 'Seal the seams and install the splash blocks', 'Pitch toward the wrong end', 'Run the hose and check the slope, leaks and flow')
]);

const BATH_DETAILS = {
  'Protect, set up and dust control': d('Move the valuables and the items out of the bathroom and the adjacent hallway|Photograph the room, the shut-off valves and the path|Confirm parking, a dumpster location and the work hours', 'Zip walls and a negative-air fan exhausting out a window|Protect floors with rosin paper or Ram Board all the way from the door|Cover the vents and the return air and seal the doorway', 'Label the breakers and the shut-offs', 'Check the protection daily and replace the sticky mats', 'Skipping the dust control on older homes', 'Photograph the protection before demolition begins'),
  'Lead and asbestos testing (lab turnaround)': d('Wet-wipe the sample area and wear a P100 respirator|Use a clean knife and a bag for each sample and label it', 'Send to an accredited lab and keep the results with the job file', 'Check the results before the demolition and follow the RRP rules if they are positive', 'Seal the sample areas with tape', 'Disturbing the material before the results', 'Keep the lab report in the job file'),
  'Demolition and haul-away': d('Shut off and cap the water and power|Cover the drains and the floor drains|Check for hidden wiring and pipes', 'Cut the caulk lines first, then pull, to protect the wall behind|Break the tub, tile and vanity into pieces you can carry|Keep a shop vacuum running near the work', 'Pull the nails and the screws from the framing and scrape the thinset|Photograph the exposed conditions', 'Bag as you go, carry out the debris and vacuum with a HEPA filter at the end of each day', 'Cutting into a pipe or wire|Dropping heavy items on the stairs', 'Check the subfloor and the framing for damage and moisture'),
  'Demolition to the studs and subfloor': d('De-energize the circuits|Cap the water lines|Seal the room and run the negative-air fan', 'Cut the drywall in manageable pieces and remove the insulation separately|Pull the nails and the screws from the studs|Check the studs and the joists for rot and mold', 'Photograph everything for change orders|Document any hidden wiring or damage', 'HEPA-vacuum the cavity and the floor and carry the debris out the same day', 'Cutting into a live wire or a pipe|Missing hidden rot', 'Moisture-meter the wood and have the inspector check the unknowns'),
  'Framing, blocking and subfloor repairs': d('Check the stud spacing and the plumb|Mark the locations for the blocking before drywall', 'Sister any damaged joists with 2x lumber, glued and screwed|Block for grab bars, the vanity, towel bars and the valve|Glue and screw 3/4 in plywood to the joists, staggering seams', 'Sweep the sawdust and the debris and mark the blocking on the wall', 'Vacuum the cuts and haul away the scrap', 'Forgetting the blocking for grab bars', 'Check the plumb and the flatness with a straightedge'),
  'Plumbing and electrical rough-in (licensed trades)': d('Mark the center lines and the heights for the fixtures|Check the venting and the slope before the pipes are fixed', 'Slope the drains 1/4 in per foot and use the right vent size|Run the circuits to code with GFCI protection and a dedicated 20 A bath receptacle circuit|Nail plates protect pipes and wires within 1-1/4 in of the face of the stud', 'Pressure-test the supply and the drains and take photos of every run', 'Sweep the drill chips and the wire trimmings and bag the debris', 'Cutting studs too deep|Wires pinched by the plates', 'Pressure test before the walls are closed and hold the inspection'),
  'Rough-in inspection': d('Leave everything uncovered and the test gauges visible|Have the permit card and drawings on site', 'The inspector checks the framing, the plumbing, the venting, the wiring and the boxes', 'Fix any correction notices and re-schedule', 'Keep the area clear and the lights on', 'Closing the walls before the sign-off', 'Get the sign-off before closing the walls'),
  'Insulation and drywall hanging': d('Check that the rough-in has passed|Mark the stud lines and the box locations', 'Fill cavities without compressing the insulation and cut it around boxes|Hang the moisture-resistant board with screws every 12 in on ceilings and 16 in on walls|Use cement board, not drywall, in the shower', 'Caulk the penetrations and the edges and cover the open boxes', 'Collect the scrap and vacuum the dust', 'Screws that break the paper|Seams that fall at the door corners', 'Check the flatness and the seams with a straightedge'),
  'Tape, mud and sand (dry time between coats)': d('Cover the floors and the fixtures and keep the dust control on|Check the drywall for loose screws', 'Embed the tape and apply three thin coats, 24 hours apart, feathering wider each time|Use a vacuum sander to keep the dust down', 'Prime with a PVA or drywall primer and check in raking light', 'Wash the tools and wipe or HEPA-vacuum all the dust before painting', 'Thick coats that crack|Painting over dusty surfaces', 'Hold a light flat to the wall to find the ridges'),
  'Backer and waterproofing': d('Check the framing is plumb and the pan area flat|Pre-fit the cement board and the membrane band', 'Slope the pan 1/4 in per foot to the drain and keep the curb sloped to the inside|Fasten the cement board every 8 in with corrosion-resistant screws, tape the seams with mesh and thinset|Apply the membrane to the manufacturer thickness and overlap the seams, corners, niche and the curb', 'Flood-test for 24 hours and take photos of the level marks', 'Scrape the thinset drips and vacuum the dust before the membrane', 'Pinholes and thin spots in the membrane|Missing the corners and the drain flange', 'Flood test the pan and check it does not drop'),
  'Waterproofing cure and flood test': d('Plug the drain with a test plug|Mark the water level', 'Cure for the time on the label', 'Record the start and end levels', 'Remove the plug and dry the pan', 'Tiling before the cure', 'The level holds for 24 hours'),
  'Tile setting and grout': d('Dry-lay the pattern from the center lines and plan the cuts so no sliver is under half a tile|Mark the fixtures and the niche on the layout', 'Comb thinset in one direction, back-butter large tiles and keep 95 percent coverage in showers|Keep 1/8 in grout joints or as the maker recommends and use leveling clips on large tile|Leave movement joints at the corners and edges and fill them with silicone, not grout', 'Grout after 24 hours, clean the haze within the hour, seal the grout and caulk the corners|Install the trim and the thresholds', 'Wash the buckets and the sponges outside, never down a drain, and vacuum the dust|Wipe the haze off the tile', 'Grouting too early|Hollow spots from low coverage|Using grout instead of silicone at the corners', 'Check the lippage and the slope and tap for hollow spots'),
  'Prime and paint': d('Fill the holes, sand the surfaces and caulk the joints|Mask the fixtures, the floor and the trim', 'Prime new drywall and stains, then two coats of bathroom paint with a wet edge|Paint the ceiling first, then the walls and trim', 'Pull the tape while the paint is tacky and touch up|Reinstall the plates and the hardware', 'Wash the brushes and fold the drop cloths and wipe the spatter', 'Painting before the dust is gone|Skipping the primer on new board', 'Look in raking light for the missed spots and drips'),
  'Fixtures, vanity, toilet, electrical trim-out': d('Unbox and check every fixture for damage and parts|Turn off the breaker for the electrical trim', 'Set the vanity level and fasten it to the blocking|Set the toilet on a new wax ring and bolts, trim the bolts and caulk the base|Install the receptacles, the fan and the lights and test the GFCIs', 'Caulk the vanity, the top and the backsplash and wipe the fixtures', 'Flatten the boxes and carry out the packaging and the old parts', 'Overtightening the porcelain|Pinching the supplies behind the vanity', 'Run every fixture for an hour, test the GFCIs and the fan and check for leaks'),
  'Glass install (ordered after tile, 7 to 14 day lead time)': d('Measure after the tile is set and the walls are plumb|Confirm the hardware finish and the swing', 'Set the channel or the hardware level and plumb, set the glass on the setting blocks and use the silicone sealant on the outside edges', 'Apply the clear silicone and leave 24 hours before use', 'Wipe the glass and remove the suction cup marks and the packaging', 'Measuring before the tile is finished', 'Open and close the door and check the gap and the seal'),
  'Punch list, final clean and walk-through': d('Walk the job with a checklist and the blue tape', 'Touch up the paint, caulk and grout and fix any items that do not match the spec|Check each fixture, door, drawer, GFCI and fan', 'Remove protection and HEPA-vacuum, then wipe all the surfaces and the glass|Hand over the spare tile and paint, the warranty and the care sheet', 'Take away the tools, the trash and the dumpster', 'Rushing the clean-up and leaving dust', 'Customer walk-through and sign-off with photos')
};

const merge = (...parts) => {
  const out = { prep: [], specs: [], finish: [], cleanup: [], mistakes: [], verify: [] };
  for (const p of parts) if (p) for (const k of Object.keys(out)) for (const x of p[k] || []) if (!out[k].includes(x)) out[k].push(x);
  return out;
};

const detailsForTask = task => merge(CODE_DETAILS[task.code], CATEGORY_DETAILS[task.category]);
const detailsForPhase = phase => merge(BATH_DETAILS[phase]);

module.exports = { CLOSEOUT, OVERHEAD, PHASE_OVERHEAD, OVERHEAD_PARTS, CATEGORY_DETAILS, CODE_DETAILS, BATH_DETAILS, taskHours, phaseTotal, phaseShare, detailsForTask, detailsForPhase };
