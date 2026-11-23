// Site content. Guides and answers are intentionally overviews that point to a call for project specifics.
const services = [
  {
    slug: 'bathroom-remodeling', name: 'Bathroom Remodeling', icon: 'bi-droplet-half',
    short: 'Full and partial bathroom remodels, from refreshed hall baths to primary suites.',
    title: 'Bathroom Remodeling in Kane, Kendall, DuPage & DeKalb Counties, IL',
    desc: 'Bathroom remodeling for Illinois homeowners in Kane, Kendall, DuPage and DeKalb counties. Free estimates from Budget Bath Solutions.',
    intro: 'A bathroom remodel should feel calm from the first conversation to the final walkthrough. We handle layout updates, fixtures, vanities, lighting, tile and finishing so you deal with one team instead of five.',
    points: ['Full gut remodels and targeted refreshes', 'Vanities, toilets, faucets, lighting and mirrors', 'Layout and accessibility-minded updates', 'Clear scope, schedule and written estimate'],
    faqs: [['How long does a bathroom remodel take?', 'It depends on scope, materials and what we find behind the walls. We give you a realistic schedule after seeing your space.'], ['Can I stay in my home during the work?', 'Usually, yes. We plan around your household and talk through temporary bathroom access during your estimate.'], ['What will it cost?', 'Every bathroom is different. A free in-home estimate is the only way to get a number you can trust.']]
  },
  {
    slug: 'tile-installation', name: 'Tile Installation', icon: 'bi-grid-3x3-gap',
    short: 'Floors, showers, tub surrounds, backsplashes and accent walls set with care.',
    title: 'Tile Installation for Bathrooms & Showers in Northern Illinois',
    desc: 'Professional tile installation for bathroom floors, showers and walls in Kane, Kendall, DuPage and DeKalb counties, Illinois.',
    intro: 'Tile is where a bathroom is won or lost. Flat substrates, straight lines, tight grout joints and properly prepared wet areas are what separate a tile job that lasts from one that fails.',
    points: ['Shower walls, floors and niches', 'Tub surrounds and accent walls', 'Large-format, mosaic and patterned tile', 'Backsplashes and entry floors'],
    faqs: [['Can you install tile I bought myself?', 'Often, yes. Call us before you buy so we can talk about suitability and quantities.'], ['Do you do tile repair?', 'Yes. Cracked, loose and failing tile is worth looking at early, especially in wet areas.'], ['What tile is best for a shower?', 'It depends on the layout and how you use the space. We can talk options during your estimate.']]
  },
  {
    slug: 'shower-and-tub-remodeling', name: 'Shower & Tub Remodeling', icon: 'bi-badge-hd',
    short: 'Tub-to-shower conversions, walk-in showers and tub replacements.',
    title: 'Shower & Tub Remodeling | Tub-to-Shower Conversions in Illinois',
    desc: 'Walk-in showers, tub-to-shower conversions and tub replacement for homeowners in Kane, Kendall, DuPage and DeKalb counties, IL.',
    intro: 'Whether you want a spa-like walk-in shower or a safer, easier-to-use bath, we help you choose a design that suits your home and the way you live.',
    points: ['Tub-to-shower conversions', 'Walk-in and curbless-style showers', 'Tub replacement and tub surrounds', 'Glass, niches, benches and grab-bar blocking'],
    faqs: [['Can you convert my tub to a shower?', 'In many homes, yes. The right approach depends on your plumbing, framing and floor plan.'], ['Do you offer accessible showers?', 'We can plan comfort and accessibility features into your design. Ask us during your estimate.']]
  },
  {
    slug: 'basement-and-other-remodeling', name: 'Other Home Remodeling', icon: 'bi-hammer',
    short: 'Kitchens, basements, flooring and more. Ask us about your project.',
    title: 'Home Remodeling & Repairs in Kane, Kendall, DuPage & DeKalb Counties',
    desc: 'Beyond bathrooms: flooring, kitchens, basements and general remodeling and repairs in northern Illinois. Contact Budget Bath Solutions.',
    intro: 'Bathrooms and tile are our specialty, but we also take on other home projects. Tell us what you are planning and we will let you know honestly whether we are the right fit.',
    points: ['Flooring and trim', 'Kitchen and backsplash updates', 'Basement finishing and refreshes', 'General repairs and punch-list work'],
    faqs: [['What other projects do you do?', 'It varies by season and schedule. Send us the details and we will tell you what we can take on.']]
  }
];

const counties = [
  { slug: 'kane-county', name: 'Kane County', cities: ['Aurora', 'Batavia', 'Carpentersville', 'Elgin', 'Geneva', 'North Aurora', 'South Elgin', 'St. Charles', 'Sugar Grove'], blurb: 'From the Fox River towns of Geneva, Batavia and St. Charles to growing communities in Aurora and Elgin, Kane County homes range from historic builds to newer subdivisions, and each calls for a different approach.' },
  { slug: 'kendall-county', name: 'Kendall County', cities: ['Montgomery', 'Oswego', 'Plano', 'Yorkville'], blurb: 'Kendall County has some of the fastest-growing communities in Illinois. Many homes are 10 to 25 years old, which is often the time builder-grade bathrooms start to feel dated.' },
  { slug: 'dupage-county', name: 'DuPage County', cities: ['Carol Stream', 'Downers Grove', 'Elmhurst', 'Glen Ellyn', 'Lisle', 'Lombard', 'Naperville', 'West Chicago', 'Wheaton'], blurb: 'DuPage homes include mid-century ranches, classic brick homes and modern builds. Older bathrooms often hide surprises, so honest, careful planning matters.' },
  { slug: 'dekalb-county', name: 'DeKalb County', cities: ['Cortland', 'DeKalb', 'Genoa', 'Hinckley', 'Sandwich', 'Sycamore'], blurb: 'We help DeKalb County homeowners, from farmhouses to campus-area rentals and new builds, update bathrooms without the runaround.' }
];

const guides = [
  {
    slug: 'bathroom-remodel-planning', title: 'How to Plan a Bathroom Remodel in Northern Illinois', short: 'The decisions to settle before you ever pick up a sledgehammer.', desc: 'A homeowner overview of planning a bathroom remodel: goals, layout, materials, timing and questions to ask a contractor.',
    body: [
      ['Start with how you use the room', 'Make a short list of what bothers you today and what you want tomorrow: storage, a bigger shower, easier cleaning, better lighting. Rank it. A clear list keeps the project focused and the estimate honest.'],
      ['Decide how big a change you want', 'A refresh (new vanity, fixtures, paint and flooring) is a very different project from moving plumbing or changing the layout. Walls, floors and plumbing in older homes can add scope, so build in some flexibility.'],
      ['Pick materials in the right order', 'Tile, tub or shower style and vanity size drive almost everything else. Lead times on some products can run for weeks, so it helps to choose early.'],
      ['Ask the right questions of any contractor', 'Ask what is included, how changes are handled, who is on site day to day, and how the schedule will work in your home. Get it in writing.'],
      ['What we can only tell you in your home', 'Hidden conditions, the realistic timeline and the true cost depend on what is behind your walls. That is why we offer an in-person estimate.']
    ]
  },
  {
    slug: 'choosing-bathroom-tile', title: 'Choosing Bathroom Tile: What Homeowners Should Know', short: 'Look, feel, slip resistance and maintenance, without the guesswork.', desc: 'Tile types, finishes, grout and maintenance considerations for bathroom floors, showers and walls.',
    body: [
      ['Match the tile to the surface', 'Floors, shower walls and shower floors have different needs. Floor tile needs traction, and wet areas need a plan for water. Not every tile that looks good in a showroom belongs everywhere.'],
      ['Size changes how a room feels', 'Larger tiles mean fewer grout lines and a cleaner look. Smaller tiles can be easier to slope and shape. Patterns can make a small room feel intentional or busy.'],
      ['Do not forget grout and maintenance', 'Grout color affects both style and how dirt shows. Ask how each material is cleaned and whether it needs sealing.'],
      ['Installation matters as much as the tile', 'A beautiful tile installed on an uneven surface still looks uneven. Prep work is the unglamorous part that protects your investment.'],
      ['Not sure what fits your bathroom?', 'Bring your samples and photos to your estimate and we will talk through what makes sense for your layout, budget and lifestyle.']
    ]
  },
  {
    slug: 'signs-of-hidden-bathroom-water-damage', title: '7 Signs of Hidden Water Damage in a Bathroom', short: 'Small clues that something bigger may be happening behind the walls.', desc: 'Common warning signs of hidden bathroom water damage and when to get a professional to look.',
    body: [
      ['Soft, bouncy or sagging floors', 'A floor that flexes near the tub, toilet or shower deserves attention. Do not ignore it.'],
      ['Cracked or loose tile and failing grout', 'Isolated cracks can be cosmetic. Widespread loose tile, hollow sounds or crumbling grout can point to a bigger problem.'],
      ['Musty smells and recurring mold', 'A persistent odor or mold that keeps returning after cleaning is worth investigating.'],
      ['Stains, bubbling paint or warped trim', 'Look at ceilings below the bathroom and at baseboards and walls beside wet areas.'],
      ['Other warning signs', 'Rising water bills, rusted fixtures and caulk that will not stay sealed can also be clues.'],
      ['What to do next', 'Water problems rarely get cheaper with time. If you see these signs, contact us and we can take a look at your bathroom and talk through your options.']
    ]
  },
  {
    slug: 'tub-to-shower-conversion', title: 'Thinking About Converting Your Tub to a Shower?', short: 'What to weigh before you remove the tub for good.', desc: 'Things to consider before converting a bathtub into a walk-in shower, including resale, space and accessibility.',
    body: [
      ['Why homeowners convert', 'Common reasons include easier access, a more open look, easier cleaning and more usable space.'],
      ['Think about resale', 'Many buyers like having at least one tub in the home. If it is your only tub, consider how that fits your plans.'],
      ['Layout and plumbing are the big variables', 'Your existing drain location, wall framing and floor structure influence which designs are possible and how much work is involved.'],
      ['Waterproofing is not optional', 'A shower is only as good as its waterproofing and slope. This is where experience counts.'],
      ['Get a plan for your bathroom', 'Every bathroom is different. Call us for a free estimate and we will give you straight answers for your space.']
    ]
  }
];

const questions = [
  ['Is it worth remodeling a bathroom before selling my home?', 'Often, a clean, updated bathroom helps a home show well. How much to spend depends on your house, your price range and your timeline. Call us and we will give you an honest opinion.'],
  ['How do I know if my shower is leaking?', 'Watch for staining on nearby walls or ceilings below, soft spots, persistent odors and tile that sounds hollow. Leaks can be tricky to pin down. We can take a look.'],
  ['Can I reuse my existing bathroom layout to save money?', 'Keeping plumbing in place can help control scope, but the best choice depends on what you want. We will review options at your estimate.'],
  ['How early should I order tile and fixtures?', 'Sooner is better. Some items are in stock and some take weeks. Ask us before ordering so we can match quantities and timing.'],
  ['Do I need permits for a bathroom remodel?', 'It depends on your municipality and the work involved. Rules differ between towns and counties, so check with your local building department and ask us what applies to your project.'],
  ['What is the best time of year for a remodel?', 'Any time works, but busy seasons book up. Reach out early and we will talk through scheduling.']
];

module.exports = { services, counties, guides, questions };
