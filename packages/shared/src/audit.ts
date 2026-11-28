import { z } from 'zod';

export const auditSourceSchema = z.enum(['TOUCH', 'VOICE', 'SYSTEM']);

export const auditEntrySchema = z.object({
  id: z.string().min(1),
  ownerId: z.string().nullable(),
  source: auditSourceSchema,
  operation: z.string().min(1),
  entityType: z.string().min(1),
  entityId: z.string().min(1),
  before: z.unknown().nullable(),
  after: z.unknown().nullable(),
  createdAt: z.iso.datetime(),
});

export const auditListSchema = z.object({
  entries: z.array(auditEntrySchema),
});

export type AuditEntryDto = z.infer<typeof auditEntrySchema>;
