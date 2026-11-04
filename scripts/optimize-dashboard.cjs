const fs = require('fs');

let code = fs.readFileSync('src/pages/Dashboard.tsx', 'utf8');
const normalized = code.replace(/\r\n/g, '\n');

const searchStr = `    const fetchData = async () => {
      try {
        const [notesRes, announcementsRes, settingsRes, bannersRes] = await Promise.all([
          supabase.from('notes').select(NOTE_SELECT, { count: 'exact' }).order('created_at', { ascending: false }),
          supabase.from('announcements').select('*', { count: 'exact' }).order('created_at', { ascending: false }),
          supabase.from('public_system_status').select('*').limit(1).maybeSingle(),
          supabase.from('banners').select('*').eq('is_active', true).order('created_at', { ascending: false }),
        ]);
        setStats({ notes: notesRes.count || 0, announcements: announcementsRes.count || 0 });
        setRecentNotes(notesRes.data || []);
        setRecentAnnouncements(announcementsRes.data || []);
        setBanners(bannersRes.data || []);
        if (settingsRes.data) {
          setAcademicWeek({
            week: (settingsRes.data as any).academic_week,
            label: (settingsRes.data as any).academic_week_label,
            semester: (settingsRes.data as any).academic_semester,
          });
        }
      } catch (err) {
        console.error('Dashboard verileri yüklenirken hata:', err);
      } finally {
        setLoading(false);
      }
    };`;

const replaceStr = `    const fetchData = async () => {
      try {
        const results = await Promise.allSettled([
          supabase.from('notes').select(NOTE_SELECT, { count: 'exact' }).order('created_at', { ascending: false }),
          supabase.from('announcements').select('*', { count: 'exact' }).order('created_at', { ascending: false }),
          supabase.from('public_system_status').select('*').limit(1).maybeSingle(),
          supabase.from('banners').select('*').eq('is_active', true).order('created_at', { ascending: false }),
        ]);

        const notesRes = results[0].status === 'fulfilled' ? results[0].value : { count: 0, data: [] };
        const announcementsRes = results[1].status === 'fulfilled' ? results[1].value : { count: 0, data: [] };
        const settingsRes = results[2].status === 'fulfilled' ? results[2].value : { data: null };
        const bannersRes = results[3].status === 'fulfilled' ? results[3].value : { data: [] };

        setStats({ notes: (notesRes as any).count || 0, announcements: (announcementsRes as any).count || 0 });
        setRecentNotes((notesRes as any).data || []);
        setRecentAnnouncements((announcementsRes as any).data || []);
        setBanners((bannersRes as any).data || []);
        if (settingsRes && (settingsRes as any).data) {
          setAcademicWeek({
            week: ((settingsRes as any).data as any).academic_week,
            label: ((settingsRes as any).data as any).academic_week_label,
            semester: ((settingsRes as any).data as any).academic_semester,
          });
        }
      } catch (err) {
        console.error('Dashboard verileri yüklenirken hata:', err);
      } finally {
        setLoading(false);
      }
    };`;

if (normalized.includes(searchStr)) {
  const updated = normalized.replace(searchStr, replaceStr);
  fs.writeFileSync('src/pages/Dashboard.tsx', updated, 'utf8');
  console.log('Successfully updated Dashboard.tsx!');
} else {
  console.error('searchStr not found!');
}
