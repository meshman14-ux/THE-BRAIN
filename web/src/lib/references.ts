/**
 * The reference library — curated, UK-focused resources for every branch of
 * the system. Researched 2026-08-01; each link earns its place by being the
 * authoritative source (gov.uk, NHS, HSE, FSA) or the best practical guide
 * found for that branch. House rules apply throughout: GBP everywhere, no
 * beef in anything food-related, faith/Gita content welcome.
 *
 * Keyed by pillar *name* (the seeded names) and by branch *slug* (the
 * placeholder routes). If a pillar is ever renamed its shelf follows the
 * name, not the row — update the key here in the same change.
 *
 * Pure data but for the slug rule it borrows from logic.ts — tests assert
 * its integrity: every seeded pillar has a shelf, every URL is https and
 * unique within its shelf, and every internal route points somewhere that
 * exists.
 */

import { slugifyName } from "./logic";

export type RefLink = {
  title: string;
  url: string;
  /** One dry line on why this link is on the shelf. */
  why: string;
};

export type RelatedLink = {
  label: string;
  /** An internal route — a real page or a placeholder branch. */
  href: string;
};

/* ------------------------------------------------------------------ *
 * Shelves for the 13 pillars, keyed by seeded name
 * ------------------------------------------------------------------ */

export const PILLAR_REFS: Record<string, RefLink[]> = {
  /* -- LIFE_OS ---------------------------------------------------- */

  "Training & Fitness": [
    {
      title: "NHS · Exercise and activity",
      url: "https://www.nhs.uk/live-well/exercise/",
      why: "The baseline: 150 minutes moderate a week plus two strength days.",
    },
    {
      title: "UK Chief Medical Officers' physical activity guidelines",
      url: "https://www.gov.uk/government/publications/physical-activity-guidelines-uk-chief-medical-officers-report",
      why: "The evidence the NHS numbers come from, if you want the source.",
    },
    {
      title: "Stronger by Science",
      url: "https://www.strongerbyscience.com/",
      why: "Lifting programming that cites its evidence instead of selling a plan.",
    },
    {
      title: "The Fitness Wiki",
      url: "https://thefitness.wiki/",
      why: "Free, no-nonsense routines and diet basics — a good default answer.",
    },
  ],

  "Nutrition & Recovery": [
    {
      title: "NHS · The Eatwell Guide",
      url: "https://www.nhs.uk/live-well/eat-well/",
      why: "What a balanced plate is, from the people with no product to sell.",
    },
    {
      title: "British Nutrition Foundation",
      url: "https://www.nutrition.org.uk/",
      why: "Deeper nutrition science, still independent.",
    },
    {
      title: "BBC Good Food",
      url: "https://www.bbcgoodfood.com/",
      why: "Recipe bank — chicken, fish, paneer, veg. House rule: no beef.",
    },
    {
      title: "NHS · Fall asleep faster and sleep better",
      url: "https://www.nhs.uk/every-mind-matters/mental-wellbeing-tips/sleep/",
      why: "Recovery is half this pillar and sleep is most of recovery.",
    },
  ],

  "Mind & Growth": [
    {
      title: "OpenLearn — free Open University courses",
      url: "https://www.open.edu/openlearn/",
      why: "Real OU course material, free, certificate included.",
    },
    {
      title: "FutureLearn",
      url: "https://www.futurelearn.com/",
      why: "Short structured courses from UK universities.",
    },
    {
      title: "Anki — spaced repetition",
      url: "https://apps.ankiweb.net/",
      why: "If it is worth learning it is worth not forgetting.",
    },
  ],

  Family: [
    {
      title: "NHS · Every Mind Matters",
      url: "https://www.nhs.uk/every-mind-matters/",
      why: "Connection is a health behaviour; this treats it like one.",
    },
    {
      title: "Action for Happiness",
      url: "https://actionforhappiness.org/",
      why: "Practical, evidence-based prompts for showing up for people.",
    },
  ],

  "Friends & Network": [
    {
      title: "Action for Happiness · Connect",
      url: "https://actionforhappiness.org/take-action",
      why: "Small deliberate actions beat waiting for the phone to ring.",
    },
    {
      title: "NHS · 5 steps to mental wellbeing",
      url: "https://www.nhs.uk/mental-health/self-help/guides-tools-and-activities/five-steps-to-mental-wellbeing/",
      why: "Step one is connect — the schema's cadence_days exists for a reason.",
    },
  ],

  "Home & Admin": [
    {
      title: "GOV.UK",
      url: "https://www.gov.uk/",
      why: "The front door for every renewal, form and deadline the drawer hides.",
    },
    {
      title: "MoneySavingExpert",
      url: "https://www.moneysavingexpert.com/",
      why: "Bill-by-bill checklists for never overpaying on autopilot.",
    },
    {
      title: "Which? · Consumer rights",
      url: "https://www.which.co.uk/consumer-rights",
      why: "What to say, with legal footing, when something goes wrong.",
    },
  ],

  Vehicles: [
    {
      title: "GOV.UK · Check MOT history",
      url: "https://www.gov.uk/check-mot-history",
      why: "Every MOT result and advisory for any of the four vehicles.",
    },
    {
      title: "GOV.UK · Get MOT reminders",
      url: "https://www.gov.uk/mot-reminder",
      why: "Free text/email a month before MOT is due — set once per vehicle.",
    },
    {
      title: "GOV.UK · Tax your vehicle",
      url: "https://www.gov.uk/vehicle-tax",
      why: "Tax online in minutes with the V5C reference.",
    },
    {
      title: "GOV.UK · Check if a vehicle is taxed",
      url: "https://www.gov.uk/check-vehicle-tax",
      why: "Instant tax + MOT status by registration plate.",
    },
    {
      title: "askMID — insurance check",
      url: "https://ownvehicle.askmid.com/",
      why: "Confirms a vehicle is on the Motor Insurance Database.",
    },
  ],

  "Money & Security": [
    {
      title: "StepChange Debt Charity",
      url: "https://www.stepchange.org/",
      why: "Free, confidential debt advice — the first call, not the last resort.",
    },
    {
      title: "MoneyHelper",
      url: "https://www.moneyhelper.org.uk/",
      why: "Government-backed money guidance, including a proper budget planner.",
    },
    {
      title: "GOV.UK · Get free debt advice",
      url: "https://www.gov.uk/debt-advice",
      why: "The official index of every free advice route.",
    },
    {
      title: "Citizens Advice · Debt and money",
      url: "https://www.citizensadvice.org.uk/debt-and-money/",
      why: "Face-to-face help across 3,500+ locations if talking beats typing.",
    },
    {
      title: "Snowball vs avalanche, explained for the UK",
      url: "https://trysnowball.co.uk/library/debt-snowball-method-uk/",
      why: "Avalanche saves the most interest; snowball keeps you going. Pick one.",
    },
  ],

  /* -- EMPIRE_OS -------------------------------------------------- */

  Ventures: [
    {
      title: "GOV.UK · Set up a business",
      url: "https://www.gov.uk/set-up-business",
      why: "Sole trader vs limited company, registration, and what HMRC expects.",
    },
    {
      title: "Start Up Loans (British Business Bank)",
      url: "https://www.startuploans.co.uk/",
      why: "Government-backed £500–£25k per founder with free mentoring.",
    },
    {
      title: "GOV.UK · Self Assessment",
      url: "https://www.gov.uk/self-assessment-tax-returns",
      why: "The deadline that does not move: 31 January, every year.",
    },
    {
      title: "GOV.UK · Business support helpline",
      url: "https://www.gov.uk/business-support-helpline",
      why: "Free government advice line for any of the ten divisions.",
    },
  ],

  "Property & Assets": [
    {
      title: "GOV.UK · Renting out your property",
      url: "https://www.gov.uk/renting-out-a-property",
      why: "The landlord's legal baseline: safety, deposits, repairs, tax.",
    },
    {
      title: "National Residential Landlords Association",
      url: "https://www.nrla.org.uk/",
      why: "The landlord body — guidance, documents and advice line.",
    },
    {
      title: "Gas Safe Register",
      url: "https://www.gassaferegister.co.uk/",
      why: "Annual gas safety check is law; only registered engineers count.",
    },
    {
      title: "GOV.UK · Find an energy certificate",
      url: "https://www.gov.uk/find-energy-certificate",
      why: "EPC lookup — rentals must be band E or better, EPCs last 10 years.",
    },
    {
      title: "GOV.UK · How to rent guide",
      url: "https://www.gov.uk/government/publications/how-to-rent",
      why: "Must be given to tenants at the start of a tenancy — a legal trigger.",
    },
  ],

  "Capital & Investments": [
    {
      title: "MoneyHelper · Savings and investing",
      url: "https://www.moneyhelper.org.uk/en/savings",
      why: "The unconflicted starting point before any product page.",
    },
    {
      title: "GOV.UK · Individual Savings Accounts",
      url: "https://www.gov.uk/individual-savings-accounts",
      why: "The £20,000 ISA allowance is the first tax shelter to fill.",
    },
    {
      title: "Monevator",
      url: "https://monevator.com/",
      why: "The UK's best writing on low-cost passive investing.",
    },
    {
      title: "FCA · InvestSmart",
      url: "https://www.fca.org.uk/investsmart",
      why: "The regulator on scams and high-risk products — read before, not after.",
    },
    {
      title: "FSCS — what's protected",
      url: "https://www.fscs.org.uk/",
      why: "£85,000 per person per bank; know where the floor is.",
    },
  ],

  "Brand & Network": [
    {
      title: "GOV.UK · Trade marks",
      url: "https://www.gov.uk/topic/intellectual-property/trade-marks",
      why: "Registering a name costs from £170; losing one costs a rebrand.",
    },
    {
      title: "Companies House · Search the register",
      url: "https://find-and-update.company-information.service.gov.uk/",
      why: "Check a company or name before trusting it or taking it.",
    },
    {
      title: "GOV.UK · Intellectual property overview",
      url: "https://www.gov.uk/intellectual-property-an-overview",
      why: "What is automatically yours and what needs registering.",
    },
  ],

  "Systems & Tools": [
    {
      title: "Supabase docs",
      url: "https://supabase.com/docs",
      why: "The data layer THE BRAIN runs on.",
    },
    {
      title: "Next.js docs",
      url: "https://nextjs.org/docs",
      why: "The framework the app is built with.",
    },
    {
      title: "Vercel docs",
      url: "https://vercel.com/docs",
      why: "Where deploys, domains and env vars live.",
    },
    {
      title: "The PARA method",
      url: "https://fortelabs.com/blog/para/",
      why: "Projects/Areas/Resources/Archives — the shape this system rhymes with.",
    },
  ],
};

/* ------------------------------------------------------------------ *
 * Shelves for branches — placeholder routes and business divisions
 * ------------------------------------------------------------------ */

export const BRANCH_REFS: Record<string, RefLink[]> = {
  finance: [
    {
      title: "MoneyHelper · Budget planner",
      url: "https://www.moneyhelper.org.uk/en/everyday-money/budgeting/budget-planner",
      why: "A real budget in half an hour, kept by someone unconflicted.",
    },
    {
      title: "MoneySavingExpert · Budget planning",
      url: "https://www.moneysavingexpert.com/banking/budget-planning/",
      why: "The piggybanking approach — money gets a job the day it arrives.",
    },
    {
      title: "StepChange",
      url: "https://www.stepchange.org/",
      why: "If the numbers stop adding up, free advice beats quiet worry.",
    },
  ],

  "debt-payoff": [
    {
      title: "Snowball vs avalanche (UK guide)",
      url: "https://trysnowball.co.uk/library/debt-snowball-method-uk/",
      why: "Choose the order of attack: cheapest-psychology vs cheapest-interest.",
    },
    {
      title: "StepChange · Ways to clear your debt",
      url: "https://www.stepchange.org/how-we-help/debt-advice.aspx",
      why: "Free advice and DMPs from the UK's biggest debt charity.",
    },
    {
      title: "National Debtline",
      url: "https://nationaldebtline.org/",
      why: "Free phone advice and fact sheets, 0808 808 4000.",
    },
    {
      title: "MoneyHelper · Debt advice locator",
      url: "https://www.moneyhelper.org.uk/en/money-troubles/dealing-with-debt/debt-advice-locator",
      why: "Every free adviser near you, in one place.",
    },
  ],

  health: [
    {
      title: "NHS · Health A-Z",
      url: "https://www.nhs.uk/conditions/",
      why: "Symptoms and conditions from the source, not a forum.",
    },
    {
      title: "NHS Health Check",
      url: "https://www.nhs.uk/conditions/nhs-health-check/",
      why: "Free MOT for humans, every 5 years from age 40 — book it like the van's.",
    },
    {
      title: "NHS · Every Mind Matters",
      url: "https://www.nhs.uk/every-mind-matters/",
      why: "The head is part of the body.",
    },
  ],

  food: [
    {
      title: "NHS · Eat well",
      url: "https://www.nhs.uk/live-well/eat-well/",
      why: "The baseline plate. House rule stands: no beef, ever.",
    },
    {
      title: "BBC Good Food",
      url: "https://www.bbcgoodfood.com/",
      why: "Chicken, fish, paneer and veg do everything beef claims to.",
    },
    {
      title: "Love Food Hate Waste",
      url: "https://www.lovefoodhatewaste.com/",
      why: "Wasted food is a debt payment you binned.",
    },
  ],

  motivation: [
    {
      title: "Bhagavad Gita — Vedabase",
      url: "https://vedabase.io/en/library/bg/",
      why: "Verse by verse with Sanskrit, translation and purport.",
    },
    {
      title: "Gita Supersite (IIT Kanpur)",
      url: "https://www.gitasupersite.iitk.ac.in/",
      why: "Scholarly editions and multiple commentaries, free.",
    },
    {
      title: "Holy Bhagavad Gita",
      url: "https://www.holy-bhagavad-gita.org/",
      why: "Clean chapter-by-chapter reading for the daily verse.",
    },
  ],

  reviews: [
    {
      title: "The GTD weekly review",
      url: "https://gettingthingsdone.com/2020/04/the-gtd-weekly-review-in-5-steps/",
      why: "The 20-minute ritual this system's weekly review descends from.",
    },
    {
      title: "The PARA method",
      url: "https://fortelabs.com/blog/para/",
      why: "How the quarterly review decides what stays active.",
    },
  ],

  "kathleen-st": [
    {
      title: "GOV.UK · Renting out your property",
      url: "https://www.gov.uk/renting-out-a-property",
      why: "The full legal baseline for the house: safety, deposits, repairs, tax.",
    },
    {
      title: "GOV.UK · How to rent guide",
      url: "https://www.gov.uk/government/publications/how-to-rent",
      why: "Hand this to the tenant at the start — it is a legal requirement.",
    },
    {
      title: "Gas Safe Register",
      url: "https://www.gassaferegister.co.uk/",
      why: "Annual gas check, registered engineer only, certificate to tenant in 28 days.",
    },
    {
      title: "GOV.UK · Find an energy certificate",
      url: "https://www.gov.uk/find-energy-certificate",
      why: "Check Kathleen St's EPC — band E minimum to let, 10-year life.",
    },
    {
      title: "NRLA",
      url: "https://www.nrla.org.uk/",
      why: "Landlord association: documents, advice line, arrears guidance.",
    },
    {
      title: "Shelter · Repairs and arrears",
      url: "https://england.shelter.org.uk/housing_advice",
      why: "The tenant's side of the law — know it better than they do.",
    },
  ],

  "a-to-z-traderz": [
    {
      title: "GOV.UK · Towing with a car",
      url: "https://www.gov.uk/towing-with-car",
      why: "Licence and weight rules every trailer customer will ask about.",
    },
    {
      title: "GOV.UK · Trailer registration",
      url: "https://www.gov.uk/trailer-registration",
      why: "Which trailers must be registered, and how.",
    },
    {
      title: "National Trailer & Towing Association",
      url: "https://www.ntta.co.uk/",
      why: "The trade body — standards, technical guidance, member directory.",
    },
    {
      title: "GOV.UK · Set up a business",
      url: "https://www.gov.uk/set-up-business",
      why: "The launch paperwork, done properly from day one.",
    },
  ],

  "building-maintenance": [
    {
      title: "GOV.UK · Construction Industry Scheme (CIS)",
      url: "https://www.gov.uk/what-is-the-construction-industry-scheme",
      why: "Register before invoicing a contractor, or 30% is deducted instead of 20%.",
    },
    {
      title: "TrustMark",
      url: "https://www.trustmark.org.uk/business",
      why: "The only government-endorsed quality scheme for work in people's homes.",
    },
    {
      title: "Gas Safe Register",
      url: "https://www.gassaferegister.co.uk/",
      why: "Any gas work without registration is a criminal offence, not a risk.",
    },
    {
      title: "NICEIC · Competent Person schemes",
      url: "https://niceic.com/",
      why: "Part P self-certification for notifiable domestic electrical work.",
    },
    {
      title: "HSE · Construction",
      url: "https://www.hse.gov.uk/construction/",
      why: "Working at height and asbestos are the two that end businesses.",
    },
  ],

  "bedlinog-house": [
    {
      title: "GOV.UK · Renting out your property",
      url: "https://www.gov.uk/renting-out-a-property",
      why: "The tenancy baseline: safety certificates, deposits, repairs, tax.",
    },
    {
      title: "GOV.UK · Deposit protection schemes",
      url: "https://www.gov.uk/deposit-protection-schemes-and-landlords",
      why: "30 days to protect a deposit; miss it and you cannot serve a section 21.",
    },
    {
      title: "Gas Safe Register",
      url: "https://www.gassaferegister.co.uk/",
      why: "Annual check, certificate to the tenant within 28 days.",
    },
    {
      title: "NRLA",
      url: "https://www.nrla.org.uk/",
      why: "Tenancy paperwork, arrears process and an advice line.",
    },
  ],

  "treharris-house": [
    {
      title: "GOV.UK · Renting out your property",
      url: "https://www.gov.uk/renting-out-a-property",
      why: "The tenancy baseline: safety certificates, deposits, repairs, tax.",
    },
    {
      title: "GOV.UK · Find an energy certificate",
      url: "https://www.gov.uk/find-energy-certificate",
      why: "Band E minimum to let; EPCs last ten years.",
    },
    {
      title: "Rent Smart Wales",
      url: "https://www.rentsmart.gov.wales/",
      why: "Welsh landlords must register and be licensed — it is not optional here.",
    },
    {
      title: "NRLA",
      url: "https://www.nrla.org.uk/",
      why: "Documents and the advice line when a tenancy turns awkward.",
    },
  ],

  "storage-solutions": [
    {
      title: "Self Storage Association UK",
      url: "https://www.ssauk.com/",
      why: "The trade body — market data before committing the £1,000.",
    },
    {
      title: "GOV.UK · Planning permission",
      url: "https://www.gov.uk/planning-permission-england-wales",
      why: "Containers and outbuildings often need it; find out before buying.",
    },
    {
      title: "GOV.UK · Set up a business",
      url: "https://www.gov.uk/set-up-business",
      why: "The structure and tax registration for a new division.",
    },
  ],

  "photo-booth": [
    {
      title: "GOV.UK · Licence finder",
      url: "https://www.gov.uk/licence-finder",
      why: "Events and public places carry licences worth checking before the £1,500.",
    },
    {
      title: "ICO · Guide to UK GDPR",
      url: "https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/",
      why: "A booth stores photographs of people — that is personal data.",
    },
    {
      title: "GOV.UK · Public liability insurance",
      url: "https://www.gov.uk/public-liability-insurance",
      why: "Every venue will ask for the certificate before letting you in.",
    },
  ],

  "stencil-art": [
    {
      title: "Laws on selling homemade crafts in the UK",
      url: "https://craftcert.co.uk/blog/laws-selling-homemade-crafts-uk",
      why: "Labelling, liability and Trading Standards, in plain English.",
    },
    {
      title: "GOV.UK · Intellectual property overview",
      url: "https://www.gov.uk/intellectual-property-an-overview",
      why: "Stencils of someone else's artwork or logo is the obvious trap.",
    },
    {
      title: "Etsy Seller Handbook",
      url: "https://www.etsy.com/seller-handbook",
      why: "The cheapest first shopfront for a £500 test.",
    },
  ],

  "stump-pump": [
    {
      title: "GOV.UK · Patents",
      url: "https://www.gov.uk/topic/intellectual-property/patents",
      why: "Publish or sell before filing and the invention becomes unpatentable.",
    },
    {
      title: "Intellectual Property Office · Search patents",
      url: "https://www.gov.uk/search-for-patent",
      why: "Check nobody has already patented it before spending on a prototype.",
    },
    {
      title: "GOV.UK · UKCA marking",
      url: "https://www.gov.uk/guidance/using-the-ukca-marking",
      why: "A physical product sold in Great Britain usually needs conformity marking.",
    },
  ],

  "find-my-stash": [
    {
      title: "ICO · Guide to UK GDPR",
      url: "https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/",
      why: "Any app holding user data starts here, not after launch.",
    },
    {
      title: "Y Combinator · Startup library",
      url: "https://www.ycombinator.com/library",
      why: "How to test a concept before building it — this one is still a concept.",
    },
    {
      title: "Claude API documentation",
      url: "https://docs.claude.com/",
      why: "If it needs intelligence, this is the fastest route to a prototype.",
    },
  ],

  "amazon-fba": [
    {
      title: "Amazon Seller Central UK",
      url: "https://sell.amazon.co.uk/",
      why: "The front door: account, fees, and the FBA programme itself.",
    },
    {
      title: "Amazon Seller University",
      url: "https://sell.amazon.co.uk/sell-online/seller-university",
      why: "200+ free official lessons — do these before paying anyone for a course.",
    },
    {
      title: "Amazon UK · Pricing and FBA calculator",
      url: "https://sell.amazon.co.uk/pricing",
      why: "Professional account is ~£25/month; run margins here before buying stock.",
    },
    {
      title: "UK Amazon seller fees, the hidden ones",
      url: "https://linkmybooks.com/blog/uk-amazon-seller-fees",
      why: "The fees the calculator forgets — read before the first purchase order.",
    },
    {
      title: "Jungle Scout",
      url: "https://www.junglescout.com/",
      why: "Product research data — demand, competition, margin. Paid, worth it at research stage.",
    },
  ],

  "ai-software": [
    {
      title: "Claude API documentation",
      url: "https://docs.claude.com/",
      why: "The models this very system is built with — highest ceiling, lowest barrier.",
    },
    {
      title: "Vercel AI SDK",
      url: "https://ai-sdk.dev/",
      why: "The fastest path from idea to shipped AI product on this stack.",
    },
    {
      title: "Supabase docs",
      url: "https://supabase.com/docs",
      why: "Auth, database and vectors for whatever gets built.",
    },
    {
      title: "Y Combinator · Startup library",
      url: "https://www.ycombinator.com/library",
      why: "Free, dense, and honest about what kills software startups.",
    },
  ],

  "coffee-shop": [
    {
      title: "GOV.UK · Register a food business",
      url: "https://www.gov.uk/food-business-registration",
      why: "Free, legally required, at least 28 days before opening.",
    },
    {
      title: "Food Standards Agency · Business guidance",
      url: "https://www.food.gov.uk/business-guidance",
      why: "Hygiene ratings, allergens, HACCP — the inspection is scored 0–5.",
    },
    {
      title: "GOV.UK · Licence finder",
      url: "https://www.gov.uk/licence-finder",
      why: "Music, pavement seating, alcohol — find every licence in one pass.",
    },
  ],

  microgreens: [
    {
      title: "GroCycle · Microgreens for profit",
      url: "https://grocycle.com/microgreens-for-profit/",
      why: "The best free end-to-end guide: trays, cycles, pricing, customers.",
    },
    {
      title: "Farm Microgreens UK",
      url: "https://farmmicrogreens.co.uk/",
      why: "UK-specific: pea and radish shoots sell best, chefs buy weekly standing orders.",
    },
    {
      title: "GOV.UK · Register a food business",
      url: "https://www.gov.uk/food-business-registration",
      why: "Growing to sell means registering with Environmental Health first.",
    },
  ],

  "resin-and-epoxy": [
    {
      title: "HSE · COSHH basics",
      url: "https://www.hse.gov.uk/coshh/",
      why: "Epoxy is a sensitiser: gloves, ventilation, respirator when unsure.",
    },
    {
      title: "Laws on selling homemade crafts in the UK",
      url: "https://craftcert.co.uk/blog/laws-selling-homemade-crafts-uk",
      why: "Labelling, product liability and Trading Standards in plain English.",
    },
    {
      title: "Etsy Seller Handbook · Safe and compliant products",
      url: "https://www.etsy.com/seller-handbook/article/1026513040312",
      why: "What Etsy checks for, including CLP labels and destination-country rules.",
    },
  ],

  festivals: [
    {
      title: "The Purple Guide",
      url: "https://www.thepurpleguide.co.uk/",
      why: "The UK event-safety bible, £60/yr subscription — SAGs assess against it.",
    },
    {
      title: "GOV.UK · Temporary Events Notice",
      url: "https://www.gov.uk/temporary-events-notice",
      why: "The licence for events under 500 people — apply 10 working days out.",
    },
    {
      title: "HSE · Event safety",
      url: "https://www.hse.gov.uk/event-safety/",
      why: "The regulator's own guidance on crowds, structures and contractors.",
    },
  ],

  "charity-india": [
    {
      title: "GOV.UK · Set up a charity",
      url: "https://www.gov.uk/setting-up-charity",
      why: "The six steps, including whether a charity is even the right vehicle.",
    },
    {
      title: "Charity Commission",
      url: "https://www.gov.uk/government/organisations/charity-commission",
      why: "Registration is required above £5,000 income; rules on overseas work.",
    },
    {
      title: "FCRA requirements for India recipients",
      url: "https://give2asia.org/fcra-requirements-for-india-grant-recipients/",
      why: "Indian partners must hold FCRA registration to receive foreign funds — plan around it.",
    },
    {
      title: "NCVO",
      url: "https://www.ncvo.org.uk/",
      why: "Governance, trustees and running a small charity without drowning.",
    },
  ],
};

/* ------------------------------------------------------------------ *
 * The strings — how branches connect to the rest of the system
 * ------------------------------------------------------------------ */

/**
 * Internal connections per branch slug: where this branch already lives in
 * the built system. Pillar links are resolved by name at render time because
 * pillar ids are per-user.
 */
export const BRANCH_RELATED: Record<
  string,
  { routes?: RelatedLink[]; pillars?: string[] }
> = {
  search: { routes: [{ label: "Capture — the writing half", href: "/capture" }] },
  today: {
    routes: [
      { label: "Today's three on THE BRAIN", href: "/dashboard" },
      { label: "This Week — put days on tasks", href: "/week" },
    ],
  },
  calendar: { routes: [{ label: "This Week — the scheduler for now", href: "/week" }] },
  diary: { routes: [{ label: "Reviews — where the hours get read back", href: "/reviews" }] },
  feed: { routes: [{ label: "Capture — the manual way in", href: "/capture" }] },
  advisor: { routes: [{ label: "The AI digest slot on THE BRAIN", href: "/dashboard" }] },
  finance: {
    pillars: ["Money & Security"],
    routes: [
      { label: "Debts — live now, every creditor", href: "/life/debts" },
      { label: "Debt payoff plan", href: "/debt-payoff" },
    ],
  },
  health: { pillars: ["Training & Fitness", "Nutrition & Recovery"], routes: [{ label: "LIFE_OS — score both areas", href: "/life" }] },
  food: { pillars: ["Nutrition & Recovery"] },
  "kathleen-st": {
    pillars: ["Property & Assets"],
    routes: [{ label: "EMPIRE_OS — the venture at stabilise", href: "/empire" }],
  },
  family: { pillars: ["Family", "Friends & Network"] },
  motivation: {},
  documents: { routes: [{ label: "Library — the reference shelves", href: "/library" }] },
  reviews: { routes: [{ label: "Goals — what the review walks", href: "/goals" }] },
  "debt-payoff": {
    pillars: ["Money & Security"],
    routes: [
      { label: "Debts — live now, every creditor", href: "/life/debts" },
      { label: "Finance", href: "/finance" },
    ],
  },
  "a-to-z-traderz": { pillars: ["Ventures"], routes: [{ label: "EMPIRE_OS — at launch", href: "/empire" }] },
  "building-maintenance": { pillars: ["Ventures"], routes: [{ label: "EMPIRE_OS — at launch", href: "/empire" }] },
  "bedlinog-house": {
    pillars: ["Property & Assets"],
    routes: [{ label: "EMPIRE_OS — the property portfolio", href: "/empire" }],
  },
  "treharris-house": {
    pillars: ["Property & Assets"],
    routes: [{ label: "EMPIRE_OS — the property portfolio", href: "/empire" }],
  },
  "storage-solutions": { pillars: ["Ventures"], routes: [{ label: "EMPIRE_OS — parked in the backlog", href: "/empire" }] },
  "photo-booth": { pillars: ["Ventures"], routes: [{ label: "EMPIRE_OS — parked in the backlog", href: "/empire" }] },
  "stencil-art": { pillars: ["Ventures"], routes: [{ label: "EMPIRE_OS — parked in the backlog", href: "/empire" }] },
  "stump-pump": { pillars: ["Ventures"], routes: [{ label: "EMPIRE_OS — parked in the backlog", href: "/empire" }] },
  "find-my-stash": { pillars: ["Systems & Tools"], routes: [{ label: "EMPIRE_OS — parked in the backlog", href: "/empire" }] },
  "amazon-fba": { pillars: ["Ventures"], routes: [{ label: "EMPIRE_OS — at research", href: "/empire" }] },
  "ai-software": { pillars: ["Systems & Tools"], routes: [{ label: "EMPIRE_OS — the idea with the highest ceiling", href: "/empire" }] },
  "coffee-shop": { pillars: ["Ventures"], routes: [{ label: "EMPIRE_OS — parked in the backlog", href: "/empire" }] },
  microgreens: { pillars: ["Ventures"], routes: [{ label: "EMPIRE_OS — parked in the backlog", href: "/empire" }] },
  "resin-and-epoxy": { pillars: ["Ventures"], routes: [{ label: "EMPIRE_OS — parked in the backlog", href: "/empire" }] },
  festivals: { pillars: ["Ventures"], routes: [{ label: "EMPIRE_OS — MAINFRAME runs the live ops", href: "/empire" }] },
  "charity-india": { pillars: ["Ventures"], routes: [{ label: "EMPIRE_OS — parked in the backlog", href: "/empire" }] },
};

/**
 * A venture's branch slug, derived from its name rather than looked up in a
 * hand-maintained table.
 *
 * This is deliberate. The first version of this file mapped names to slugs
 * by hand, and the moment a venture was renamed ("A to Z Trailerz" →
 * "A to Z Traderz") its link silently stopped resolving — nothing errored,
 * the row just quietly stopped being clickable. Deriving the slug means a
 * rename moves the page with it, and a venture added tomorrow gets a branch
 * without anyone editing this file.
 *
 * The rule itself lives in logic.ts with the rest of the tested logic; this
 * is the name the empire calls it by. One implementation, so a shelf and a
 * division page can never disagree about a URL.
 */
export function ventureSlug(name: string): string {
  return slugifyName(name);
}

/** Where a division's own dashboard lives. */
export function divisionHref(name: string): string {
  return `/empire/${ventureSlug(name)}`;
}

/**
 * Ventures THE BRAIN deliberately does not give a branch page.
 * MAINFRAME is a pointer to a separate system; opening a page here would
 * imply this system contains it, which it never does.
 */
export const EXTERNAL_VENTURES = new Set(["MAINFRAME"]);

/** The slug a venture links to, or null when it deliberately has no page. */
export function branchForVenture(name: string): string | null {
  if (EXTERNAL_VENTURES.has(name)) return null;
  return ventureSlug(name);
}

/**
 * Legacy names kept resolving, so old links and bookmarks survive a rename.
 * Key = retired slug, value = the slug it now lives at.
 */
export const BRANCH_ALIASES: Record<string, string> = {
  "a-to-z-trailerz": "a-to-z-traderz",
  // Hand-written slug from the first registry; the derived form has "and".
  "resin-epoxy": "resin-and-epoxy",
  // The placeholder retired when the real view shipped at /life/vehicles.
  vehicles: "life/vehicles",
};

export function refsForPillar(name: string): RefLink[] {
  return PILLAR_REFS[name] ?? [];
}

export function refsForBranch(slug: string): RefLink[] {
  return BRANCH_REFS[slug] ?? [];
}
