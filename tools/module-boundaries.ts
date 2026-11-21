import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

export interface Violation {
  rule: string;
  file: string;
  line: number;
  message: string;
}

export interface BoundaryRules {
  /** Emit a violation when code outside modules imports anything but public.ts. */
  deepImport: string;
  /** Emit a violation when Prisma is imported outside modules and the db module. */
  prismaConfinement: string;
  /** Emit a violation when a module's public.ts re-exports Prisma. */
  publicApiPurity: string;
  /** Emit a violation when packages/shared reaches into an app. */
  sharedIsALeaf: string;
}

export const defaultRules: BoundaryRules = {
  deepImport: 'module-deep-import',
  prismaConfinement: 'prisma-confinement',
  publicApiPurity: 'public-api-purity',
  sharedIsALeaf: 'shared-is-a-leaf',
};

const SCANNED_ROOTS = ['apps/api/src', 'apps/web/src', 'packages/shared/src'];

const MODULES = 'apps/api/src/modules';
const DB_FILE = 'apps/api/src/db.ts';

const PRISMA_SPECIFIERS = ['@prisma/client', '@prisma/adapter-pg', '@prisma/client/runtime/client'];

const RESOLVE_SUFFIXES = ['', '.ts', '.tsx', '/index.ts', '/index.tsx'];

function toPosix(value: string): string {
  return value.split(sep).join('/');
}

function walk(root: string): string[] {
  let entries: string[];

  try {
    entries = readdirSync(root);
  } catch {
    return [];
  }

  const files: string[] = [];

  for (const entry of entries) {
    const full = join(root, entry);
    const stats = statSync(full);

    if (stats.isDirectory()) {
      if (entry === 'generated' || entry === 'node_modules' || entry === 'dist') {
        continue;
      }
      files.push(...walk(full));
    } else if (/\.[cm]?tsx?$/.test(entry) && !/\.test\.[cm]?tsx?$/.test(entry)) {
      files.push(full);
    }
  }

  return files;
}

interface ImportedSpecifier {
  specifier: string;
  line: number;
}

function readImports(file: string): ImportedSpecifier[] {
  const source = readFileSync(file, 'utf8');
  const scriptKind = file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, scriptKind);
  const found: ImportedSpecifier[] = [];

  const lineOf = (node: ts.Node): number =>
    sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;

  const add = (node: ts.Node, specifier: string | undefined): void => {
    if (specifier) {
      found.push({ specifier, line: lineOf(node) });
    }
  };

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      add(node, node.moduleSpecifier.text);
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      add(node, node.moduleSpecifier.text);
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      const expression = node.moduleReference.expression;
      if (expression && ts.isStringLiteral(expression)) {
        add(node, expression.text);
      }
    } else if (ts.isCallExpression(node) && node.arguments.length === 1) {
      const [argument] = node.arguments;
      const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire = ts.isIdentifier(node.expression) && node.expression.text === 'require';
      if ((isDynamicImport || isRequire) && argument && ts.isStringLiteral(argument)) {
        add(node, argument.text);
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  return found;
}

function resolveLocalImport(fromFile: string, specifier: string): string | null {
  if (!specifier.startsWith('.')) {
    return null;
  }

  const base = resolve(dirname(fromFile), specifier);
  const withoutExtension = base.replace(/\.[cm]?jsx?$/, '');

  for (const suffix of RESOLVE_SUFFIXES) {
    const candidate = `${withoutExtension}${suffix}`;
    try {
      if (statSync(candidate).isFile()) {
        return candidate;
      }
    } catch {
      // try the next suffix
    }
  }

  return null;
}

function moduleOf(repoPath: string): { name: string; file: string } | null {
  const prefix = `${MODULES}/`;

  if (!repoPath.startsWith(prefix)) {
    return null;
  }

  const rest = repoPath.slice(prefix.length);
  const slash = rest.indexOf('/');

  if (slash === -1) {
    return null;
  }

  return { name: rest.slice(0, slash), file: rest.slice(slash + 1) };
}

function isPrismaSpecifier(specifier: string): boolean {
  return PRISMA_SPECIFIERS.includes(specifier);
}

/**
 * Checks the modular-monolith rules that regex-only rules cannot express,
 * because "same module" needs the importing file and the target compared.
 */
export function checkModuleBoundaries(
  repoRoot: string,
  rules: BoundaryRules = defaultRules,
): Violation[] {
  const violations: Violation[] = [];
  const files = SCANNED_ROOTS.flatMap((root) => walk(join(repoRoot, root)));

  for (const file of files) {
    const repoPath = toPosix(relative(repoRoot, file));
    const sourceModule = moduleOf(repoPath);

    for (const imported of readImports(file)) {
      const target = resolveLocalImport(file, imported.specifier);
      const resolvedPath = target ? toPosix(relative(repoRoot, target)) : null;
      // A missing file must not switch a rule off, so fall back to the path the
      // specifier points at.
      const fallbackPath = imported.specifier.startsWith('.')
        ? toPosix(relative(repoRoot, resolve(dirname(file), imported.specifier)))
        : null;
      const targetPath = resolvedPath ?? fallbackPath;
      const targetModule = targetPath ? moduleOf(targetPath) : null;

      if (targetPath && targetModule) {
        const isPublicEntry = targetModule.file === 'public.ts';

        if (!isPublicEntry) {
          const sameModule = sourceModule?.name === targetModule.name;
          if (!sameModule) {
            violations.push({
              rule: rules.deepImport,
              file: repoPath,
              line: imported.line,
              message: `imports ${targetPath}; only ${MODULES}/${targetModule.name}/public.ts may be imported`,
            });
          }
        }
      }

      const prismaTarget =
        isPrismaSpecifier(imported.specifier) ||
        (targetPath !== null && targetPath.startsWith('apps/api/src/generated/prisma/'));

      if (prismaTarget) {
        if (sourceModule && sourceModule.file === 'public.ts') {
          violations.push({
            rule: rules.publicApiPurity,
            file: repoPath,
            line: imported.line,
            message: `public.ts imports ${imported.specifier}; Prisma types must stay inside the module`,
          });
        } else if (!sourceModule && repoPath !== DB_FILE) {
          violations.push({
            rule: rules.prismaConfinement,
            file: repoPath,
            line: imported.line,
            message: `imports ${imported.specifier}; Prisma is allowed only inside modules and ${DB_FILE}`,
          });
        }
      }

      if (repoPath.startsWith('packages/shared/')) {
        const reachesIntoApp =
          (targetPath !== null && targetPath.startsWith('apps/')) ||
          imported.specifier.startsWith('@sauda/api') ||
          imported.specifier.startsWith('@sauda/web');

        if (reachesIntoApp) {
          violations.push({
            rule: rules.sharedIsALeaf,
            file: repoPath,
            line: imported.line,
            message: `shared imports ${imported.specifier}; shared contracts must not depend on an app`,
          });
        }
      }
    }
  }

  return violations.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

function main(): void {
  const repoRoot = resolve(process.argv[2] ?? '.');
  const violations = checkModuleBoundaries(repoRoot);

  if (violations.length === 0) {
    console.log('Module boundaries hold.');
    return;
  }

  for (const violation of violations) {
    console.error(`${violation.file}:${violation.line}  ${violation.rule}  ${violation.message}`);
  }

  console.error(`\n${violations.length} boundary violation(s). See docs/architecture.md.`);
  process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
