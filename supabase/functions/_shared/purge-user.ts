import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2';

export function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

async function purgeUserBucketPrefix(admin: SupabaseClient, bucket: string, prefix: string): Promise<void> {
  const queue = [prefix];
  let safetyIterations = 0;

  while (queue.length > 0 && safetyIterations < 30) {
    safetyIterations++;
    const currentPrefix = queue.shift()!;
    let offset = 0;
    while (offset < 5000) {
      const { data, error } = await admin.storage.from(bucket).list(currentPrefix, {
        limit: 200,
        offset,
      });
      if (error || !data || data.length === 0) break;

      const filePaths: string[] = [];
      for (const item of data) {
        const fullPath = `${currentPrefix}/${item.name}`;
        if (item.id === null) {
          queue.push(fullPath);
        } else {
          filePaths.push(fullPath);
        }
      }
      if (filePaths.length > 0) {
        await admin.storage.from(bucket).remove(filePaths).catch(() => {});
      }
      if (data.length < 200) break;
      offset += 200;
    }
  }
}

/**
 * Removes every row belonging to a user, their storage objects, and finally the
 * auth account itself.
 */
export async function purgeUser(admin: SupabaseClient, userId: string) {
  // Storage cleanup (best effort, handles nested folders & messages/study-reports prefixes)
  for (const [bucket, prefix] of [
    ['avatars', userId],
    ['notes', userId],
    ['notes', `messages/${userId}`],
    ['notes', `study-reports/${userId}`],
  ] as const) {
    try {
      await purgeUserBucketPrefix(admin, bucket, prefix);
    } catch {
      // ignore storage cleanup errors
    }
  }

  const ownTables = [
    'sms_2fa_sessions',
    'sms_2fa',
    'support_ticket_messages',
    'support_tickets',
    'note_password_unlocks',
    'xp_transactions',
    'lucky_wheel_spins',
    'daily_trivia_answers',
    'daily_trivia_attempts',
    'daily_trivia_user_sets',
    'daily_trivia_user_history',
    'daily_trivia_daily_assignments',
    'point_events',
    'user_points',
    'announcement_views',
    'note_views',
    'note_downloads',
    'study_summary_job_chunks',
    'study_summary_jobs',
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
    if (error) console.error(`purge ${table} failed`);
  }

  // Relations keyed by other columns
  const relationDeletes: Array<[string, string]> = [
    ['support_ticket_messages', 'sender_id'],
    ['messages', 'sender_id'],
    ['messages', 'receiver_id'],
    ['friend_requests', 'sender_id'],
    ['friend_requests', 'receiver_id'],
    ['user_blocks', 'blocker_id'],
    ['user_blocks', 'blocked_id'],
    ['message_reports', 'reporter_id'],
    ['message_reports', 'reported_user_id'],
  ];

  for (const [table, col] of relationDeletes) {
    const { error } = await admin.from(table).delete().eq(col, userId);
    if (error) console.error(`purge ${table}.${col} failed`);
  }

  const { error: authError } = await admin.auth.admin.deleteUser(userId);
  if (authError) throw new Error('AUTH_DELETE_FAILED');
}
