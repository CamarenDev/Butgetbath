// Pure estimating logic for bathroom remodels: price book, quantity takeoff, totals and contract templates.
// Money is integer cents. Percentages are basis points (1% = 100).

const { SEED_MORE, takeoff, takeoffPlan } = require('./bathroom');

const KINDS = ['material', 'labor', 'equipment', 'subcontractor', 'other'];
const KIND_LABELS = { material: 'Materials', labor: 'Labor', equipment: 'Equipment', subcontractor: 'Subcontractors', other: 'Other costs' };
const TIERS = ['good', 'better', 'best'];
const UNITS = ['ea', 'sf', 'lf', 'hr', 'day', 'wk', 'ls'];

// [code, category, name, kind, unit, cost $, waste %, tier]. Starting prices (suburban Chicago, contractor cost); edit them in the price book.
const SEED_BASE = [
  ['demo-bath', 'Demolition', 'Demolition & haul-away, full bathroom', 'labor', 'ea', 1200, 0, ''],
  ['demo-tub', 'Demolition', 'Remove tub or shower surround', 'labor', 'ea', 350, 0, ''],
  ['demo-floor', 'Demolition', 'Remove existing flooring', 'labor', 'sf', 2.5, 0, ''],
  ['dumpster', 'Demolition', 'Dumpster / disposal', 'other', 'ea', 450, 0, ''],
  ['protect', 'Demolition', 'Floor, dust and path protection', 'other', 'ea', 120, 0, ''],
  ['lead-safe', 'Demolition', 'Lead-safe (RRP) compliance, homes built before 1978', 'other', 'ea', 400, 0, ''],
  ['framing', 'Framing & backer', 'Framing, blocking and subfloor repairs', 'labor', 'hr', 75, 0, ''],
  ['backer-mat', 'Framing & backer', 'Cement backer board', 'material', 'sf', 1.6, 10, ''],
  ['backer-lab', 'Framing & backer', 'Install backer board', 'labor', 'sf', 2.25, 0, ''],
  ['drywall-mat', 'Framing & backer', 'Moisture-resistant drywall', 'material', 'sf', 0.9, 10, ''],
  ['drywall-lab', 'Framing & backer', 'Hang, tape and finish drywall', 'labor', 'sf', 2.75, 0, ''],
  ['waterproof-mat', 'Waterproofing', 'Waterproofing membrane', 'material', 'sf', 2.4, 10, ''],
  ['waterproof-lab', 'Waterproofing', 'Install waterproofing & flood test', 'labor', 'sf', 2, 0, ''],
  ['pan', 'Waterproofing', 'Shower pan / curb kit', 'material', 'ea', 380, 0, ''],
  ['floor-tile', 'Tile', 'Floor tile', 'material', 'sf', 3.5, 12, 'good'],
  ['floor-tile', 'Tile', 'Floor tile', 'material', 'sf', 7, 12, 'better'],
  ['floor-tile', 'Tile', 'Floor tile', 'material', 'sf', 14, 12, 'best'],
  ['wall-tile', 'Tile', 'Wall tile', 'material', 'sf', 3, 12, 'good'],
  ['wall-tile', 'Tile', 'Wall tile', 'material', 'sf', 6.5, 12, 'better'],
  ['wall-tile', 'Tile', 'Wall tile', 'material', 'sf', 13, 12, 'best'],
  ['tile-setting', 'Tile', 'Mortar, grout, sealer and spacers', 'material', 'sf', 1.4, 5, ''],
  ['floor-tile-lab', 'Tile', 'Install floor tile', 'labor', 'sf', 9, 0, ''],
  ['wall-tile-lab', 'Tile', 'Install wall tile', 'labor', 'sf', 12, 0, ''],
  ['trim-edge', 'Tile', 'Metal tile edge trim', 'material', 'lf', 6, 5, ''],
  ['niche', 'Tile', 'Shower niche, framed and waterproofed', 'labor', 'ea', 325, 0, ''],
  ['heat-mat', 'Tile', 'Electric radiant floor heat mat & thermostat', 'material', 'sf', 12, 5, ''],
  ['heat-lab', 'Tile', 'Install radiant floor heat', 'labor', 'sf', 4, 0, ''],
  ['vanity', 'Fixtures', 'Vanity with top', 'material', 'ea', 450, 0, 'good'],
  ['vanity', 'Fixtures', 'Vanity with top', 'material', 'ea', 1100, 0, 'better'],
  ['vanity', 'Fixtures', 'Vanity with top', 'material', 'ea', 2400, 0, 'best'],
  ['vanity-lab', 'Fixtures', 'Install vanity, sink and faucet', 'labor', 'ea', 275, 0, ''],
  ['faucet', 'Fixtures', 'Vanity faucet', 'material', 'ea', 110, 0, 'good'],
  ['faucet', 'Fixtures', 'Vanity faucet', 'material', 'ea', 220, 0, 'better'],
  ['faucet', 'Fixtures', 'Vanity faucet', 'material', 'ea', 450, 0, 'best'],
  ['toilet', 'Fixtures', 'Toilet', 'material', 'ea', 220, 0, 'good'],
  ['toilet', 'Fixtures', 'Toilet', 'material', 'ea', 380, 0, 'better'],
  ['toilet', 'Fixtures', 'Toilet', 'material', 'ea', 750, 0, 'best'],
  ['toilet-lab', 'Fixtures', 'Install toilet', 'labor', 'ea', 150, 0, ''],
  ['tub', 'Fixtures', 'Bathtub, 60 in', 'material', 'ea', 450, 0, 'good'],
  ['tub', 'Fixtures', 'Bathtub, 60 in', 'material', 'ea', 900, 0, 'better'],
  ['tub', 'Fixtures', 'Bathtub, 60 in', 'material', 'ea', 2200, 0, 'best'],
  ['tub-lab', 'Fixtures', 'Install bathtub', 'labor', 'ea', 650, 0, ''],
  ['shower-valve', 'Fixtures', 'Shower valve, trim and head', 'material', 'ea', 200, 0, 'good'],
  ['shower-valve', 'Fixtures', 'Shower valve, trim and head', 'material', 'ea', 380, 0, 'better'],
  ['shower-valve', 'Fixtures', 'Shower valve, trim and head', 'material', 'ea', 800, 0, 'best'],
  ['shower-valve-lab', 'Fixtures', 'Install shower valve and trim', 'labor', 'ea', 450, 0, ''],
  ['shower-drain', 'Fixtures', 'Shower drain', 'material', 'ea', 95, 0, ''],
  ['glass', 'Fixtures', 'Shower door / glass', 'material', 'ea', 380, 0, 'good'],
  ['glass', 'Fixtures', 'Shower door / glass', 'material', 'ea', 1100, 0, 'better'],
  ['glass', 'Fixtures', 'Shower door / glass', 'material', 'ea', 1800, 0, 'best'],
  ['mirror', 'Fixtures', 'Mirror or medicine cabinet', 'material', 'ea', 90, 0, 'good'],
  ['mirror', 'Fixtures', 'Mirror or medicine cabinet', 'material', 'ea', 220, 0, 'better'],
  ['mirror', 'Fixtures', 'Mirror or medicine cabinet', 'material', 'ea', 450, 0, 'best'],
  ['accessories', 'Fixtures', 'Towel bars, paper holder and hooks', 'material', 'ea', 80, 0, 'good'],
  ['accessories', 'Fixtures', 'Towel bars, paper holder and hooks', 'material', 'ea', 150, 0, 'better'],
  ['accessories', 'Fixtures', 'Towel bars, paper holder and hooks', 'material', 'ea', 300, 0, 'best'],
  ['accessories-lab', 'Fixtures', 'Install accessories', 'labor', 'ea', 100, 0, ''],
  ['plumb-rough', 'Plumbing', 'Plumbing rough-in changes (licensed plumber)', 'subcontractor', 'ea', 1400, 0, ''],
  ['fan', 'Electrical', 'Exhaust fan', 'material', 'ea', 110, 0, 'good'],
  ['fan', 'Electrical', 'Exhaust fan', 'material', 'ea', 220, 0, 'better'],
  ['fan', 'Electrical', 'Exhaust fan', 'material', 'ea', 420, 0, 'best'],
  ['fan-lab', 'Electrical', 'Install exhaust fan and duct', 'labor', 'ea', 250, 0, ''],
  ['light', 'Electrical', 'Vanity light fixture', 'material', 'ea', 90, 0, 'good'],
  ['light', 'Electrical', 'Vanity light fixture', 'material', 'ea', 200, 0, 'better'],
  ['light', 'Electrical', 'Vanity light fixture', 'material', 'ea', 400, 0, 'best'],
  ['light-lab', 'Electrical', 'Install vanity light', 'labor', 'ea', 140, 0, ''],
  ['recessed', 'Electrical', 'Recessed LED light, installed', 'material', 'ea', 38, 0, ''],
  ['recessed-lab', 'Electrical', 'Install recessed light', 'labor', 'ea', 85, 0, ''],
  ['electric-sub', 'Electrical', 'Electrical circuits, GFCI and code upgrades (licensed electrician)', 'subcontractor', 'ea', 650, 0, ''],
  ['paint-mat', 'Finish', 'Paint and primer', 'material', 'ea', 90, 0, ''],
  ['paint-lab', 'Finish', 'Paint walls, ceiling and trim', 'labor', 'ea', 450, 0, ''],
  ['trim-mat', 'Finish', 'Baseboard and casing', 'material', 'lf', 4, 8, ''],
  ['trim-lab', 'Finish', 'Install baseboard and casing', 'labor', 'lf', 5, 0, ''],
  ['sundries', 'Finish', 'Sundries: caulk, fasteners, adhesives', 'material', 'ea', 150, 0, ''],
  ['clean', 'Finish', 'Final cleaning', 'labor', 'ea', 180, 0, ''],
  ['equipment', 'Equipment', 'Equipment rental (wet saw, mixer, etc.)', 'equipment', 'day', 60, 0, ''],
  ['permit', 'Permits', 'Permit and inspection fees', 'other', 'ea', 350, 0, '']
];
const SEED = [...SEED_BASE, ...SEED_MORE];

const DEFAULT_SETTINGS = { handyman_rate: '75', licensed_rate: '125', handyman_min_hours: '2', region_factor_pct: '100', weekend_premium_pct: '0', work_start: '08:00', work_end: '16:30', lunch_min: '30', break_min: '30', work_saturday: '0', prices_updated: '2026-11-24', price_source: 'Home Depot reference prices for Kane, Kendall, DuPage and DeKalb counties, IL. Tool rental rates follow published Home Depot day and week rates. Confirm at your local store before large orders.', markup_pct: '25', tax_pct: '0', contingency_pct: '5', deposit_pct: '30', valid_days: '30', terms: 'Payment is due as invoiced. A deposit is due at signing to schedule the work and order materials. Changes to the scope are priced and approved in writing as change orders before work begins. Unforeseen conditions behind walls and floors, such as rot, mold, outdated wiring or plumbing, are not included unless listed and will be quoted separately for approval.', exclusions: 'Items not listed above, hidden or pre-existing damage, asbestos or mold remediation, structural changes, and furniture moving are excluded.' };

const round = n => Math.round(n);
const bp = pct => Math.round(Number(pct) * 100);

// Line cost = quantity (plus waste) x unit cost. Line price adds markup (overhead and profit).
function lineAmounts(item, markupBp) {
  const cost = round(item.qty * (1 + item.waste_bp / 10000) * item.cost_cents);
  return { cost, price: round(cost * (1 + markupBp / 10000)) };
}

function computeTotals(estimate, items, paidCents = 0) {
  const lines = items.map(item => {
    const amounts = lineAmounts(item, estimate.markup_bp);
    const included = !item.optional || Boolean(item.accepted);
    return { id: item.id, section: item.section, kind: item.kind, name: item.name, qty: item.qty, unit: item.unit, waste_bp: item.waste_bp, cost_cents: item.cost_cents, optional: Boolean(item.optional), accepted: Boolean(item.accepted), included, ...amounts };
  });
  const counted = lines.filter(l => l.included);
  const costCents = counted.reduce((a, l) => a + l.cost, 0);
  const subtotal = counted.reduce((a, l) => a + l.price, 0);
  const contingency = round(subtotal * estimate.contingency_bp / 10000);
  const discount = Math.min(estimate.discount_cents, subtotal + contingency);
  const taxable = counted.filter(l => l.kind === 'material').reduce((a, l) => a + l.price, 0);
  const tax = round(taxable * estimate.tax_bp / 10000);
  const total = subtotal + contingency - discount + tax;
  const byKind = Object.fromEntries(KINDS.map(k => [k, counted.filter(l => l.kind === k).reduce((a, l) => a + l.cost, 0)]));
  const profit = subtotal + contingency - discount - costCents;
  const deposit = Math.min(total, round(total * estimate.deposit_bp / 10000));
  return { lines, totals: { costCents, byKind, subtotalCents: subtotal, contingencyCents: contingency, discountCents: discount, taxCents: tax, totalCents: total, depositCents: deposit, profitCents: profit, marginPct: total ? Math.round(profit / total * 1000) / 10 : 0, paidCents, balanceCents: Math.max(0, total - paidCents), depositDueCents: Math.max(0, deposit - paidCents) } };
}

const money = c => `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Starting-point legal documents. Fields are filled in server-side; the business should have an attorney review them.
function documentTemplates({ company, customer, estimate, totals, today }) {
  const who = customer?.name || 'Customer', where = customer?.address || 'the project address';
  const head = `${company} ("Contractor") and ${who} ("Owner") agree as follows for the work at ${where}, described in estimate ${estimate.number} dated ${today}.`;
  return {
    contract: ['Home Remodeling Contract', `${head}\n\n1. Scope of work. The Contractor will perform the work and furnish the materials listed in estimate ${estimate.number} ("Estimate"), which is part of this contract. Work not listed is not included.\n\n2. Price and payment. The contract price is ${money(totals.totalCents)}. A deposit of ${money(totals.depositCents)} is due at signing. The balance is due on completion unless the Estimate states a payment schedule.\n\n3. Changes. Any change to the scope, finishes or price must be agreed in a written change order signed by both parties before the work begins.\n\n4. Schedule. Start and completion dates are estimates and depend on material availability, weather, inspections and Owner decisions. The Contractor is not liable for delays outside its control.\n\n5. Hidden conditions. If concealed damage or code problems are found, the Contractor will notify the Owner and quote the extra work before proceeding.\n\n6. Owner responsibilities. The Owner will provide access to the work area, utilities, and a clear working space, and will choose any unselected materials in time to avoid delays.\n\n7. Insurance and permits. The Contractor will obtain required permits and maintain required insurance. Permit fees are included only if listed in the Estimate.\n\n8. Warranty. The Contractor warrants its workmanship against defects for one year from completion. Manufacturer warranties apply to products. The warranty does not cover misuse, normal wear or damage by others.\n\n9. Right to cancel. If this contract was signed at the Owner's home or another location that is not the Contractor's regular place of business, the Owner may cancel within three business days of signing by written notice, and any deposit will be refunded.\n\n10. Disputes. The parties will first try to resolve any dispute in good faith. Illinois law governs this contract.\n\nBy typing their name below, each party agrees to be bound by this contract and consents to electronic signatures.`],
    change_order: ['Change Order Authorization', `${head}\n\nThe Owner authorizes the change(s) to the scope of work described in the attached change order estimate. The change order total is ${money(totals.totalCents)} and is added to the contract price. Unless the change order states otherwise, the completion date may be extended by the time needed to perform the added work.\n\nBy typing their name below, the Owner approves the change order and agrees to pay the amount stated.`],
    lien_waiver: ['Partial Lien Waiver', `${head}\n\nUpon receipt of the payment(s) recorded for estimate ${estimate.number}, the Contractor waives and releases any mechanics lien right on the property at ${where} for labor and materials furnished through the date below, to the extent of the amount actually received. This waiver does not cover work performed or payments due after that date.\n\nBy typing their name below, the Contractor's representative confirms this waiver.`],
    completion: ['Certificate of Completion & Final Acceptance', `${head}\n\nThe Owner confirms that the work described in estimate ${estimate.number} is complete and has been inspected, except for any items listed in writing to the Contractor before signing. The Owner acknowledges that the one-year workmanship warranty begins on the date of this certificate.\n\nBy typing their name below, the Owner accepts the completed work.`],
    warranty: ['Workmanship Warranty', `${head}\n\nThe Contractor warrants the workmanship of the work described in estimate ${estimate.number} to be free from defects for one year from the completion date. The Contractor will repair or correct defective workmanship reported in writing within that period. This warranty does not cover damage from misuse, accidents, normal wear, water or settling not caused by the work, or work performed by others. Manufacturer warranties on products remain with the manufacturer.\n\nBy typing their name below, the Owner acknowledges receipt of this warranty.`]
  };
}

module.exports = { KINDS, KIND_LABELS, TIERS, UNITS, SEED, DEFAULT_SETTINGS, bp, computeTotals, takeoff, takeoffPlan, documentTemplates, money, lineAmounts };
