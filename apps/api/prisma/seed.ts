import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

/**
 * Seeds claims at different stages of the business flow so the demo shows
 * the full pipeline: business proposal -> screening -> formulation ->
 * evidence -> assessment. Assessments themselves are created through the
 * API, not seeded, so every verdict in the DB came from the real judge.
 */
// Product names are fictional placeholders.
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  await prisma.assessment.deleteMany();
  await prisma.claim.deleteMany();

  await prisma.claim.createMany({
    data: [
      {
        productName: 'Night Renewal Serum (RX-204)',
        claimText: 'Reduces wrinkles by 20% in 4 weeks',
        category: 'EFFICACY',
        market: 'EU',
        status: 'EVIDENCE_SUBMITTED',
      },
      {
        productName: 'Aqua Gel Moisturiser (HY-118)',
        claimText: 'Boosts skin hydration by 40% in 24 hours',
        category: 'EFFICACY',
        market: 'EU',
        status: 'FORMULATED',
      },
      {
        productName: 'Bond Repair Shampoo (HC-031)',
        claimText: '9 out of 10 women say hair feels stronger after one week',
        category: 'CONSUMER_PERCEPTION',
        market: 'EU',
        status: 'SCREENED',
      },
      {
        productName: 'Cell Renewal Cream (AP-009)',
        claimText: 'Erases wrinkles permanently',
        category: 'EFFICACY',
        market: 'EU',
        status: 'REJECTED', // screened out: "permanently" can't be substantiated, borderline medicinal
      },
      {
        productName: 'Even Tone Serum (DS-077)',
        claimText: 'Visibly reduces dark spots in 8 weeks',
        category: 'EFFICACY',
        market: 'US',
        status: 'PROPOSED',
      },
    ],
  });

  const count = await prisma.claim.count();
  console.log(`Seeded ${count} claims.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
