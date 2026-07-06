import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const seedAccounts = [
    { vpa: 'alice@demo', holderName: 'Alice', balance: 5000.00 },
    { vpa: 'bob@demo', holderName: 'Bob', balance: 1000.00 },
    { vpa: 'carol@demo', holderName: 'Carol', balance: 2500.00 },
    { vpa: 'dave@demo', holderName: 'Dave', balance: 500.00 }
  ];

  for (const account of seedAccounts) {
    await prisma.account.upsert({
      where: { vpa: account.vpa },
      update: {
        holderName: account.holderName,
        balance: account.balance,
        version: 0
      },
      create: {
        vpa: account.vpa,
        holderName: account.holderName,
        balance: account.balance,
        version: 0
      }
    });
  }
  console.log('Database seeded with 4 demo accounts.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
