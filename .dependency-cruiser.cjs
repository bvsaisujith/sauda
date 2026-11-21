/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment:
        'Import cycles are resolved by moving shared contracts into packages/shared, never by importing internals.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'shared-is-a-leaf',
      severity: 'error',
      comment: 'packages/shared holds contracts only; it must not depend on an app or another package.',
      from: { path: '^packages/shared/' },
      to: { path: '^(apps/|packages/(?!shared/))' },
    },
    {
      name: 'web-never-imports-server',
      severity: 'error',
      comment: 'The web app talks to the API over HTTP only.',
      from: { path: '^apps/web/' },
      to: { path: '^(apps/api/|node_modules/@prisma/)' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(\\.test\\.tsx?$|/dist/|/src/generated/|^tools/)' },
    tsPreCompilationDeps: true,
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
};
