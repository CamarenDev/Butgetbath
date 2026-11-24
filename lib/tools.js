'use strict';
// Tools and supplies the crew needs on a bathroom job. The list is built from what the estimate includes, so a gut remodel
// shows demolition and rough-in tools while a toilet-and-vanity swap does not. Admin can regenerate it any time.
// Entries are [name, group, triggers (any tag), qty, source, note]. Source: own = company tool, rent = reserve a rental,
// ppe = safety gear, supply = small consumables to pack.

const T = (name, group, tags, qty = 1, src = 'own', note = '') => ({ name, group, tags, qty, src, note });

const CATALOG = [
  // Safety and site protection
  T('Safety glasses', 'Safety & site protection', ['always'], 1, 'ppe', 'One per person.'),
  T('Work gloves and cut-resistant gloves', 'Safety & site protection', ['always'], 1, 'ppe'),
  T('Knee pads', 'Safety & site protection', ['always'], 1, 'ppe'),
  T('Hearing protection', 'Safety & site protection', ['demo', 'tile', 'drywall', 'subfloor'], 1, 'ppe'),
  T('N95 or P100 respirator', 'Safety & site protection', ['demo', 'tile', 'drywall', 'paint'], 1, 'ppe', 'Cutting tile, sanding and demolition create silica and drywall dust.'),
  T('Half-face respirator with P100 filters', 'Safety & site protection', ['lead', 'asbestos', 'gut'], 1, 'ppe', 'Required for lead-safe (RRP) work.'),
  T('Disposable coveralls and shoe covers', 'Safety & site protection', ['lead', 'asbestos'], 2, 'ppe'),
  T('First aid kit and fire extinguisher', 'Safety & site protection', ['always'], 1, 'own'),
  T('GFCI extension cord and power strip', 'Safety & site protection', ['always'], 2, 'own', 'Use GFCI protection on every cord in a wet area.'),
  T('Work lights and cord reel', 'Safety & site protection', ['always'], 2, 'own'),
  T('Floor protection (Ram Board or builder paper) and tape', 'Safety & site protection', ['always'], 1, 'supply'),
  T('Zip-wall dust barrier poles and plastic sheeting', 'Safety & site protection', ['demo', 'drywall'], 1, 'supply'),
  T('HEPA shop vacuum', 'Safety & site protection', ['demo', 'drywall', 'tile', 'lead'], 1, 'own'),
  T('HEPA air scrubber', 'Safety & site protection', ['lead', 'asbestos', 'gut'], 1, 'rent'),
  T('Lead test swabs and asbestos sample kit', 'Safety & site protection', ['lead', 'asbestos'], 1, 'supply', 'Home built before 1978 or 1980.'),
  T('Contractor trash bags and tarps', 'Safety & site protection', ['always'], 1, 'supply'),
  T('Dumpster permit or street-parking paperwork', 'Safety & site protection', ['demo'], 1, 'supply'),
  T('Stair runners and corner guards', 'Safety & site protection', ['upper'], 1, 'supply', 'Upper-floor job: protect the path from door to bathroom.'),
  T('Appliance dolly or hand truck', 'Safety & site protection', ['upper', 'vanity', 'toilet', 'tub'], 1, 'rent'),
  T('Portable toilet or temporary toilet plan', 'Safety & site protection', ['singleBath'], 1, 'rent'),

  // Layout and measuring
  T('Tape measure (25 ft)', 'Layout & measuring', ['always'], 2),
  T('4 ft level and 2 ft level', 'Layout & measuring', ['always'], 1),
  T('Torpedo level', 'Layout & measuring', ['plumbing', 'vanity', 'electrical'], 1),
  T('Speed square and framing square', 'Layout & measuring', ['always'], 1),
  T('Chalk line and pencils', 'Layout & measuring', ['always'], 1),
  T('Laser level (self-leveling)', 'Layout & measuring', ['tile', 'vanity', 'drywall'], 1, 'rent'),
  T('Stud finder', 'Layout & measuring', ['vanity', 'accessories', 'drywall', 'electrical'], 1),
  T('Moisture meter', 'Layout & measuring', ['subfloor', 'framing', 'wet'], 1),
  T('Marker and layout pencils', 'Layout & measuring', ['always'], 1),

  // General hand tools
  T('Hammer (20 oz) and dead-blow hammer', 'General hand tools', ['always'], 1),
  T('Cordless drill/driver with bit set', 'General hand tools', ['always'], 2),
  T('Impact driver', 'General hand tools', ['always'], 1),
  T('Spare batteries and chargers', 'General hand tools', ['always'], 1),
  T('Utility knife with extra blades', 'General hand tools', ['always'], 2),
  T('Screwdriver set and nut drivers', 'General hand tools', ['always'], 1),
  T('Adjustable wrenches and channel-lock pliers', 'General hand tools', ['plumbing', 'vanity', 'toilet', 'accessories'], 1),
  T('Caulk gun', 'General hand tools', ['always'], 2),
  T('Putty knives (1.5 in and 3 in)', 'General hand tools', ['always'], 1),
  T('Stepladder (6 ft)', 'General hand tools', ['always'], 1),
  T('Tool bucket and contractor bags', 'General hand tools', ['always'], 1),
  T('Ladder (24 ft extension)', 'General hand tools', ['window', 'ceiling'], 1, 'rent'),
  T('Scaffold or staging', 'General hand tools', ['highCeiling'], 1, 'rent'),

  // Demolition
  T('Flat bar and wonder bar', 'Demolition', ['demo'], 1),
  T('Reciprocating saw with demolition blades', 'Demolition', ['demo', 'gut'], 1),
  T('Sledgehammer (3 to 8 lb)', 'Demolition', ['demo'], 1),
  T('Demolition hammer or rotary hammer with chisel bits', 'Demolition', ['floortile', 'demo'], 1, 'rent', 'For mortar beds and tile removal.'),
  T('Stand-up floor scraper', 'Demolition', ['demo', 'lvp', 'vinyl'], 1, 'rent'),
  T('Oscillating multi-tool', 'Demolition', ['demo', 'trim', 'door', 'window'], 1),
  T('Drywall saw and jab saw', 'Demolition', ['demo', 'drywall'], 1),
  T('Tub cutting tools: reciprocating saw and diamond blade', 'Demolition', ['tub'], 1),
  T('Shop vac with extra bags', 'Demolition', ['demo'], 1),
  T('Wheelbarrow or debris cart', 'Demolition', ['gut'], 1),
  T('Contractor-grade debris bags', 'Demolition', ['demo'], 1, 'supply'),

  // Framing and subfloor
  T('Circular saw with extra blades', 'Framing & subfloor', ['framing', 'subfloor', 'gut', 'door'], 1),
  T('Framing nailer or framing hammer and nails', 'Framing & subfloor', ['framing', 'gut', 'door'], 1),
  T('Compound miter saw', 'Framing & subfloor', ['trim', 'framing', 'door', 'gut'], 1),
  T('Sawhorses', 'Framing & subfloor', ['framing', 'subfloor', 'trim', 'door'], 2),
  T('Wood screws, framing nails and construction adhesive', 'Framing & subfloor', ['framing', 'subfloor'], 1, 'supply'),
  T('Floor leveling compound mixing paddle and gauge rake', 'Framing & subfloor', ['leveler'], 1),
  T('Concrete floor grinder', 'Framing & subfloor', ['leveler'], 1, 'rent'),
  T('Dehumidifier and air movers', 'Framing & subfloor', ['basement', 'poorCondition'], 1, 'rent'),
  T('Insulation knife and staple gun', 'Framing & subfloor', ['insulation'], 1),
  T('Door jamb and header lumber with shims', 'Framing & subfloor', ['door'], 1, 'supply'),

  // Drywall and ceiling
  T('Drywall T-square and rasp', 'Drywall & ceiling', ['drywall', 'ceiling', 'gut'], 1),
  T('Drywall screw gun or collated screw attachment', 'Drywall & ceiling', ['drywall', 'ceiling', 'gut'], 1),
  T('Taping knives (6, 10 and 12 in)', 'Drywall & ceiling', ['drywall', 'ceiling', 'gut'], 1),
  T('Mud pan and mixing paddle', 'Drywall & ceiling', ['drywall', 'ceiling', 'gut'], 1),
  T('Pole sander and sanding screens', 'Drywall & ceiling', ['drywall', 'ceiling', 'gut'], 1),
  T('Drywall panel lift', 'Drywall & ceiling', ['ceiling'], 1, 'rent'),
  T('Joint compound, tape, corner bead and screws', 'Drywall & ceiling', ['drywall', 'ceiling', 'gut'], 1, 'supply'),

  // Plumbing
  T('Basin wrench', 'Plumbing', ['vanity', 'plumbing'], 1),
  T('Pipe wrenches (10 and 14 in)', 'Plumbing', ['plumbing'], 1),
  T('Tubing cutter and PEX cutter', 'Plumbing', ['plumbingChanges', 'repipe', 'gut'], 1),
  T('PEX crimp or expansion tool with rings', 'Plumbing', ['plumbingChanges', 'repipe', 'gut'], 1),
  T('Propane torch, solder, flux and heat shield', 'Plumbing', ['repipe', 'plumbingChanges', 'gut'], 1, 'own', 'For copper. Keep a fire extinguisher and fire blanket on site.'),
  T('Hacksaw and PVC cutter', 'Plumbing', ['plumbingChanges', 'drain', 'gut'], 1),
  T('Cast iron snap cutter and no-hub clamps', 'Plumbing', ['castIron'], 1, 'own'),
  T('Closet auger and plunger', 'Plumbing', ['toilet', 'plumbing'], 1),
  T('Drain snake (50 ft)', 'Plumbing', ['castIron', 'drain', 'repipe'], 1, 'rent'),
  T('Water pressure test gauge and test caps', 'Plumbing', ['plumbingChanges', 'repipe', 'gut'], 1),
  T('Shower valve rough-in depth gauge or plaster guard', 'Plumbing', ['showerValve'], 1),
  T('Pipe thread tape, pipe dope and plumber putty', 'Plumbing', ['plumbing'], 1, 'supply'),
  T('Wax ring or wax-free ring, closet bolts and shims', 'Plumbing', ['toilet'], 1, 'supply'),
  T('Supply lines, angle stops and P-trap kit', 'Plumbing', ['vanity', 'toilet', 'plumbing'], 1, 'supply'),
  T('Bucket, rags and wet vac for water cleanup', 'Plumbing', ['plumbing'], 1),
  T('Flange repair rings and extension kit', 'Plumbing', ['toilet'], 1, 'supply'),
  T('Sump or ejector pump install kit', 'Plumbing', ['ejector'], 1, 'supply'),
  T('Tub drain wrench and drain test plug', 'Plumbing', ['tub'], 1),

  // Electrical
  T('Non-contact voltage tester and multimeter', 'Electrical', ['electrical', 'fan', 'lighting', 'plumbing'], 1),
  T('Wire strippers, cutters and lineman pliers', 'Electrical', ['electrical', 'fan', 'lighting'], 1),
  T('Fish tape and drill bits for wire runs', 'Electrical', ['electrical', 'fan', 'gut'], 1),
  T('Hole saw set and spade bits', 'Electrical', ['electrical', 'recessed', 'plumbing', 'fan'], 1),
  T('Wire nuts, electrical tape, boxes and cable staples', 'Electrical', ['electrical', 'fan', 'lighting'], 1, 'supply'),
  T('Circuit tracer and outlet tester', 'Electrical', ['electrical', 'gfci'], 1),
  T('Lockout/tagout device for the panel', 'Electrical', ['electrical', 'fan', 'lighting'], 1),
  T('Fan duct, vent hood, clamps and foil tape', 'Electrical', ['fan'], 1, 'supply', 'Vent to the exterior, never into the attic.'),
  T('Recessed light cutter or drywall hole saw', 'Electrical', ['recessed'], 1),
  T('Smoke and CO detector, test with the alarm button', 'Electrical', ['smoke'], 1, 'supply'),

  // Backer, waterproofing and tile
  T('Cement board scoring knife and carbide-tipped blade', 'Tile & waterproofing', ['wet'], 1),
  T('Cement board screws and alkali-resistant mesh tape', 'Tile & waterproofing', ['wet'], 1, 'supply'),
  T('Waterproofing membrane, paint-on roller and seam sealer', 'Tile & waterproofing', ['wet'], 1, 'supply'),
  T('Shower pan liner or foam pan, preslope mix and mixing tub', 'Tile & waterproofing', ['wet'], 1),
  T('Flood test plug and marker', 'Tile & waterproofing', ['wet'], 1, 'own', 'Hold water 24 hours before tiling.'),
  T('Notched trowels (1/4 in, 1/2 in and 3/16 in V-notch)', 'Tile & waterproofing', ['tile'], 1),
  T('Wet tile saw with diamond blade', 'Tile & waterproofing', ['tile'], 1, 'rent'),
  T('Hand tile cutter and tile nippers', 'Tile & waterproofing', ['tile'], 1),
  T('Angle grinder with diamond blade and cup wheel', 'Tile & waterproofing', ['tile', 'glass'], 1),
  T('Diamond hole saw bits for plumbing penetrations', 'Tile & waterproofing', ['tile', 'wet'], 1),
  T('Tile spacers and leveling clips and wedges', 'Tile & waterproofing', ['tile'], 1, 'supply'),
  T('Mixing drill with paddle and mortar buckets', 'Tile & waterproofing', ['tile', 'leveler', 'drywall'], 1, 'rent'),
  T('Rubber mallet and beating block', 'Tile & waterproofing', ['tile'], 1),
  T('Grout float, sponges and grout bucket', 'Tile & waterproofing', ['tile'], 1),
  T('Grout and thinset, sanded or unsanded as specified', 'Tile & waterproofing', ['tile'], 1, 'supply'),
  T('Epoxy grout mixing kit and gloves', 'Tile & waterproofing', ['epoxy'], 1, 'supply'),
  T('Tile edge trim and Schluter profiles with a hacksaw', 'Tile & waterproofing', ['tile'], 1, 'supply'),
  T('Silicone sealant for corners and changes of plane', 'Tile & waterproofing', ['tile', 'wet', 'glass'], 1, 'supply'),
  T('Tile sealer and applicator', 'Tile & waterproofing', ['tile'], 1, 'supply'),
  T('Pattern layout template and string line', 'Tile & waterproofing', ['patterned'], 1),
  T('Radiant floor mat, thermostat and ohm meter', 'Tile & waterproofing', ['heated'], 1, 'own', 'Test resistance before, during and after tiling.'),
  T('Linear drain slope gauge and level', 'Tile & waterproofing', ['curbless'], 1),

  // Flooring (non-tile)
  T('LVP tapping block, pull bar and spacers', 'Flooring', ['lvp'], 1),
  T('Vinyl roller and sheet vinyl seam tools', 'Flooring', ['vinyl'], 1),
  T('Underlayment, transition strips and floor adhesive', 'Flooring', ['lvp', 'vinyl'], 1, 'supply'),
  T('Jamb saw or oscillating tool for undercutting door casing', 'Flooring', ['lvp', 'vinyl', 'floortile'], 1),

  // Fixtures and vanity
  T('Toilet jack or two-person lift', 'Fixtures & vanity', ['toilet', 'vanity'], 1),
  T('Silicone caulk, mildew-resistant', 'Fixtures & vanity', ['vanity', 'tub', 'wet', 'toilet'], 2, 'supply'),
  T('Shims, cabinet screws and a scribe', 'Fixtures & vanity', ['vanity'], 1, 'supply'),
  T('Faucet install kit and silicone', 'Fixtures & vanity', ['vanity'], 1, 'supply'),
  T('Drill bit set for stone or porcelain tops', 'Fixtures & vanity', ['vanity'], 1),
  T('Mirror hanging hardware, French cleat and mirror adhesive', 'Fixtures & vanity', ['accessories', 'smartMirror'], 1, 'supply'),
  T('Toilet paper holder, towel bars and accessory anchors', 'Fixtures & vanity', ['accessories'], 1, 'supply'),
  T('Blocking and heavy-duty anchors for grab bars', 'Fixtures & vanity', ['grabBars'], 1, 'supply', 'Grab bars must be anchored into blocking, not drywall alone.'),
  T('Hand shower, rain head and body spray trim kit', 'Fixtures & vanity', ['showerValve'], 1, 'supply'),
  T('Towel warmer wiring kit and wall bracket set', 'Fixtures & vanity', ['towelWarmer'], 1, 'supply'),
  T('Glass suction cups and moving straps', 'Fixtures & vanity', ['glass'], 2, 'own', 'Frameless glass is heavy and needs two or more people.'),
  T('Glass setting blocks, clamps and drill templates', 'Fixtures & vanity', ['glass'], 1),
  T('Door slab, hinges, hinge mortise kit and router', 'Fixtures & vanity', ['door'], 1),
  T('Window flashing tape and shims', 'Fixtures & vanity', ['window'], 1, 'supply'),
  T('Wall-mount shelf anchors and a stud finder', 'Fixtures & vanity', ['shelves', 'linen'], 1, 'supply'),

  // Finish, trim and paint
  T('Finish nailer and compressor, or cordless brad nailer', 'Finish, trim & paint', ['trim', 'door', 'wainscot'], 1),
  T('Coping saw and miter box', 'Finish, trim & paint', ['trim'], 1),
  T('Caulk, wood filler and sandpaper', 'Finish, trim & paint', ['trim', 'paint'], 1, 'supply'),
  T('Painter tape and drop cloths', 'Finish, trim & paint', ['paint'], 1, 'supply'),
  T('Brushes, roller frames, covers and extension pole', 'Finish, trim & paint', ['paint'], 1),
  T('Paint tray, 5 gallon buckets and paint can opener', 'Finish, trim & paint', ['paint'], 1),
  T('Primer, mildew-resistant bath paint and tinted ceiling paint', 'Finish, trim & paint', ['paint'], 1, 'supply'),
  T('Wallpaper smoother, seam roller and sharp snap blades', 'Finish, trim & paint', ['wallpaper'], 1),
  T('Wainscot panels, adhesive and trim', 'Finish, trim & paint', ['wainscot'], 1, 'supply'),
  T('Microfiber cloths, glass cleaner and final-clean supplies', 'Finish, trim & paint', ['always'], 1, 'supply'),

  // Whole-house handyman work
  T('Stud finder and painter pole', 'Handyman: general', ['shelves', 'tvmount', 'assembly', 'grabBars', 'cabinet', 'paint'], 1),
  T('Wall anchors, toggle bolts and assorted screws', 'Handyman: general', ['shelves', 'tvmount', 'assembly', 'grabBars', 'cabinet'], 1, 'supply'),
  T('Cable raceway and pass-through plates', 'Handyman: general', ['tvmount'], 1, 'supply'),
  T('Furniture assembly tools: Allen keys, rubber mallet, ratcheting screwdriver', 'Handyman: general', ['assembly'], 1),
  T('Appliance dolly, furniture sliders and moving straps', 'Handyman: general', ['dolly', 'appliance', 'cabinet', 'counter'], 1),
  T('Dishwasher and washer supply lines, clamps and dryer vent hose', 'Handyman: general', ['appliance'], 1, 'supply'),
  T('Pocket hole jig and clamps', 'Handyman: general', ['cabinet', 'shelves', 'framing', 'counter'], 1),
  T('Countertop clamps, jigsaw and silicone', 'Handyman: general', ['counter'], 1),
  T('Garage door safety sensor aligner and 6 ft stepladder', 'Handyman: general', ['garage'], 1),
  T('Smart device setup: phone, wifi password and tester', 'Handyman: general', ['smart'], 1),
  T('Carpet knife, power stretcher and knee kicker', 'Flooring', ['carpet'], 1, 'rent'),
  T('Floor sander and edger with sandpaper', 'Flooring', ['hardwood'], 1, 'rent', 'Rent a drum sander and an edger. Bring dust bags.'),
  T('Wood stain, polyurethane and applicators', 'Flooring', ['hardwood'], 1, 'supply'),
  T('Pry bar, flooring pull bar and heat gun', 'Flooring', ['hardwood', 'demo'], 1),
  T('Extension ladder (24 ft) and ladder stabilizer', 'Exterior & outdoors', ['ladder'], 1, 'rent', 'Inspect ladders and set on level ground. Use a spotter.'),
  T('Roofing harness, rope, hook and shingle remover', 'Exterior & outdoors', ['roof'], 1, 'ppe', 'Fall protection is required on roofs.'),
  T('Roofing nails, flashing, sealant and shingle patch kit', 'Exterior & outdoors', ['roof'], 1, 'supply'),
  T('Gutter scoop, hose and downspout fittings', 'Exterior & outdoors', ['gutter'], 1),
  T('Pressure washer with surface cleaner and nozzles', 'Exterior & outdoors', ['pressureWash'], 1, 'rent'),
  T('Siding removal tool, trim nails and caulk', 'Exterior & outdoors', ['siding'], 1),
  T('Post hole digger or auger, level and post line', 'Exterior & outdoors', ['fence', 'deck'], 1, 'rent'),
  T('Concrete mixer, trowels, float and mix', 'Exterior & outdoors', ['concrete'], 1, 'rent'),
  T('Deck screws, joist hangers and flashing tape', 'Exterior & outdoors', ['deck'], 1, 'supply'),
  T('Fence panels, gate hardware and string line', 'Exterior & outdoors', ['fence'], 1, 'supply'),
  T('Exterior paint sprayer or brushes and drop cloths', 'Exterior & outdoors', ['exterior', 'paint'], 1),
  T('Dryer vent brush kit and foil tape', 'Exterior & outdoors', ['exterior'], 1, 'supply'),
  T('Blown insulation machine and wind baffles', 'Exterior & outdoors', ['attic'], 1, 'rent'),
  T('Garage door torsion spring winding bars (licensed use only)', 'Exterior & outdoors', ['garage'], 1, 'own', 'Do not wind a spring unless trained.'),
  T('HVAC filter sizes, vacuum and coil brush', 'Safety, HVAC & seasonal', ['hvac'], 1, 'supply'),
  T('Water heater flush hose, anode rod wrench and heat shield', 'Safety, HVAC & seasonal', ['heater'], 1),
  T('Water heater dolly, flex connectors and expansion tank', 'Safety, HVAC & seasonal', ['heater'], 1, 'supply'),
  T('Smoke and CO alarm kit with batteries', 'Safety, HVAC & seasonal', ['smoke'], 1, 'supply'),
  T('Caulk, foam sealant and weatherstripping assortment', 'Safety, HVAC & seasonal', ['exterior', 'window', 'door'], 1, 'supply'),
  T('Wallpaper steamer and scoring tool', 'Finish, trim & paint', ['wallpaper'], 1, 'rent'),
  T('Cabinet hinges, drawer slides and a Forstner bit', 'Handyman: general', ['cabinet'], 1),
  T('Texture sprayer or hopper gun and compound', 'Drywall & ceiling', ['drywall'], 1, 'rent'),

  // Closeout
  T('Punch list sheet and painter tape for marking', 'Closeout', ['always'], 1, 'supply'),
  T('Camera or phone for before, progress and after photos', 'Closeout', ['always'], 1, 'own'),
  T('Warranty cards, manuals and care instructions to leave with the customer', 'Closeout', ['always'], 1, 'supply'),
  T('Permit card, inspection sticker and inspector contact', 'Closeout', ['permit'], 1, 'supply')
];

// Reads the plan config (what the estimator decided to include) and returns the tags that switch tools on.
function tagsOf(c) {
  if (c.kind === 'handyman') return new Set(['always', ...c.tags, ...(c.permit ? ['permit'] : []), ...(c.leadSafe ? ['lead'] : []), ...(c.asbestosTest ? ['asbestos'] : []), ...(c.tags.includes('demo') || c.tags.includes('drywall') || c.tags.includes('door') ? ['demo'] : [])]);
  const tags = new Set(['always']);
  const on = (tag, cond) => { if (cond) tags.add(tag); };
  const wet = c.shower && c.shower !== 'none';
  on('demo', c.demo); on('gut', c.gut); on('lead', c.leadSafe); on('asbestos', c.asbestosTest);
  on('upper', c.level === 'upper'); on('basement', c.level === 'basement'); on('poorCondition', c.condition === 'poor');
  on('highCeiling', c.ceiling > 9);
  on('floortile', c.flooring === 'tile'); on('lvp', c.flooring === 'lvp'); on('vinyl', c.flooring === 'vinyl');
  on('wet', wet && c.showerStyle === 'tile');
  on('tile', c.flooring === 'tile' || (wet && c.showerStyle === 'tile'));
  on('patterned', c.tilePattern !== 'standard'); on('epoxy', c.epoxy);
  on('heated', c.heatedFloor); on('curbless', c.curbless);
  on('tub', c.newTub || c.oldTub || c.shower === 'tub_surround'); on('showerValve', wet);
  on('toilet', c.toilet && c.toilet !== 'keep'); on('vanity', c.vanities > 0);
  on('plumbingChanges', c.plumbingChanges); on('repipe', c.oldPlumbing); on('castIron', c.castIron); on('drain', c.drainRelocate); on('ejector', c.ejector);
  on('plumbing', c.plumbingChanges || c.oldPlumbing || c.castIron || c.drainRelocate || c.gut || (c.toilet && c.toilet !== 'keep') || c.vanities > 0 || wet);
  on('electrical', c.electricalChanges || c.gut || c.gfci > 0 || c.panelUpgrade || c.switches > 0);
  on('fan', c.fan || c.fanHeater); on('lighting', c.lighting || c.recessed > 0 || c.showerLight); on('recessed', c.recessed > 0); on('gfci', c.gfci > 0); on('smoke', c.smoke);
  on('drywall', c.drywall || c.ceilingWork === 'replace' || c.ceilingWork === 'patch'); on('ceiling', c.ceilingWork === 'replace');
  on('framing', c.framing || c.subfloor || c.gut || c.doorWiden); on('subfloor', c.subfloor); on('leveler', c.leveler); on('insulation', c.insulation);
  on('glass', ['slider', 'frameless', 'panel'].includes(c.glassType));
  on('door', c.doorNew || c.pocketDoor || c.doorWiden); on('window', c.window || c.windowWrap);
  on('paint', c.paint || c.gut); on('trim', c.trim || c.gut); on('wallpaper', c.wallpaperSf > 0); on('wainscot', c.wainscotSf > 0);
  on('accessories', c.accessories || c.smartMirror || c.medicineRecess); on('smartMirror', c.smartMirror); on('grabBars', c.grabBars > 0);
  on('towelWarmer', c.towelWarmer); on('shelves', c.shelves); on('linen', c.linen);
  on('permit', c.permit); on('singleBath', c.singleBath);
  return tags;
}

// Fallback for estimates that were typed in by hand: read the line item sections and names.
function tagsFromItems(items) {
  const text = items.map(i => `${i.section} ${i.name}`.toLowerCase()).join(' | ');
  const has = re => re.test(text);
  const tags = new Set(['always', 'permit']);
  const on = (tag, cond) => { if (cond) tags.add(tag); };
  on('demo', has(/demo|remov|haul/)); on('tile', has(/tile|grout/)); on('floortile', has(/floor tile|flooring/)); on('wet', has(/waterproof|backer|shower/));
  on('toilet', has(/toilet/)); on('vanity', has(/vanity|faucet/)); on('tub', has(/\btub\b/)); on('showerValve', has(/shower|valve/));
  on('plumbing', has(/plumb|toilet|vanity|faucet|valve|drain/)); on('plumbingChanges', has(/rough|relocat|repipe/)); on('electrical', has(/electric|gfci|wiring/));
  on('fan', has(/\bfan\b|exhaust/)); on('lighting', has(/light/)); on('drywall', has(/drywall/)); on('paint', has(/paint/)); on('trim', has(/trim|baseboard|casing/));
  on('glass', has(/glass|shower door/)); on('framing', has(/fram|subfloor|blocking/)); on('subfloor', has(/subfloor/)); on('lvp', has(/\blvp\b|vinyl plank/));
  on('lead', has(/lead-safe|lead safe|rrp/)); on('asbestos', has(/asbestos/)); on('heated', has(/heated floor|radiant/)); on('door', has(/\bdoor\b/) && !has(/shower door/));
  on('window', has(/window/)); on('accessories', has(/accessor|mirror|towel/)); on('grabBars', has(/grab bar/)); on('gut', has(/to the studs|gut/)); on('upper', has(/stairs/));
  return tags;
}

function checklist(tags) {
  const seen = new Set(), out = [];
  for (const t of CATALOG) {
    if (!t.tags.some(tag => tags.has(tag)) || seen.has(t.name)) continue;
    seen.add(t.name);
    out.push({ ...t, tags: undefined });
  }
  return out;
}

const SOURCE_LABELS = { own: 'Company tool', rent: 'Rental: reserve ahead', ppe: 'Safety gear', supply: 'Pack supplies' };

module.exports = { CATALOG, SOURCE_LABELS, tagsOf, tagsFromItems, checklist };
