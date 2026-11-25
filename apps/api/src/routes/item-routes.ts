import { Router } from 'express';
import { itemInputSchema, itemUpdateSchema, type ItemWithStockDto } from '@sauda/shared';
import { actorOf } from '../middleware/actor.js';
import { itemsService, type ItemsService } from '../modules/items/public.js';
import { stockService, type StockService } from '../modules/stock/public.js';

/**
 * The route is the composition layer: items live in one module and stock in
 * another, and only the HTTP response needs both.
 */
export function createItemRouter(
  items: ItemsService = itemsService,
  stock: StockService = stockService,
): Router {
  const router = Router();

  async function withStock(shopId: string, itemsDto: Awaited<ReturnType<ItemsService['list']>>) {
    const onHand = await stock.onHandByShop(shopId);

    return itemsDto.map<ItemWithStockDto>((item) => ({
      ...item,
      stockOnHand: onHand.get(item.id) ?? 0,
    }));
  }

  router.get('/', async (request, response) => {
    const { shopId } = actorOf(request);
    const list = await items.list(shopId);
    response.json({ items: await withStock(shopId, list) });
  });

  router.get('/:itemId', async (request, response) => {
    const { shopId } = actorOf(request);
    const item = await items.get(shopId, request.params.itemId);
    const onHand = await stock.onHand(shopId, item.id);
    response.json({ item: { ...item, stockOnHand: onHand } });
  });

  router.post('/', async (request, response) => {
    const actor = actorOf(request);
    const input = itemInputSchema.parse(request.body);
    const item = await items.create(actor, input);
    response.status(201).json({ item: { ...item, stockOnHand: 0 } });
  });

  router.patch('/:itemId', async (request, response) => {
    const actor = actorOf(request);
    const patch = itemUpdateSchema.parse(request.body);
    const item = await items.update(actor, request.params.itemId, patch);
    const onHand = await stock.onHand(actor.shopId, item.id);
    response.json({ item: { ...item, stockOnHand: onHand } });
  });

  router.delete('/:itemId', async (request, response) => {
    const actor = actorOf(request);
    await items.archive(actor, request.params.itemId);
    response.status(204).end();
  });

  return router;
}
