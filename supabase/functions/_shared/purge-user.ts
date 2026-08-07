import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2';

export function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

/**
 * Removes every row belonging to a user, their storage objects, and finally the
 * auth account itself.
 */
export async function purgeUser(admin: SupabaseClient, userId: string) {
  // Storage cleanup (best effort)
  for (const bucket of ['avatars', 'notes']) {
    try {
      const { data } = await admin.storage.from(bucket).list(userId, { limit: 1000 });
      if (data?.length) {
        await admin.storage.from(bucket).remove(data.map((f) => `${userId}/${f.name}`));
      }
    } catch (_) {
      // ignore
    }
  }

  const ownTables = [
    'point_events',
    'user_points',
    'announcement_views',
    'note_views',
    'note_downloads',
    'study_progress',
    'study_reports',
    'study_materials',
    'kpss_attempts',
    'kpss_goals',
    'kpss_presets',
    'kpss_reviews',
    'kpss_materials',
    'comments',
    'activity_logs',
    'notes',
    'announcements',
    'banners',
    'penalties',
    'user_roles',
    'profiles',
  ];

  for (const table of ownTables) {
    const { error } = await admin.from(table).delete().eq('user_id', userId);
    if (error) console.error(`purge ${table}:`, error.message);
  }

  // Relations keyed by other columns
  await admin.from('messages').delete().eq('sender_id', userId);
  await admin.from('messages').delete().eq('receiver_id', userId);
  await admin.from('friend_requests').delete().eq('sender_id', userId);
  await admin.from('friend_requests').delete().eq('receiver_id', userId);
  await admin.from('user_blocks').delete().eq('blocker_id', userId);
  await admin.from('user_blocks').delete().eq('blocked_id', userId);
  await admin.from('message_reports').delete().eq('reporter_id', userId);
  await admin.from('message_reports').delete().eq('reported_user_id', userId);
  await admin.from('penalties').delete().eq('issued_by', userId);

  const { error: authError } = await admin.auth.admin.deleteUser(userId);
  if (authError) throw new Error(authError.message);
}
