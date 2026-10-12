export type SupportTicketStatus = 'submitted' | 'reviewing' | 'answered' | 'closed';
export type SupportTicketCategory = 'technical' | 'suggestion' | 'complaint' | 'account' | 'other';

export const SUPPORT_MESSAGE_PREFIX = '[econnotes-support-v1]';

export type SupportMessagePayload =
  | {
      version: 1;
      ticketId: string;
      kind: 'ticket';
      category: SupportTicketCategory;
      subject: string;
      message: string;
    }
  | {
      version: 1;
      ticketId: string;
      kind: 'reply';
      message: string;
    }
  | {
      version: 1;
      ticketId: string;
      kind: 'status';
      status: 'reviewing' | 'closed';
    };

const categories: SupportTicketCategory[] = ['technical', 'suggestion', 'complaint', 'account', 'other'];

export const encodeSupportMessage = (payload: SupportMessagePayload) =>
  `${SUPPORT_MESSAGE_PREFIX}${JSON.stringify(payload)}`;

export const parseSupportMessage = (content: string): SupportMessagePayload | null => {
  if (!content.startsWith(SUPPORT_MESSAGE_PREFIX)) return null;
  try {
    const payload: unknown = JSON.parse(content.slice(SUPPORT_MESSAGE_PREFIX.length));
    if (!payload || typeof payload !== 'object') return null;
    const value = payload as Record<string, unknown>;
    if (value.version !== 1 || typeof value.ticketId !== 'string' || !value.ticketId) return null;
    if (value.kind === 'ticket') {
      if (
        typeof value.category !== 'string' ||
        !categories.includes(value.category as SupportTicketCategory) ||
        typeof value.subject !== 'string' ||
        typeof value.message !== 'string'
      ) return null;
      return value as SupportMessagePayload;
    }
    if (value.kind === 'reply' && typeof value.message === 'string') {
      return value as SupportMessagePayload;
    }
    if (value.kind === 'status' && (value.status === 'reviewing' || value.status === 'closed')) {
      return value as SupportMessagePayload;
    }
    return null;
  } catch {
    return null;
  }
};

export const getSupportMessageBody = (content: string) => {
  const payload = parseSupportMessage(content);
  if (!payload) return content;
  if (payload.kind === 'status') return payload.status === 'closed' ? 'Talep kapatıldı.' : 'Talep incelemeye alındı.';
  return payload.message;
};

export const isSupportMessageValid = (message: string) => message.trim().length > 0 && message.length <= 5000;

export const getAssignedSupportAdmin = (userId: string, adminIds: string[]) => {
  if (adminIds.length === 0) return null;
  const sortedAdminIds = [...new Set(adminIds)].sort();
  let hash = 0;
  for (const character of userId) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return sortedAdminIds[hash % sortedAdminIds.length];
};

export const getSupportTicketStage = (
  status: SupportTicketStatus,
  firstResponseAt: string | null,
  reviewingAt: string | null,
) => {
  if (status === 'closed') return firstResponseAt ? 2 : reviewingAt ? 1 : 0;
  if (status === 'answered') return 2;
  if (status === 'reviewing') return 1;
  return 0;
};
