const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://sfgbftkteezptmvjgxrs.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNmZ2JmdGt0ZWV6cHRtdmpneHJzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE4MTMzMTMsImV4cCI6MjEwNzM4OTMxM30.g-Y7uXBpRBC3GTDyq93vAsTeFnrfQPfUEePn5Rn2GS0';

async function verifyAdminPanelSync() {
  console.log('='.repeat(70));
  console.log('EconNotes Admin Panel User Sync & Verification');
  console.log('='.repeat(70));

  const client = createClient(SUPABASE_URL, ANON_KEY);

  // 1. Sign in as Super Admin
  const { data: auth, error: loginErr } = await client.auth.signInWithPassword({
    email: 'kaancolakogullari1@gmail.com',
    password: 'EconNotesAdmin2026!'
  });
  if (loginErr) {
    console.error('Login failed:', loginErr.message);
    process.exit(1);
  }
  console.log('[OK] Signed in as Super Admin:', auth.user.email);

  // 2. Test admin-user-emails Edge Function
  const { data: emailData, error: emailErr } = await client.functions.invoke('admin-user-emails');
  if (emailErr) {
    console.error('admin-user-emails invocation failed:', emailErr);
    process.exit(1);
  }
  console.log('[OK] admin-user-emails returned:', emailData?.users?.length, 'accounts');
  (emailData?.users || []).forEach(u => {
    console.log(`  - ${u.id}: ${u.email} (confirmed: ${u.confirmed})`);
  });

  // 3. Query profiles
  const { data: profiles, error: profErr } = await client.from('profiles').select('*');
  if (profErr) {
    console.error('Profiles query failed:', profErr.message);
    process.exit(1);
  }
  console.log(`[OK] Profiles table returned: ${profiles.length} records`);

  // 4. Query user_roles
  const { data: roles, error: rolesErr } = await client.from('user_roles').select('*');
  if (rolesErr) {
    console.error('User roles query failed:', rolesErr.message);
    process.exit(1);
  }
  console.log(`[OK] User roles returned: ${roles.length} records`);
  roles.forEach(r => console.log(`  - ${r.user_id}: ${r.role}`));

  // 5. Check 1-to-1 matching
  const authIds = new Set((emailData?.users || []).map(u => u.id));
  const profileUserIds = new Set(profiles.map(p => p.user_id));
  const roleUserIds = new Set(roles.map(r => r.user_id));

  let inSync = true;
  for (const id of authIds) {
    if (!profileUserIds.has(id)) {
      console.warn(`[WARN] Auth user ${id} missing from profiles`);
      inSync = false;
    }
    if (!roleUserIds.has(id)) {
      console.warn(`[WARN] Auth user ${id} missing from user_roles`);
      inSync = false;
    }
  }

  if (inSync) {
    console.log('\n>>> SUCCESS: 100% of Auth users, Profiles, and Roles are synchronized! <<<');
  } else {
    console.error('\n>>> Discrepancies found! <<<');
  }
}

verifyAdminPanelSync();
