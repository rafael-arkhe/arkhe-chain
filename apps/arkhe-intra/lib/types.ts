export type User = { id: string; name: string; email: string; role: 'author' | 'reviewer' | 'owner'; publicKey: string };
export type Signature = { actorId: string; action: string; statement: string; signature: string; publicKey: string; at: string };
export type Document = { id: string; title: string; body: string; department: string; authorId: string; revision: number; digest: string; state: string; createdAt: string; publishedAt?: string; signatures: Signature[]; receipt: Record<string, any> | null };
export type Dashboard = { documents: Document[]; tasks: Document[]; counts: { documents: number; published: number; pending: number; events: number }; auditIntegrity: boolean; rekorConfigured: boolean };
export type AuditEvent = { seq: number; previous: string; hash: string; event: { at: string; actor: string; action: string; documentId: string; details: Record<string, unknown> } };
export const stateNames: Record<string, string> = { draft: 'Rascunho', review: 'Em revisão', reviewed: 'Revisado', approved: 'Aprovado', anchoring: 'Reconciliação pendente', published: 'Publicado' };
