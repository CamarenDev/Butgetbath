'use strict';
// Search-focused page content. Cost ranges are planning ranges, not quotes; verify them against current local pricing (see ONLINE-VERIFICATION-TODO.md).

const costGuides = [
  {
    slug: 'bathroom-remodel-cost-illinois', title: 'How Much Does a Bathroom Remodel Cost in Illinois?', h1: 'Bathroom remodel cost in Illinois',
    desc: 'What a bathroom remodel typically costs in northern Illinois, what drives the price up or down, and how to get an accurate written estimate.',
    lead: 'Most homeowners want one number. The honest answer is a range, and where you land in it depends on size, materials and what is behind the walls.',
    ranges: [['Refresh (fixtures, paint, vanity, lighting)', '$6,000 to $15,000'], ['Mid-range remodel (new tile, tub or shower, vanity, floor)', '$15,000 to $35,000'], ['Full custom or primary suite (layout changes, custom tile, glass)', '$35,000 and up']],
    drivers: ['Bathroom size and how much tile is installed', 'Moving plumbing, a drain or the toilet', 'Shower type: tub surround, walk-in, curbless or custom tile', 'Fixture and tile quality', 'Hidden water damage, old plumbing or electrical updates', 'Permits and inspections required by your town', 'Condo and high-rise rules for elevators and work hours'],
    faqs: [['Why is there such a wide range?', 'Two bathrooms of the same size can differ by tens of thousands of dollars depending on tile, fixtures, plumbing changes and what we find when the walls are opened.'], ['Is the estimate free?', 'Yes. The in-home estimate is free and comes with no obligation.'], ['Do I get the price in writing?', 'Yes. You get a written scope and schedule before any work begins.']]
  },
  {
    slug: 'tub-to-shower-conversion-cost', title: 'Tub-to-Shower Conversion Cost in Illinois', h1: 'Tub-to-shower conversion cost',
    desc: 'What a tub-to-shower conversion costs in northern Illinois, what changes the price, and what the project involves from demolition to final seal.',
    lead: 'Swapping a tub for a walk-in or low-threshold shower is one of the most requested updates, especially for safety and easier cleaning.',
    ranges: [['Prefabricated shower insert', '$4,000 to $9,000'], ['Tiled shower with new valve and glass', '$9,000 to $20,000'], ['Curbless or fully custom tiled shower', '$18,000 and up']],
    drivers: ['Insert versus custom tile', 'Whether the drain location moves', 'Waterproofing method and wall condition', 'Glass: frameless, semi-frameless or curtain', 'Niches, benches and grab bars', 'Subfloor repairs'],
    faqs: [['How long does a conversion take?', 'A straightforward conversion often takes about a week of working days; custom tile and waterproofing can take longer.'], ['Can you convert a tub in a condo?', 'Usually yes. We plan around building rules, work hours and any elevator reservations.'], ['Will I still have a tub?', 'If it is your only bathtub, think about resale before removing it. We will talk through your options at the estimate.']]
  },
  {
    slug: 'tile-installation-cost', title: 'Bathroom Tile Installation Cost in Illinois', h1: 'Bathroom tile installation cost',
    desc: 'What affects the cost of installing bathroom floor and shower tile in northern Illinois: tile size, pattern, prep work and waterproofing.',
    lead: 'Tile cost is more than the tile. Labor, preparation and waterproofing often matter as much as the material you pick.',
    ranges: [['Floor tile, standard layout', 'Priced per square foot, plus prep'], ['Shower walls and floor', 'Priced per project, including waterproofing'], ['Large-format, pattern or mosaic work', 'More labor per square foot']],
    drivers: ['Tile size and material', 'Pattern such as herringbone or stacked', 'Floor flatness and the need for leveling', 'Waterproofing system in wet areas', 'Heated floors', 'Removal of old tile and underlayment'],
    faqs: [['Can you tile over existing tile?', 'Sometimes on floors, but we inspect first. Showers are usually best rebuilt for a reliable waterproof result.'], ['Do you level uneven floors?', 'Yes. Leveling and subfloor repair are part of a good tile job and are written into the estimate.'], ['How long should tile last?', 'Properly installed tile can last decades. The waterproofing underneath is what protects it.']]
  },
  {
    slug: 'walk-in-shower-cost', title: 'Walk-In Shower Cost in Illinois', h1: 'Walk-in shower cost',
    desc: 'Planning a walk-in shower in northern Illinois? See what drives the cost, from curbless design to glass and tile, and how to plan it.',
    lead: 'A walk-in shower gives you a cleaner look and easier access. Cost depends on how much of the bathroom has to change.',
    ranges: [['Standard walk-in with a low curb', '$9,000 to $20,000'], ['Curbless with linear drain', '$15,000 to $30,000'], ['Large custom shower with bench and niches', '$25,000 and up']],
    drivers: ['Curbless design needs a recessed floor', 'Drain type and slope', 'Glass thickness and hardware', 'Tile quantity and detail', 'Steam, body sprays or a rain head', 'Existing floor framing'],
    faqs: [['Can any bathroom get a curbless shower?', 'It depends on the floor framing and drain. We check the structure at the estimate.'], ['Is a walk-in shower good for aging in place?', 'Yes. Low thresholds, grab bar blocking and a bench make it easier and safer to use.'], ['Will the glass leak?', 'Properly designed glass and a sloped floor keep water in. We explain the design in your written scope.']]
  }
];

const checklist = {
  slug: 'bathroom-remodel-checklist', title: 'Free Bathroom Remodel Checklist', h1: 'Free bathroom remodel checklist',
  desc: 'A printable checklist for planning a bathroom remodel: goals, budget, layout, materials, permits and questions to ask your contractor.',
  lead: 'Use this to get clear on what you want before your free estimate. Print it or save it on your phone.',
  groups: [
    ['Goals and budget', ['Write down what bothers you most about the bathroom today', 'Decide must-haves versus nice-to-haves', 'Set a comfortable budget and a buffer for surprises', 'Note any accessibility or safety needs']],
    ['Layout and fixtures', ['Measure the room, door swing and ceiling height', 'Decide whether the tub, shower or toilet will move', 'Pick vanity size and storage needs', 'Choose lighting, a fan and outlets']],
    ['Materials', ['Choose floor and wall tile and check slip resistance', 'Pick fixture finishes so they match', 'Decide on glass, curtain or a tub surround', 'Order long-lead items early']],
    ['Before work starts', ['Ask whether permits are required in your town', 'Confirm the written scope, schedule and payment terms', 'Plan a second bathroom or a way to wash while work is underway', 'Condo or high-rise: ask your building about rules and elevator reservations']],
    ['Questions for any contractor', ['Is the estimate in writing?', 'Who will be working in my home?', 'What happens if you find hidden damage?', 'How do you protect the rest of my home?']]
  ]
};

const processSteps = [
  ['Book a free visit', 'Tell us about your project and choose a day that works. It takes about a minute.'],
  ['We visit and measure', 'We look at your space, listen to your goals and talk through your options and budget.'],
  ['You get a written plan', 'You receive a written scope and schedule before any work begins.'],
  ['We do the work', 'Our crew protects your home, keeps the site clean and keeps you informed.'],
  ['Final walkthrough', 'We walk the finished bathroom with you and make sure you are happy.']
];

module.exports = { costGuides, checklist, processSteps };
