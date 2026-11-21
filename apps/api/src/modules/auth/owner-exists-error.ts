export class OwnerExistsError extends Error {
  constructor() {
    super('An owner already exists');
    this.name = 'OwnerExistsError';
  }
}
