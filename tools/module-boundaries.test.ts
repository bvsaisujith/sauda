import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { checkModuleBoundaries } from './module-boundaries.js';

const tempRoots: string[] = [];

function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'sauda-boundaries-'));
  tempRoots.push(root);

  for (const [path, contents] of Object.entries(files)) {
    const full = join(root, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, contents, 'utf8');
  }

  return root;
}

const base = {
  'apps/api/src/modules/items/public.ts': [
    "export { createItem } from './items-service.js';",
    '',
  ].join('\n'),
  'apps/api/src/modules/items/items-service.ts': [
    "import { db } from '../../db.js';",
    "import { readRepo } from './items-repo.js';",
    'export function createItem(): unknown {',
    '  return [db, readRepo];',
    '}',
    '',
  ].join('\n'),
  'apps/api/src/modules/items/items-repo.ts': [
    "import { db } from '../../db.js';",
    'export const readRepo = db;',
    '',
  ].join('\n'),
  'apps/api/src/db.ts': [
    "import { PrismaClient } from './generated/prisma/client.js';",
    'export const db = PrismaClient;',
    '',
  ].join('\n'),
};

afterAll(() => {
  for (const root of tempRoots) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('module boundaries', () => {
  it('allows imports of a module public.ts and same-module internals', () => {
    const root = fixture({
      ...base,
      'apps/api/src/routes/items-routes.ts': [
        "import { createItem } from '../modules/items/public.js';",
        'export const route = createItem;',
        '',
      ].join('\n'),
    });

    expect(checkModuleBoundaries(root)).toEqual([]);
  });

  it('rejects a deep import from outside the module and names the file', () => {
    const root = fixture({
      ...base,
      'apps/api/src/routes/items-routes.ts': [
        "import { createItem } from '../modules/items/items-service.js';",
        'export const route = createItem;',
        '',
      ].join('\n'),
    });

    const violations = checkModuleBoundaries(root);

    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({
      rule: 'module-deep-import',
      file: 'apps/api/src/routes/items-routes.ts',
      line: 1,
    });
    expect(violations[0]?.message).toContain('apps/api/src/modules/items/public.ts');
  });

  it('rejects one module importing another module internals', () => {
    const root = fixture({
      ...base,
      'apps/api/src/modules/sales/public.ts': [
        "import { createItem } from '../items/items-service.js';",
        'export const sell = createItem;',
        '',
      ].join('\n'),
    });

    const violations = checkModuleBoundaries(root);

    expect(violations.map((violation) => violation.rule)).toEqual(['module-deep-import']);
    expect(violations[0]?.file).toBe('apps/api/src/modules/sales/public.ts');
  });

  it('allows modules to call each other through public.ts', () => {
    const root = fixture({
      ...base,
      'apps/api/src/modules/sales/public.ts': [
        "import { createItem } from '../items/public.js';",
        'export const sell = createItem;',
        '',
      ].join('\n'),
    });

    expect(checkModuleBoundaries(root)).toEqual([]);
  });

  it('allows dynamic imports and re-exported internals only through public.ts', () => {
    const root = fixture({
      ...base,
      'apps/api/src/routes/items-routes.ts': [
        "export async function load() {",
        "  return import('../modules/items/items-service.js');",
        '}',
        '',
      ].join('\n'),
    });

    expect(checkModuleBoundaries(root).map((violation) => violation.rule)).toEqual([
      'module-deep-import',
    ]);
  });

  it('keeps Prisma inside modules and db.ts', () => {
    const root = fixture({
      ...base,
      'apps/api/src/app.ts': [
        "import { PrismaClient } from '@prisma/client';",
        'export const client = PrismaClient;',
        '',
      ].join('\n'),
      'apps/api/src/modules/items/public.ts': [
        "import type { Item } from '../../generated/prisma/client.js';",
        'export type PublicItem = Item;',
        '',
      ].join('\n'),
    });

    const rules = checkModuleBoundaries(root).map((violation) => violation.rule);

    expect(rules).toEqual(['prisma-confinement', 'public-api-purity']);
  });

  it('keeps packages/shared independent of the apps', () => {
    const root = fixture({
      'packages/shared/src/index.ts': [
        "import { healthPayload } from '../../../apps/api/src/health.js';",
        'export const health = healthPayload;',
        '',
      ].join('\n'),
      'apps/api/src/health.ts': 'export const healthPayload = () => 1;\n',
    });

    const violations = checkModuleBoundaries(root);

    expect(violations.map((violation) => violation.rule)).toEqual(['shared-is-a-leaf']);
  });

  it('passes on this repository', { timeout: 30_000 }, () => {
    expect(checkModuleBoundaries(resolve('.')).map((violation) => `${violation.file}: ${violation.rule}`)).toEqual([]);
  });
});
