'use strict';
// Process playbook: the step-by-step method, tools and supplies for each job, with times taken from the labor-time
// schedule. Bathroom remodels follow a fixed trade sequence; every handyman task has its own procedure (custom tasks
// added by the admin fall back to a category procedure, so no job is ever left without a method).

const { CUSHION } = require('./labor-times');
const details = require('./install-details');
const roles = require('./crew-roles');

const B = (phase, title, steps, tools, supplies, o = {}) => ({ phase, title, steps, tools, supplies, ...o });
const BATH_STEPS = [
  B('Protect, set up and dust control', 'Protect the home and set up the work area',
    ['Walk the job with the customer and photograph existing conditions, shut-off locations and the path from the door to the bathroom.', 'Shut off water to the bathroom at the angle stops (or main) and confirm the electrical circuits are labeled.', 'Lay floor protection from the entry to the work area, cover vents and doorways with zip walls and set up a dust-control fan with a window or HEPA exhaust.', 'Stage tools, a dumpster or bags, and a clean dry spot for materials.'],
    ['Zip-wall poles', 'Utility knife', 'Shop vacuum with HEPA filter', 'Box fan and window panel', 'Moving dolly', 'Camera or phone', 'Non-contact voltage tester'],
    ['Ram Board or rosin paper', 'Painter tape', '6 mil plastic sheeting', 'Zip-wall zipper doors', 'Contractor trash bags', 'Furnace filter or HEPA fan filter', 'Drop cloths'], { sections: ['Tool rental'] }),
  B('Lead and asbestos testing (lab turnaround)', 'Test for lead paint and asbestos (pre-1978 and pre-1981 homes)',
    ['Collect paint chips, flooring, plaster and joint-compound samples with the area wet-wiped first.', 'Send the samples to an accredited lab and wait for results before any demolition.', 'If positive, follow lead-safe (RRP) practices or hire an abatement contractor.'],
    ['Sample bags and labels', 'Spray bottle', 'Scraper', 'N95 or P100 respirator'], ['Lab fees', 'Disposable gloves', 'Plastic sheeting']),
  B('Demolition and haul-away', 'Demolish the old bathroom',
    ['Disconnect and remove the toilet, vanity, accessories, mirror and light fixtures; cap supplies and cover the drain.', 'Cut the caulk and remove the tub or shower base and surround, or cut it into pieces for carry-out.', 'Remove tile and flooring with a hammer and chisel or an oscillating tool, scrape the thinset and check the subfloor.', 'Bag debris as you go and carry it to the dumpster, then vacuum the room.'],
    ['Pry bar and flat bar', 'Hammer and cold chisel', 'Oscillating multi-tool', 'Reciprocating saw', 'Floor scraper', 'Contractor wheelbarrow', 'Safety glasses, gloves and respirator'], ['Contractor trash bags', 'Dumpster or haul-away service', 'Drain stopper or rag', 'Plumbing caps'], { sections: ['Demolition'] }),
  B('Demolition to the studs and subfloor', 'Gut the bathroom to the studs and subfloor',
    ['Remove fixtures, shut off and cap plumbing, and de-energize circuits before touching walls.', 'Cut the drywall or plaster at the studs, pull the lath and insulation and bag it as you go.', 'Remove ceiling material, then flooring and underlayment down to the subfloor; pull nails and screws.', 'Inspect studs, joists and the subfloor for rot, mold or old wiring; photograph findings for change orders.', 'Haul debris away and HEPA-vacuum the cavity.'],
    ['Demolition hammer or sledge', 'Pry bars', 'Reciprocating saw', 'Oscillating tool', 'Shop vacuum with HEPA filter', 'Moisture meter', 'Respirator and eye protection'], ['Contractor bags', 'Dumpster', '6 mil plastic', 'Plumbing caps', 'Wire nuts and tape'], { sections: ['Demolition'] }),
  B('Framing, blocking and subfloor repairs', 'Repair framing, add blocking and replace the subfloor',
    ['Sister or replace damaged joists and studs and straighten walls that are out of plane.', 'Add blocking for grab bars, vanity, TV, towel bars and the shower valve and niche.', 'Replace damaged subfloor with 3/4 in plywood, glued and screwed, and level any low spots.'],
    ['Circular saw', 'Drill and impact driver', 'Framing hammer', 'Level and square', 'Tape measure', 'Speed square'], ['2x4 and 2x6 lumber', '3/4 in plywood subfloor', 'Construction adhesive', 'Structural screws and framing nails', 'Shims'], { sections: ['Framing & backer'] }),
  B('Plumbing and electrical rough-in (licensed trades)', 'Rough in plumbing and electrical',
    ['Plumber sets the shower or tub valve, relocates or ties in drains and vents, runs supply lines and pressure-tests.', 'Electrician runs new circuits (GFCI-protected receptacles, lighting, fan) and boxes to code and sets the fan duct.', 'Photograph every pipe and wire run before the walls close.'],
    ['Pipe cutter and PEX crimp or press tool', 'Torch or press tool', 'Pressure test gauge', 'Wire stripper and fish tape', 'Multimeter', 'Drill and hole saw'], ['PEX or copper supply pipe and fittings', 'PVC or ABS drain pipe and fittings', 'Shower valve rough body', '12/2 and 14/2 cable', 'Electrical boxes', 'Bath fan duct and wall cap', 'Pipe straps and nail plates'], { sections: ['Plumbing', 'Electrical'] }),
  B('Rough-in inspection', 'Rough-in inspection',
    ['Schedule the building, plumbing and electrical inspections with the city.', 'Leave pipes, wires and framing exposed and the pressure test in place until the inspector signs off.'], ['Permit card and drawings'], ['Permit fees'], { sections: ['Permits'] }),
  B('Insulation and drywall hanging', 'Insulate and hang drywall or cement board',
    ['Install insulation and a vapor barrier where code calls for it and seal the penetrations.', 'Hang moisture-resistant drywall on walls and ceiling, staggering seams and screwing every 8 in.', 'Cut openings for boxes, the fan, the niche and the valve.'],
    ['Drywall lift or T-square', 'Drywall screw gun', 'Utility knife and rasp', 'Drywall saw', 'Tape measure'], ['1/2 in moisture-resistant drywall', '1-1/4 in drywall screws', 'R-13 batt insulation', 'Acoustic caulk'], { sections: ['Framing & backer'] }),
  B('Tape, mud and sand (dry time between coats)', 'Tape, mud and sand the drywall',
    ['Embed paper or mesh tape in the first coat of compound and fill the screw heads.', 'Apply the second and third coats after each dries (about 24 hours per coat), feathering the edges wider each time.', 'Sand smooth, prime and check under a work light.'],
    ['Taping knives (6, 10 and 12 in)', 'Mud pan', 'Pole sander and sanding sponges', 'Work light', 'Dust mask'], ['All-purpose or lightweight joint compound', 'Paper or mesh drywall tape', 'Corner bead', 'Sanding sponges and 120 grit paper', 'Primer'], { sections: ['Framing & backer'] }),
  B('Backer and waterproofing', 'Install cement board and waterproofing',
    ['Fasten cement board or foam board to the studs with corrosion-resistant screws and tape the seams.', 'Build the shower pan: sloped mortar bed or foam tray, curb or curbless entry, bench and niche.', 'Apply the membrane (liquid or sheet) to the walls, pan, curb, niche and corners with band reinforcement.', 'Flood test the pan for 24 hours before tile.'],
    ['Drill and cement-board screw gun', 'Notched trowels', 'Paint roller and brush', 'Utility knife and score tool', 'Level and straightedge', 'Drain test plug'], ['Cement board or foam board', 'Cement-board screws and seam tape', 'Waterproofing membrane (liquid or sheet)', 'Membrane band and corners', 'Thinset', 'Shower drain assembly', 'Pre-slope mortar or foam tray'], { sections: ['Waterproofing', 'Framing & backer'] }),
  B('Waterproofing cure and flood test', 'Cure the waterproofing and flood test',
    ['Let the membrane cure to the manufacturer time and plug the drain.', 'Fill the pan to 1 in, mark the level and confirm it holds for 24 hours.'], ['Drain test plug', 'Waterproof marker'], ['Water'], {}),
  B('Tile setting and grout', 'Lay out, set and grout tile',
    ['Dry-lay and snap layout lines so cuts are balanced and fixtures land on grout lines.', 'Set floor and wall tile in thinset with the right trowel, back-buttering large-format tile and keeping joints even.', 'Cut around valves, niche and drains with a wet saw or grinder; install trim and edge profiles.', 'After 24 hours, grout, clean the haze, seal natural stone and caulk the corners and changes of plane with silicone.'],
    ['Wet saw', 'Notched trowels', 'Tile spacers or leveling system', 'Rubber grout float', 'Sponges and buckets', 'Level and straightedge', 'Angle grinder and diamond blade', 'Tile nippers'], ['Tile and mosaic', 'Modified thinset', 'Grout (sanded or epoxy)', 'Tile edge trim', 'Silicone caulk', 'Grout sealer', 'Spacers'], { sections: ['Tile', 'Flooring'] }),
  B('Prime and paint', 'Prime and paint',
    ['Patch, sand and caulk, then mask fixtures, floors and trim.', 'Prime new drywall and stains, then roll two coats on the ceiling and walls with a mildew-resistant bathroom paint.', 'Paint trim and the door and remove the tape while the paint is slightly tacky.'],
    ['Roller frame and covers', 'Brushes', 'Extension pole', 'Painter tape', 'Caulk gun', 'Putty knife'], ['Primer', 'Bathroom (mildew-resistant) paint', 'Painter tape', 'Caulk and spackle', 'Drop cloths'], { sections: ['Finish'] }),
  B('Fixtures, vanity, toilet, electrical trim-out', 'Set fixtures and finish the trim-out',
    ['Set the vanity and top, hook up the faucet and drain, and check for leaks.', 'Set the toilet on a new wax or rubber gasket and flange bolts, level it and connect the supply.', 'Install shower trim, grab bars, accessories, mirror and medicine cabinet; the electrician sets devices, fixtures and the fan and tests the GFCIs.', 'Turn water on, run every fixture and check for leaks for at least an hour.'],
    ['Basin wrench', 'Adjustable wrenches', 'Level', 'Drill and driver', 'Voltage tester', 'Stud finder', 'Plumber tape'], ['Vanity, top and faucet', 'Toilet, wax ring or gasket and bolts', 'Supply lines and angle stops', 'Shower trim kit', 'Grab bars and accessories', 'Receptacles, switches, fan and light fixtures', 'Silicone and plumber putty'], { sections: ['Fixtures', 'Plumbing', 'Electrical', 'Doors, windows & storage'] }),
  B('Glass install (ordered after tile, 7 to 14 day lead time)', 'Measure and install the glass enclosure',
    ['Template and order after the tile is set and grouted; allow 7 to 14 days.', 'Install the channel or hardware, set the glass and seal with silicone.'], ['Drill with glass and tile bits', 'Suction cups', 'Level', 'Caulk gun'], ['Glass enclosure kit', 'Silicone', 'Shims and setting blocks']),
  B('Punch list, final clean and walk-through', 'Punch list, clean up and customer walk-through',
    ['Touch up paint and caulk, check every fixture, door, GFCI and fan, and fix anything out of spec.', 'Remove protection, HEPA-vacuum and wipe all surfaces and clean the glass.', 'Walk the customer through operation, care for tile and grout, and warranty and sign-off.'],
    ['Shop vacuum', 'Microfiber cloths', 'Razor scraper', 'Touch-up brushes'], ['Cleaner', 'Touch-up paint', 'Caulk', 'Care and warranty sheet'], { sections: ['Finish'] })
];

// code: 'steps | steps', 'tools, tools', 'supplies, supplies'
const T = {};
const P = (code, steps, tools, supplies) => { T[code] = { steps: steps.split('|').map(s => s.trim()), tools: tools.split(',').map(s => s.trim()), supplies: supplies.split(',').map(s => s.trim()) }; };
P('dw-patch-small', 'Scrape loose paint and set protruding nail pops|Fill holes with setting compound and let it dry|Sand smooth and spot-prime', 'Putty knife, Sanding block, Drill', 'Spackle, Primer, Sandpaper');
P('dw-patch-large', 'Cut a clean square around the damage to the studs|Screw a backer in place and fit a drywall patch|Tape and apply three coats of compound, then sand and prime', 'Drywall saw, Taping knives, Drill', 'Drywall piece, Backer strips, Joint tape and compound');
P('dw-water-patch', 'Find and stop the moisture source first|Cut out the wet drywall and check the framing and insulation|Hang a new piece, tape, finish and prime', 'Moisture meter, Drywall saw, Taping knives', 'Moisture-resistant drywall, Joint compound, Mold cleaner');
P('dw-hang-finish', 'Hang the sheets with staggered seams|Tape and apply three coats of compound with drying between|Sand and prime', 'Drywall lift, Screw gun, Taping knives, Pole sander', 'Drywall, Screws, Tape, Joint compound');
P('dw-ceiling', 'Mark the joists and hang the ceiling with a lift or props|Tape and finish in three coats|Sand and prime', 'Drywall lift, Screw gun, Taping knives', 'Drywall, Screws, Tape, Joint compound');
P('dw-texture', 'Mask the work area|Mix and spray or hand-apply the texture to match the existing pattern|Let it dry and prime', 'Hopper gun, Knockdown knife', 'Texture mix, Plastic sheeting, Primer');
P('dw-popcorn', 'Test for asbestos in pre-1981 homes|Cover floors and walls, wet the ceiling and scrape|Skim coat and sand smooth, then prime', 'Ceiling scraper, Garden sprayer, Pole sander', 'Plastic sheeting, Joint compound, Primer');
P('dw-plaster', 'Test for lead if the paint is old|Clean out loose plaster and fix lath with screws and washers|Fill with patching plaster or compound in layers and sand', 'Utility knife, Taping knives, Drill', 'Plaster patch, Fiberglass mesh, Primer');
P('dw-wallpaper-remove', 'Score the paper and soak with remover|Scrape, wash off the paste and let the wall dry|Prime and fix any wall damage', 'Scoring tool, Scraper, Sprayer', 'Remover solution, Primer, Spackle');
P('dw-wallpaper-hang', 'Prime and plan the seam layout|Paste and book each strip, trim and smooth|Wipe the seams and trim at the edges', 'Smoothing brush, Razor knife, Level', 'Wallpaper, Paste, Primer');
P('tr-base', 'Locate studs and measure each wall|Cut square and coped corners on a miter saw|Nail with a finish nailer, fill the holes and caulk the top', 'Miter saw, Finish nailer, Stud finder', 'Baseboard, Finish nails, Caulk, Wood filler');
P('tr-crown', 'Mark the ceiling and wall lines and layout the corners|Cut coped and mitered pieces on the saw with the crown upside down|Nail, fill and caulk', 'Miter saw, Finish nailer, Coping saw', 'Crown molding, Finish nails, Caulk');
P('tr-door-casing', 'Mark a 3/16 in reveal on the jamb|Cut the miters and nail the casing set|Fill and caulk', 'Miter saw, Finish nailer, Combination square', 'Casing set, Finish nails, Caulk');
P('tr-window-casing', 'Mark the reveal and cut the stool, apron and side casing|Nail the pieces and set the stool|Fill, sand and caulk', 'Miter saw, Finish nailer, Level', 'Window trim kit, Finish nails, Caulk');
P('tr-wainscot', 'Snap a level line and find the studs|Cut and nail the panels or boards and rails|Cap, fill, caulk and paint', 'Miter saw, Finish nailer, Level', 'Panels or boards, Cap rail, Construction adhesive, Caulk');
P('tr-repair', 'Remove the damaged piece without hurting the wall|Cut and fit the replacement or fill the damage|Nail, fill and paint', 'Pry bar, Miter saw, Finish nailer', 'Matching trim, Wood filler, Paint');
P('tr-shelf', 'Find the studs and mark a level line|Drill pilot holes and mount the bracket or cleat|Set the shelf and check the load', 'Stud finder, Level, Drill', 'Shelf, Brackets, Screws and anchors');
P('tr-closet', 'Plan the heights and mark studs|Mount the cleat and rod brackets and set the shelves|Check for level and load', 'Level, Drill, Saw', 'Shelf boards, Rod and brackets, Screws');
P('tr-pantry', 'Measure and cut the boards and cleats|Screw the cleats into studs and fit the shelves|Finish the edges and paint', 'Circular saw, Drill, Level', 'Plywood or boards, Cleats, Screws, Paint');
P('tr-stair-tread', 'Remove the old tread and check the stringers|Cut the new tread and glue and screw it down|Fill, sand and finish', 'Pry bar, Circular saw, Drill', 'Stair tread, Construction adhesive, Screws, Stain or paint');
P('tr-handrail', 'Mark the rail height and find the studs|Mount the brackets|Cut and fasten the rail and cap the ends', 'Stud finder, Miter saw, Drill', 'Handrail, Brackets, Screws');
P('tr-frame-wall', 'Snap the layout lines on the floor and ceiling|Build the plates and studs and raise the wall|Fasten, plumb and block it', 'Circular saw, Framing nailer, Level', '2x4 lumber, Framing nails, Anchors');
P('tr-blocking', 'Open the wall at the location|Fit 2x blocking between the studs|Screw it in and patch the wall', 'Drywall saw, Drill, Level', '2x lumber, Structural screws, Patch material');
P('tr-subfloor', 'Cut out the damaged area to the joists|Add blocking and glue and screw the new plywood|Level the seams', 'Circular saw, Drill, Pry bar', 'Plywood, Construction adhesive, Screws');
P('dr-int-prehung', 'Remove the old door and trim and check the rough opening|Set the prehung unit plumb and shim it|Nail the casing and install the hardware', 'Level, Miter saw, Finish nailer', 'Prehung door, Shims, Casing, Latch set');
P('dr-ext-prehung', 'Remove the old door and flash the sill|Set the new unit in sealant, plumb and shim it|Fasten, insulate, trim and install the lockset', 'Level, Drill, Pry bar', 'Exterior door unit, Flashing tape, Sealant, Foam, Lockset');
P('dr-slab', 'Remove the old door and trace the hinge and bore locations|Mortise the hinges and bore the lock|Hang the new slab and adjust the gap', 'Router or chisel, Hole saw, Drill', 'Door slab, Hinges, Lockset');
P('dr-adjust', 'Find where it binds and tighten the hinge screws|Shim or plane the door and reset the strike|Test the latch', 'Screwdriver, Plane, Chisel', 'Shims, Longer screws');
P('dr-lockset', 'Remove the old lockset|Fit the new latch and strike|Test the key and latch', 'Screwdriver, Chisel', 'Lockset');
P('dr-deadbolt', 'Check the door bore and backset|Install the bolt and strike|Test and align', 'Hole saw, Drill, Chisel', 'Deadbolt, Strike plate');
P('dr-storm', 'Measure the opening and mount the frame|Hang the door and install the closer|Adjust the swing and seal', 'Drill, Level', 'Storm door, Closer, Sealant');
P('dr-slider', 'Lift the door and clean the track|Replace the rollers or bend the track|Rehang and lubricate', 'Screwdriver, Pliers', 'Rollers, Silicone lubricant');
P('dr-weather', 'Clean the jamb|Cut and fit the weatherstrip and sweep|Adjust and check for daylight', 'Utility knife, Drill', 'Weatherstrip, Door sweep, Screws');
P('dr-garage-opener', 'Mount the rail and motor to the header|Wire the sensors and the wall control|Set travel limits and test the safety reverse', 'Ladder, Drill, Wrenches', 'Opener kit, Lag screws, Wire');
P('dr-garage-fix', 'Inspect the springs, cables and rollers|Replace rollers and tighten the hardware|Lubricate and test the sensors', 'Wrenches, Ladder, Level', 'Rollers, Lubricant');
P('wn-replace', 'Measure the opening and remove the old window|Flash and set the new unit plumb and square|Shim, fasten, insulate and caulk and trim the inside', 'Pry bar, Level, Drill, Caulk gun', 'Window, Shims, Flashing tape, Foam, Caulk');
P('wn-repair', 'Remove the stop and sash|Replace the balances or glazing|Rehang and test', 'Putty knife, Screwdriver', 'Balances, Glazing');
P('wn-screen', 'Measure the frame|Cut the new screen and roll it in the spline|Trim and reinstall', 'Spline roller, Utility knife', 'Screen mesh, Spline');
P('wn-caulk', 'Remove failed caulk and clean the surface|Backer-rod large gaps|Apply exterior caulk and tool it', 'Caulk gun, Scraper', 'Exterior caulk, Backer rod');
P('fl-lvp', 'Acclimate planks and prep and level the subfloor|Lay the first row with expansion gaps|Click each row in place, cut around obstacles and add the trim', 'Utility knife, Tapping block, Spacers, Saw', 'LVP planks, Underlayment, Trim');
P('fl-laminate', 'Acclimate and lay the underlayment|Click-install the rows with gaps at the walls|Add the transitions and trim', 'Saw, Tapping block, Spacers', 'Laminate, Underlayment, Trim');
P('fl-carpet', 'Remove old carpet and install tack strips|Lay the pad and stretch the carpet|Trim and tuck at the edges', 'Knee kicker, Power stretcher, Trimmer', 'Carpet, Pad, Tack strip, Seam tape');
P('fl-tile', 'Prep and level the floor and snap layout lines|Set the tile in thinset|Grout after 24 hours, clean and seal', 'Wet saw, Notched trowel, Level, Grout float', 'Tile, Thinset, Grout, Spacers, Sealer');
P('fl-hardwood-refinish', 'Fill nail holes and move out the furniture|Sand with three grits and vacuum|Apply stain and 2 to 3 coats of finish with drying time', 'Drum sander, Edger, Shop vacuum', 'Sandpaper, Stain, Polyurethane');
P('fl-hardwood-repair', 'Cut out the damaged boards|Fit and nail in new boards|Sand and finish to match', 'Oscillating tool, Pry bar, Nailer', 'Hardwood boards, Finish nails, Stain');
P('fl-transition', 'Measure the gap|Cut the strip|Fasten with adhesive or screws', 'Saw, Drill', 'Transition strip, Adhesive');
P('fl-squeak', 'Locate the squeak and the joist below|Drive screws through the subfloor or add shims|Fill and touch up', 'Drill, Stud finder', 'Trim screws, Shims, Filler');
P('fl-remove', 'Cut and pull the old flooring in sections|Remove the staples, nails and adhesive|Vacuum and check the subfloor', 'Floor scraper, Pry bar, Shop vacuum', 'Contractor bags, Patch compound');
P('kt-cabinets', 'Find the studs and mark the level lines|Hang the uppers on a ledger and set the bases with shims|Screw the cabinets together and add the filler and toe kick', 'Level, Drill, Stud finder', 'Cabinets, Screws, Shims, Fillers');
P('kt-cab-hardware', 'Mark the hole template|Drill the holes|Install the knobs and pulls', 'Drill, Template, Screwdriver', 'Knobs and pulls');
P('kt-cab-adjust', 'Identify the worn hinge or slide|Remove it and fit the new part|Adjust to align', 'Screwdriver, Drill', 'Hinges, Drawer slides');
P('kt-counter', 'Template and cut the top to size|Seal the cut edges and set the top|Fasten from below, caulk and install the sink', 'Circular saw, Jigsaw, Drill', 'Laminate top, Silicone, Screws');
P('kt-backsplash', 'Clean and mask the wall|Set the tile in mastic or thinset|Grout and caulk the countertop edge', 'Wet saw, Trowel, Grout float', 'Tile, Mastic, Grout, Caulk');
P('kt-dishwasher', 'Shut off the water and power|Connect the water, drain and electric|Level the unit, fasten it and test a cycle', 'Wrenches, Level, Drill', 'Dishwasher, Supply line, Drain hose, Cord kit');
P('kt-range-hood', 'Mark the mounting and the duct path|Install the wiring and duct|Hang the hood and test the fan', 'Drill, Wire stripper, Level', 'Hood, Duct, Wire, Screws');
P('kt-microwave', 'Locate studs and mark the template|Mount the bracket and lift the unit|Connect and test', 'Drill, Stud finder, Level', 'Microwave, Mounting bracket');
P('kt-paint-cab', 'Remove the doors and hardware, degrease and sand|Prime and spray or brush two coats|Reinstall after full cure', 'Sander, Brushes and rollers or sprayer', 'Cleaner, Primer, Cabinet paint');
P('pl-faucet-kitchen', 'Shut off the water and remove the old faucet|Mount the new faucet and sprayer|Connect the supplies and test for leaks', 'Basin wrench, Adjustable wrench', 'Faucet, Supply lines, Plumber putty');
P('pl-faucet-bath', 'Shut off the water and remove the old faucet|Mount the new faucet and pop-up|Connect the supplies and test', 'Basin wrench, Adjustable wrench', 'Faucet, Supply lines');
P('pl-sink', 'Shut off the water and disconnect the drain|Remove the old sink and set the new one|Reconnect, seal and test', 'Wrenches, Basin wrench, Caulk gun', 'Sink, Drain kit, Supply lines, Silicone');
P('pl-toilet', 'Shut off the water, drain the tank and remove the old toilet|Set a new wax ring and flange bolts|Set the toilet, level it and connect the supply', 'Wrench, Level, Putty knife', 'Toilet, Wax ring, Closet bolts, Supply line');
P('pl-toilet-fix', 'Identify the failed part|Replace the fill valve, flapper or handle|Test and adjust the water level', 'Screwdriver, Pliers', 'Fill valve, Flapper, Handle');
P('pl-disposal', 'Cut the power and disconnect the old unit|Mount the new unit and connect the drain|Wire the plug and test', 'Screwdriver, Pliers, Basin wrench', 'Disposal, Mounting kit, Cord');
P('pl-clog', 'Try the plunger and trap first|Auger the line|Flush and test', 'Plunger, Drain auger, Bucket', 'Cleaner, Gloves');
P('pl-leak', 'Shut off the water and find the leak|Replace the fitting or line|Check for leaks under pressure', 'Wrenches, Pipe cutter', 'Fittings, Supply lines, Plumber tape');
P('pl-shutoff', 'Shut off the main and drain the line|Cut and swap the valve|Turn on and check', 'Pipe cutter, Wrenches, Torch or crimp tool', 'Shutoff valve, Compression fittings');
P('pl-hosebib', 'Shut off the water and drain|Remove and replace the hose bib|Seal the wall and test', 'Wrenches, Torch or crimp tool, Drill', 'Hose bib, Caulk, Fittings');
P('pl-showerhead', 'Unscrew the old head|Wrap thread tape and install the new head|Test for leaks', 'Adjustable wrench', 'Showerhead, Plumber tape');
P('pl-tub-caulk', 'Remove the old caulk and clean the joint|Dry fully and tape both sides|Apply silicone and tool it', 'Caulk remover, Caulk gun', 'Silicone, Painter tape, Rubbing alcohol');
P('pl-water-heater', 'Shut off power or gas and water and drain the tank|Disconnect and remove the old tank|Set the new heater, connect the lines and the flue, fill and test', 'Wrenches, Pipe cutter, Hand truck, Torch', 'Water heater, Flex connectors, Fittings, Discharge pipe');
P('pl-sump', 'Dig out the sump pit and set the pump|Connect the check valve and discharge|Wire and test the float', 'Shovel, Pipe cutter, Drill', 'Sump pump, PVC pipe, Check valve');
P('pl-icemaker', 'Shut off the water and drill the path|Run the line to the box|Connect and test', 'Drill, Tubing cutter', 'Water line kit, Saddle or tee valve');
P('pl-softener', 'Locate the bypass and mount the unit|Connect the plumbing and the drain|Program and test', 'Pipe cutter, Wrenches, Torch', 'Softener, Fittings, Salt');
P('el-outlet', 'Cut the power and confirm with a tester|Wire the new receptacle|Secure it, restore power and test', 'Voltage tester, Wire stripper, Screwdriver', 'Receptacle, Wire nuts');
P('el-gfci', 'Cut the power and test|Wire to the LINE terminals and connect the protected outlets to LOAD|Test and reset', 'Voltage tester, Wire stripper', 'GFCI receptacle, Wire nuts');
P('el-switch', 'Cut the power and test|Replace the switch|Test', 'Voltage tester, Screwdriver', 'Switch, Wire nuts');
P('el-dimmer', 'Cut the power and test|Wire the dimmer|Test with the bulb type', 'Voltage tester, Wire stripper', 'Dimmer, Wire nuts');
P('el-fixture', 'Cut the power and remove the old fixture|Mount the new bracket and wire it|Test', 'Voltage tester, Ladder, Wire stripper', 'Fixture, Wire nuts');
P('el-fan', 'Cut the power and confirm the box is fan-rated|Mount the bracket and fan|Wire and balance', 'Voltage tester, Ladder, Wire stripper', 'Ceiling fan, Fan-rated box');
P('el-recessed', 'Cut the power and the ceiling hole|Fish the wire and mount the housing|Trim and test', 'Hole saw, Fish tape, Wire stripper', 'Recessed light, Cable, Wire nuts');
P('el-outdoor', 'Cut the power and mount the weatherproof box|Wire the fixture|Seal and test', 'Voltage tester, Drill, Caulk gun', 'Outdoor fixture, Gasket, Sealant');
P('el-usb', 'Cut the power and test|Wire the new outlet|Test', 'Voltage tester, Screwdriver', 'USB outlet');
P('el-circuit', 'Plan the route and cut the power at the panel|Run the cable and set the box|Connect to the breaker and test', 'Fish tape, Drill, Wire stripper', 'Cable, Breaker, Box, Receptacle');
P('el-panel', 'Schedule the utility disconnect and permit|Swap the panel and rewire the circuits|Inspect and reconnect', 'Voltage tester, Torque screwdriver, Wire cutters', 'Panel, Breakers, Ground bars');
P('el-ev', 'Check the panel load|Run the circuit and mount the charger|Test and inspect', 'Wire stripper, Drill, Torque screwdriver', 'Charger, Cable, Breaker, Receptacle');
P('el-smoke', 'Remove the old unit|Mount and connect the new one|Test', 'Ladder, Screwdriver', 'Detector, Batteries');
P('el-doorbell', 'Cut the power and mount the transformer or battery unit|Mount the button and chime|Test', 'Drill, Voltage tester', 'Doorbell kit, Wire');
P('sm-thermostat', 'Cut the HVAC power|Label and move the wires to the new base|Mount, power up and set up Wi-Fi', 'Screwdriver, Level', 'Thermostat, Wire labels');
P('sm-lock', 'Remove the old lock|Install the smart lock and sensor|Set up the app and codes', 'Screwdriver, Drill', 'Smart lock, Batteries');
P('sm-camera', 'Pick the mounting spot and run power|Mount the camera|Pair and aim', 'Drill, Ladder', 'Camera, Cable, Screws');
P('sm-switch', 'Cut the power and test|Wire the smart switch|Pair and test', 'Voltage tester, Wire stripper', 'Smart switch');
P('sm-wifi', 'Choose the mount point|Run cable and mount the unit|Configure and test', 'Drill, Fish tape, Cable tester', 'Access point, Ethernet cable');
P('ex-gutter-clean', 'Set the ladder and scoop debris|Flush the downspouts|Check the slope and the seams', 'Ladder, Gloves, Hose', 'Bags');
P('ex-gutter-replace', 'Remove the old gutters|Hang new hangers and gutter runs|Seal the seams, add downspouts and test', 'Ladder, Snips, Drill', 'Gutter, Hangers, Sealant, Downspouts');
P('ex-siding', 'Remove the damaged pieces|Cut and fit new siding|Fasten, caulk and paint', 'Pry bar, Saw, Nailer', 'Siding, Nails, Caulk');
P('ex-soffit', 'Remove the damaged section|Fit new soffit or fascia|Fasten, seal and paint', 'Ladder, Saw, Nailer', 'Soffit or fascia, Nails, Paint');
P('ex-roof-leak', 'Find the source from the attic and the roof|Replace flashing or shingles|Seal and check', 'Ladder, Roofing hammer, Pry bar', 'Shingles, Flashing, Roofing cement');
P('ex-shingle', 'Lift the surrounding shingles|Remove the damaged piece|Install new shingles and seal', 'Roofing hammer, Flat bar', 'Shingles, Roofing nails, Sealant');
P('ex-caulk', 'Remove failed caulk|Clean the joint|Apply exterior caulk', 'Caulk gun, Scraper', 'Exterior caulk');
P('ex-pressure-wash', 'Wet and pre-treat the surface|Wash with a wide fan|Rinse', 'Pressure washer', 'Detergent');
P('ex-porch', 'Brace the damaged section|Replace the step, rail or post|Fasten and finish', 'Drill, Saw, Level', 'Lumber, Screws, Stain');
P('ex-dryer-vent', 'Disconnect the old duct|Clean or replace the duct and the cap|Reconnect and test', 'Vent brush, Screwdriver, Foil tape', 'Dryer duct, Vent cap');
P('ex-mailbox', 'Remove the old box|Set the new post or box|Level and secure', 'Post-hole digger, Level, Drill', 'Mailbox, Post, Concrete');
P('ex-downspout-ext', 'Measure the run|Attach the extension|Set the splash block', 'Snips, Drill', 'Extension, Splash block');
P('dk-new', 'Lay out and set the footings|Build the ledger, beams, joists and railings|Install the decking and stairs and finish', 'Level, Saw, Drill, Post-hole digger', 'Lumber, Concrete, Joist hangers, Deck screws, Decking');
P('dk-repair', 'Inspect the framing and decking|Replace the bad boards or joists|Sand and finish', 'Pry bar, Saw, Drill', 'Decking, Lumber, Screws');
P('dk-stain', 'Clean and brighten the wood|Let it dry|Apply the stain or sealer', 'Pressure washer, Roller or brush', 'Cleaner, Stain or sealer');
P('fn-new', 'Mark the line and set the posts|Hang the rails and pickets|Hang the gate and seal', 'Post-hole digger, Level, Nailer', 'Posts, Concrete, Rails, Pickets, Hardware');
P('fn-repair', 'Remove the damaged part|Set a new post or panel|Secure and brace', 'Shovel, Level, Drill', 'Lumber, Concrete, Screws');
P('cn-patch', 'Clean and widen the crack|Apply the bonding agent|Fill with patching mix and finish', 'Chisel, Trowel, Wire brush', 'Concrete patch, Bonding agent');
P('cn-pad', 'Excavate and form the pad|Pour and screed the concrete|Float, finish and cure', 'Shovel, Screed, Float, Edger', 'Concrete, Gravel, Rebar or mesh, Form lumber');
P('pt-walls', 'Move or cover the furniture and floors|Patch and sand then prime|Cut in and roll two coats', 'Roller, Brushes, Ladder', 'Paint, Primer, Tape, Drop cloths');
P('pt-ceiling', 'Cover the room and prime stains|Cut in the edges|Roll the coats', 'Roller, Extension pole, Brush', 'Ceiling paint, Primer, Tape');
P('pt-trim', 'Sand, caulk and prime|Paint the first coat|Sand lightly and paint the second', 'Brushes, Sandpaper, Caulk gun', 'Trim paint, Caulk, Tape');
P('pt-door', 'Remove the hardware and sand|Prime|Paint both sides in two coats', 'Brush, Mini roller, Sandpaper', 'Primer, Paint, Tape');
P('pt-exterior', 'Wash and scrape|Prime bare wood and caulk|Paint two coats', 'Pressure washer, Scraper, Ladder, Sprayer or brushes', 'Exterior paint, Primer, Caulk');
P('pt-stain', 'Sand and clean the wood|Apply the stain|Seal with varnish', 'Brushes, Sandpaper, Rags', 'Stain, Varnish');
P('pt-closet', 'Clear the area and patch|Prime|Paint the walls and trim', 'Roller, Brush', 'Paint, Primer, Tape');
P('as-tv', 'Find the studs and mark the height|Mount the bracket and TV|Run the cables in the wall or a raceway', 'Stud finder, Level, Drill', 'TV mount, Cable kit');
P('as-furniture', 'Lay out the parts and read the instructions|Assemble|Check the stability and anchor it', 'Drill, Screwdriver', 'Furniture kit');
P('as-curtain', 'Mark the bracket locations and find the studs|Install the brackets or anchors|Hang the rod and blinds', 'Level, Drill', 'Rod, Brackets, Anchors');
P('as-mirror', 'Find the studs and mark the height|Set the proper anchors|Hang and level', 'Level, Drill, Stud finder', 'Hangers, Anchors');
P('as-pictures', 'Lay out the arrangement|Mark and drive the hangers|Hang and level', 'Level, Hammer', 'Picture hangers');
P('as-grab', 'Locate the blocking or add it|Drill pilot holes|Mount the bar and test the load', 'Drill, Stud finder, Level', 'Grab bar, Screws');
P('as-garage', 'Mark the studs and layout|Mount the brackets or tracks|Hang the shelving', 'Drill, Level, Stud finder', 'Shelving, Lag screws');
P('as-childproof', 'Walk the home to find the hazards|Install the gates, latches and anchors|Test', 'Drill, Screwdriver', 'Gates, Latches, Anchors, Outlet covers');
P('as-appliance-move', 'Shut off the utilities|Disconnect and move the appliance with a dolly|Set it, connect and test', 'Hand truck, Wrenches, Level', 'Hoses, Vent, Cord');
P('sf-filter', 'Locate the filter and note the size|Replace the filter|Check the system and the drain', 'Flashlight', 'Filters');
P('sf-heater-flush', 'Turn off the power and the water|Drain through a hose|Flush the sediment and refill', 'Garden hose, Screwdriver', 'Hose');
P('sf-winterize', 'Disconnect and drain the hoses|Insulate the exposed pipes|Seal windows and check for gaps', 'Caulk gun, Scissors', 'Pipe insulation, Caulk, Faucet covers');
P('sf-attic', 'Seal the air leaks and block the vents|Blow in the insulation to the target depth|Mark the depth and check', 'Insulation blower, Respirator', 'Blown insulation, Baffles, Foam');
P('sf-weather', 'Find the leaks with a smoke pencil|Seal and weatherstrip|Retest', 'Caulk gun, Utility knife', 'Weatherstrip, Caulk, Foam gaskets');
P('sf-pest', 'Find the gaps and vents|Seal with steel wool and sealant|Screen the vents', 'Caulk gun, Staple gun', 'Steel wool, Sealant, Screen');
P('sf-co', 'Pick the locations by room|Mount the units|Test each one', 'Drill, Ladder', 'Smoke and CO alarms, Batteries');
P('sf-radon', 'Find the cracks and the rim joist|Clean and seal|Cover with sealant or foam', 'Caulk gun, Wire brush', 'Hydraulic cement, Sealant, Foam');
P('gn-hourly', 'Review the list with the customer|Do the repairs in priority order|Clean up and review the work', 'Hand tools, Drill, Ladder', 'Fasteners, Caulk, Misc hardware');
P('gn-haul', 'Load the debris|Haul to the disposal site|Sweep up', 'Truck, Dolly', 'Bags, Disposal fees');
P('gn-clean', 'Remove debris and protection|Vacuum and wipe all surfaces|Check the work with the customer', 'Vacuum, Mop', 'Cleaner, Microfiber cloths');
P('gn-demo', 'Shut off utilities and check what is behind the wall|Cut and remove the cabinet or wall section|Haul debris away and patch', 'Reciprocating saw, Pry bar, Respirator', 'Bags, Plastic sheeting, Patch material');

// Fallback methods for tasks added by the admin, by category.
const CATEGORY = {
  'Drywall & plaster': 'dw-patch-large', 'Carpentry & trim': 'tr-repair', 'Doors & windows': 'dr-slab', Flooring: 'fl-lvp', Kitchen: 'kt-cab-adjust', Plumbing: 'pl-leak',
  Electrical: 'el-outlet', 'Smart home & security': 'sm-switch', 'Exterior & roofing': 'ex-siding', 'Deck, fence & concrete': 'dk-repair', Painting: 'pt-walls',
  'Assembly & mounting': 'as-mirror', 'Safety, HVAC & seasonal': 'sf-weather', 'General & haul-away': 'gn-hourly'
};
const GENERIC = { steps: ['Review the scope and confirm the materials with the customer.', 'Protect the work area and shut off the affected utilities.', 'Do the work, checking against the plan as you go.', 'Test, clean up and walk the customer through the finished work.'], tools: ['Hand tools', 'Drill and driver', 'Tape measure and level'], supplies: ['Fasteners and sealants'] };

function procedureFor(task) {
  const hit = T[task.code], fall = T[CATEGORY[task.category]];
  const p = hit || fall || GENERIC;
  return { code: task.code, name: task.name, specific: Boolean(hit), steps: p.steps, tools: p.tools, supplies: p.supplies };
}

// Bathroom process aligned with a computed schedule: each step carries its phase time, crew, roles, this job's
// price-book supplies, and the install details and cleanup that go with it.
function bathroomProcess(plan) {
  const byPhase = new Map(plan.schedule.phases.map(p => [p.phase, p]));
  const steps = [];
  for (const s of BATH_STEPS) {
    const phase = byPhase.get(s.phase);
    if (!phase) continue;
    const lines = (s.sections || []).length ? plan.items.filter(i => s.sections.includes(i.section) && i.kind === 'material' && !i.optional).map(i => ({ name: i.name, qty: i.qty, unit: i.unit })).slice(0, 14) : [];
    steps.push({ n: steps.length + 1, title: s.title, phase: s.phase, steps: s.steps, tools: s.tools, supplies: s.supplies, jobSupplies: lines, crew: phase.crew, hours: phase.hours, days: phase.days, start: phase.start, end: phase.end,
      details: details.detailsForPhase(s.phase), overheadHours: Math.round(phase.hours * details.phaseShare(s.phase) * 10) / 10, assignments: roles.bathroomAssignments(phase) });
  }
  return wrap(plan, { steps }, steps, plan.schedule.phases);
}

function handymanProcess(plan, rows, inputs) {
  const picked = new Map((rows || []).map(r => [r.code, r]));
  const steps = [];
  for (const [code, qty] of Object.entries(inputs?.tasks && typeof inputs.tasks === 'object' ? inputs.tasks : {})) {
    const row = picked.get(code);
    if (!row || !(Number(qty) > 0)) continue;
    const h = details.taskHours(row, Number(qty), CUSHION), proc = procedureFor(row);
    steps.push({ n: steps.length + 1, qty: Number(qty), unit: row.unit, hours: h.total, installHours: h.work, overheadHours: h.overhead, trade: row.trade, ...proc, details: details.detailsForTask(row), assignments: roles.handymanAssignment(row, h.total, proc.steps) });
  }
  return wrap(plan, { tasks: steps }, steps, plan.schedule.phases);
}

// Everything that is not a single step: who does what overall, the day-by-day plan, getting there, supplies, debris and cleanup.
function wrap(plan, body, steps, phases) {
  const lg = plan.logistics || { rows: [], notes: [] };
  return {
    cushionPct: CUSHION * 100, totalHours: plan.schedule.hours, totalDays: plan.schedule.days, ...body,
    crew: roles.crewPlan(steps), dayPlan: roles.dayPlan(phases, steps.filter(s => s.phase)),
    logistics: lg.rows, travel: lg.travel ? { oneWayMiles: lg.travel.oneWayMiles, oneWayMinutes: lg.travel.oneWayMinutes, vehicles: lg.travel.vehicles, days: lg.travel.days, toll: lg.travel.toll, driveHours: lg.travel.hours, miles: lg.travel.miles } : null,
    closeout: details.CLOSEOUT, overheadParts: details.OVERHEAD_PARTS, overheadHours: Math.round(steps.reduce((n, s) => n + (s.overheadHours || 0), 0) * 10) / 10
  };
}

module.exports = { BATH_STEPS, PROCEDURES: T, procedureFor, bathroomProcess, handymanProcess };
