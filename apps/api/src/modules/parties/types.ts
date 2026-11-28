import type { PartyInput, PartyType, PartyUpdate } from '@sauda/shared';

export type PartySource = 'TOUCH' | 'VOICE' | 'SYSTEM';

export interface PartyActor {
  shopId: string;
  ownerId: string;
  source: PartySource;
}

export interface PartyRecord {
  id: string;
  type: PartyType;
  name: string;
  phone: string | null;
  address: string | null;
  notes: string | null;
  archivedAt: Date | null;
}

export interface PartyAuditWrite {
  shopId: string;
  ownerId: string;
  source: PartySource;
  operation: string;
  entityId: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}

export interface PartyStore {
  list(shopId: string, options: { type?: PartyType }): Promise<PartyRecord[]>;
  find(shopId: string, partyId: string): Promise<PartyRecord | null>;
  create(shopId: string, input: PartyInput): Promise<PartyRecord>;
  update(shopId: string, partyId: string, patch: PartyUpdate): Promise<PartyRecord>;
  archive(shopId: string, partyId: string, at: Date): Promise<void>;
  recordAudit(entry: PartyAuditWrite): Promise<void>;
}
