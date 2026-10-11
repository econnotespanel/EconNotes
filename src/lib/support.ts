export type SupportTicketStatus = 'submitted' | 'reviewing' | 'answered' | 'closed';

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
