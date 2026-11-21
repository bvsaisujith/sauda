import { db, closeDb } from '../src/db.js';

const prisma = db();

async function main(): Promise<void> {
  const shop = await prisma.shop.create({
    data: {
      name: `Smoke ${Date.now()}`,
      owners: { create: { pinHash: 'not-a-real-hash' } },
      },
  });

  const item = await prisma.item.create({
    data: {
      shopId: shop.id,
      name: `Rice ${Date.now()}`,
      baseUnit: 'kg',
      sellPrice: 6500,
      buyPrice: 5200,
      gstRate: 5,
      hsnCode: '1006',
      batches: {
        create: {
          quantity: 25,
          remaining: 25,
          unitCost: 5200,
          expiryDate: new Date('2027-01-31'),
        },
      },
    },
    include: { batches: true },
  });

  const movement = await prisma.stockMovement.create({
    data: {
      itemId: item.id,
      batchId: item.batches[0]?.id,
      type: 'RECEIPT',
      quantity: 25,
      unitCost: 5200,
      referenceType: 'smoke',
    },
  });

  const repack = await prisma.repack.create({
    data: {
      shopId: shop.id,
      baseItemId: item.id,
      packItemId: item.id,
      consumedQty: 10,
      producedQty: 9,
      wastageQty: 1,
      consumedCost: 52000,
      producedCost: 52000,
      consumptions: {
        create: { batchId: item.batches[0]?.id ?? '', quantity: 10, unitCost: 5200 },
      },
    },
    include: { consumptions: true },
  });

  const proposal = await prisma.proposal.create({
    data: {
      shopId: shop.id,
      tool: 'items.updatePrice',
      args: { itemId: item.id, sellPrice: 6800 },
      preview: { changes: [{ field: 'sellPrice', from: 6500, to: 6800 }] },
      idempotencyKey: `smoke-${Date.now()}`,
      expiresAt: new Date(Date.now() + 60_000),
    },
  });

  console.log({
    shopId: shop.id,
    ownerCount: await prisma.owner.count({ where: { shopId: shop.id } }),
    itemName: item.name,
    batchRemaining: item.batches[0]?.remaining.toString(),
    movementType: movement.type,
    repackWastage: repack.wastageQty.toString(),
    consumptions: repack.consumptions.length,
    proposalStatus: proposal.status,
  });

  await prisma.proposal.delete({ where: { id: proposal.id } });
  await prisma.repackConsumption.deleteMany({ where: { repackId: repack.id } });
  await prisma.repack.delete({ where: { id: repack.id } });
  await prisma.stockMovement.delete({ where: { id: movement.id } });
  await prisma.stockBatch.deleteMany({ where: { itemId: item.id } });
  await prisma.item.delete({ where: { id: item.id } });
  await prisma.owner.deleteMany({ where: { shopId: shop.id } });
  await prisma.shop.delete({ where: { id: shop.id } });
}

main()
  .then(async () => {
    console.log('smoke ok');
    await closeDb();
  })
  .catch(async (error: unknown) => {
    console.error(error);
    await closeDb();
    process.exit(1);
  });
