export class ShopExistsError extends Error {
  constructor() {
    super('A shop already uses that name');
    this.name = 'ShopExistsError';
  }
}