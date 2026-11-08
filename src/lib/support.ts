export type SupportTicketStatus = 'submitted' | 'reviewing' | 'answered' | 'closed';
export type SupportTicketCategory = 'technical' | 'suggestion' | 'complaint' | 'account' | 'other';
export type SupportTicketInitiator = 'user' | 'admin';

export const SUPPORT_MESSAGE_PREFIX = '[econnotes-support-v1]';

export type SupportMessagePayload =
  | {
      version: 1;
      ticketId: string;
      kind: 'ticket';
      category: SupportTicketCategory;
      subject: string;
      message: string;
      initiatedBy?: SupportTicketInitiator;
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
    }
  | {
      version: 1;
      ticketId: string;
      kind: 'deleted';
    };

export interface SupportMessageRowLike {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  created_at: string;
  is_read?: boolean;
}

export interface SupportTicketRecord {
  id: string;
  userId: string;
  adminId: string;
  initiatedBy: SupportTicketInitiator;
  category: SupportTicketCategory;
  subject: string;
  initialMessage: string;
  createdAt: string;
  updatedAt: string;
  status: SupportTicketStatus;
  reviewingAt: string | null;
  firstResponseAt: string | null;
  closedAt: string | null;
  hasUnread: boolean;
  unreadRowIds: string[];
  replies: {
    id: string;
    senderId: string;
    content: string;
    createdAt: string;
    kind: 'reply' | 'status';
  }[];
}

const categories: SupportTicketCategory[] = ['technical', 'suggestion', 'complaint', 'account', 'other'];

export const isSupportSystemMessage = (content: string): boolean =>
  typeof content === 'string' && content.startsWith(SUPPORT_MESSAGE_PREFIX);

export const encodeSupportMessage = (payload: SupportMessagePayload) =>
  `${SUPPORT_MESSAGE_PREFIX}${JSON.stringify(payload)}`;

export const parseSupportMessage = (content: string): SupportMessagePayload | null => {
  if (!isSupportSystemMessage(content)) return null;
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
      if (
        value.initiatedBy !== undefined &&
        value.initiatedBy !== 'user' &&
        value.initiatedBy !== 'admin'
      ) {
        return null;
      }
      return value as SupportMessagePayload;
    }
    if (value.kind === 'reply' && typeof value.message === 'string') {
      return value as SupportMessagePayload;
    }
    if (value.kind === 'status' && (value.status === 'reviewing' || value.status === 'closed')) {
      return value as SupportMessagePayload;
    }
    if (value.kind === 'deleted') return value as SupportMessagePayload;
    return null;
  } catch {
    return null;
  }
};

export const getSupportMessageBody = (content: string) => {
  const payload = parseSupportMessage(content);
  if (!payload) return content;
  if (payload.kind === 'deleted') return '';
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

const isTicketPayload = (
  payload: SupportMessagePayload,
): payload is Extract<SupportMessagePayload, { kind: 'ticket' }> => payload.kind === 'ticket';

/**
 * Reconstructs Destek Merkezi conversations from `[econnotes-support-v1]` rows only.
 * Regular private/friend messages never carry `SUPPORT_MESSAGE_PREFIX` and are strictly ignored,
 * ensuring personal `Mesajlar` chats never appear in `Destek Merkezi`.
 * Supports both user-initiated tickets and admin-initiated conversations (`initiatedBy: 'admin'`).
 */
export const buildSupportTickets = (
  rows: SupportMessageRowLike[],
  adminView: boolean,
  currentUserId: string,
  verifiedAdminIds?: string[],
): SupportTicketRecord[] => {
  const orderedRows = [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const tickets = new Map<string, SupportTicketRecord>();

  for (const row of orderedRows) {
    const payload = parseSupportMessage(row.content);
    if (!payload || !isTicketPayload(payload)) continue;
    if (row.sender_id === row.receiver_id) continue;

    const initiatedBy: SupportTicketInitiator = payload.initiatedBy === 'admin' ? 'admin' : 'user';
    if (
      initiatedBy === 'admin' &&
      verifiedAdminIds &&
      !verifiedAdminIds.includes(row.sender_id)
    ) {
      continue;
    }
    const userId = initiatedBy === 'admin' ? row.receiver_id : row.sender_id;
    const adminId = initiatedBy === 'admin' ? row.sender_id : row.receiver_id;

    if (adminView ? adminId !== currentUserId : userId !== currentUserId) continue;

    const isUnreadForCurrentUser = row.is_read === false && row.receiver_id === currentUserId;

    tickets.set(payload.ticketId, {
      id: payload.ticketId,
      userId,
      adminId,
      initiatedBy,
      category: payload.category,
      subject: payload.subject,
      initialMessage: payload.message,
      createdAt: row.created_at,
      updatedAt: row.created_at,
      status: 'submitted',
      reviewingAt: null,
      firstResponseAt: null,
      closedAt: null,
      hasUnread: isUnreadForCurrentUser,
      unreadRowIds: isUnreadForCurrentUser ? [row.id] : [],
      replies: [],
    });
  }

  for (const row of orderedRows) {
    const payload = parseSupportMessage(row.content);
    if (!payload || isTicketPayload(payload)) continue;
    const ticket = tickets.get(payload.ticketId);
    if (!ticket) continue;

    const validParticipant =
      (row.sender_id === ticket.userId || row.sender_id === ticket.adminId) &&
      (row.receiver_id === ticket.userId || row.receiver_id === ticket.adminId);
    if (!validParticipant) continue;

    if (payload.kind === 'deleted') {
      if (row.sender_id === ticket.adminId) {
        tickets.delete(ticket.id);
      }
      continue;
    }

    if (row.is_read === false && row.receiver_id === currentUserId) {
      ticket.hasUnread = true;
      ticket.unreadRowIds.push(row.id);
    }
    ticket.updatedAt = row.created_at;

    if (payload.kind === 'status') {
      if (row.sender_id !== ticket.adminId) continue;
      ticket.status = payload.status;
      if (payload.status === 'reviewing') ticket.reviewingAt ??= row.created_at;
      else ticket.closedAt = row.created_at;
      ticket.replies.push({
        id: row.id,
        senderId: row.sender_id,
        content: row.content,
        createdAt: row.created_at,
        kind: 'status',
      });
    } else {
      ticket.replies.push({
        id: row.id,
        senderId: row.sender_id,
        content: row.content,
        createdAt: row.created_at,
        kind: 'reply',
      });
      if (row.sender_id === ticket.adminId) {
        ticket.firstResponseAt ??= row.created_at;
        ticket.status = 'answered';
      } else if (
        ticket.status === 'answered' ||
        (ticket.initiatedBy === 'admin' && ticket.status === 'submitted')
      ) {
        ticket.status = 'reviewing';
        ticket.reviewingAt ??= row.created_at;
      }
    }
  }

  return [...tickets.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
};
