import { supabase } from '@/integrations/supabase/client';

type ActivityAction = 
  | 'note_created' | 'note_updated' | 'note_deleted'
  | 'announcement_created' | 'announcement_deleted'
  | 'profile_updated' | 'password_changed' | 'avatar_updated'
  | 'user_registered' | 'user_login' | 'user_logout'
  | 'penalty_issued' | 'user_deleted';

export const logActivity = async (
  userId: string,
  userName: string,
  userEmail: string,
  action: ActivityAction,
  details?: string,
  entityType?: string,
  entityId?: string,
) => {
  try {
    await supabase.from('activity_logs').insert({
      user_id: userId,
      user_name: userName,
      user_email: userEmail,
      action,
      details,
      entity_type: entityType,
      entity_id: entityId,
    });
  } catch (e) {
    console.error('Activity log error:', e);
  }
};
