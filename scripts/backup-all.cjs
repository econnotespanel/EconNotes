const fs = require('fs');
const https = require('https');
const path = require('path');

const apikey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh0am11em9nYXl5dWZld2lydmxwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2NDEwOTAsImV4cCI6MjA5MDIxNzA5MH0.IDqFOhUj0CGBjIrz85KGxAJEyXcOR-pS4UhwlZo9Juo';

async function main() {
  const backupDir = path.join(process.cwd(), 'backup');
  const pdfDir = path.join(backupDir, 'pdf_notes');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
  if (!fs.existsSync(pdfDir)) fs.mkdirSync(pdfDir, { recursive: true });

  console.log('1. Signing up temporary auth user to get valid token...');
  const email = 'backup_agent_' + Date.now() + '@econnotes.online';
  const postData = JSON.stringify({ email: email, password: 'EconNotesBackupLive2026!' });

  const token = await new Promise((resolve, reject) => {
    const req = https.request('https://htjmuzogayyufewirvlp.supabase.co/auth/v1/signup', {
      method: 'POST',
      headers: {
        'apikey': apikey,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, (res) => {
      let b = '';
      res.on('data', d => b += d);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(b);
          if (parsed.access_token) resolve(parsed.access_token);
          else reject(new Error('No access_token: ' + b));
        } catch(e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });

  console.log('Auth token acquired successfully.');

  function getJson(urlPath) {
    return new Promise((resolve, reject) => {
      https.get('https://htjmuzogayyufewirvlp.supabase.co' + urlPath, {
        headers: { 'apikey': apikey, 'Authorization': 'Bearer ' + token }
      }, (res) => {
        let b = '';
        res.on('data', d => b += d);
        res.on('end', () => {
          try {
            resolve(JSON.parse(b));
          } catch(e) {
            resolve(b);
          }
        });
      }).on('error', reject);
    });
  }

  function downloadFile(url, destPath) {
    return new Promise((resolve, reject) => {
      const fileStream = fs.createWriteStream(destPath);
      https.get(url, {
        headers: { 'apikey': apikey, 'Authorization': 'Bearer ' + token }
      }, (res) => {
        if (res.statusCode !== 200) {
          fileStream.close();
          if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
          return reject(new Error('Status ' + res.statusCode));
        }
        res.pipe(fileStream);
        fileStream.on('finish', () => {
          fileStream.close();
          resolve();
        });
      }).on('error', (err) => {
        fileStream.close();
        if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
        reject(err);
      });
    });
  }

  console.log('2. Fetching Notes metadata...');
  const cols = 'id,user_id,title,description,grade,department,course,semester,file_url,file_name,file_type,uploader_name,created_at,university,status';
  const notes = await getJson('/rest/v1/notes?select=' + encodeURIComponent(cols) + '&order=created_at.asc');
  fs.writeFileSync(path.join(backupDir, 'notes.json'), JSON.stringify(notes, null, 2), 'utf8');
  console.log(`Saved ${notes.length} notes metadata to backup/notes.json`);

  console.log('3. Fetching Announcements...');
  const announcements = await getJson('/rest/v1/announcements?select=*&order=created_at.asc');
  fs.writeFileSync(path.join(backupDir, 'announcements.json'), JSON.stringify(announcements, null, 2), 'utf8');
  console.log(`Saved ${announcements.length} announcements to backup/announcements.json`);

  console.log('4. Fetching Banners...');
  const banners = await getJson('/rest/v1/banners?select=*');
  fs.writeFileSync(path.join(backupDir, 'banners.json'), JSON.stringify(banners, null, 2), 'utf8');
  console.log(`Saved ${banners.length} banners to backup/banners.json`);

  console.log('5. Fetching Site Config...');
  const siteConfig = await getJson('/rest/v1/site_config?select=*');
  fs.writeFileSync(path.join(backupDir, 'site_config.json'), JSON.stringify(siteConfig, null, 2), 'utf8');
  console.log('Saved site_config to backup/site_config.json');

  console.log('6. Downloading Note PDFs...');
  let downloadedCount = 0;
  let failedCount = 0;

  for (let i = 0; i < notes.length; i++) {
    const note = notes[i];
    let fileUrl = note.file_url;
    if (!fileUrl) {
      console.log(`[${i + 1}/${notes.length}] Skipped (no file_url): ${note.title}`);
      continue;
    }

    let downloadUrl;
    if (fileUrl.startsWith('http')) {
      downloadUrl = fileUrl.replace('/storage/v1/object/public/notes/', '/storage/v1/object/authenticated/notes/');
    } else {
      downloadUrl = `https://htjmuzogayyufewirvlp.supabase.co/storage/v1/object/authenticated/notes/${fileUrl.replace(/^\/+/, '')}`;
    }
    // Sanitize filename for Windows
    const ext = path.extname(fileUrl) || (note.file_name ? path.extname(note.file_name) : '.pdf');
    const safeTitle = (note.title || 'note_' + note.id).replace(/[^a-zA-Z0-9çğıöşüÇĞİÖŞÜ _-]/g, '_').slice(0, 50).trim();
    const fileName = `${String(i + 1).padStart(2, '0')}_${safeTitle}${ext}`;
    const targetPath = path.join(pdfDir, fileName);

    try {
      await downloadFile(downloadUrl, targetPath);
      const stat = fs.statSync(targetPath);
      console.log(`[${i + 1}/${notes.length}] Downloaded: ${fileName} (${(stat.size / 1024).toFixed(1)} KB)`);
      downloadedCount++;
    } catch(err) {
      console.error(`[${i + 1}/${notes.length}] FAILED: ${note.title} (${downloadUrl}) - ${err.message}`);
      failedCount++;
    }
  }

  // Also create a combined package in user Downloads for ease of use
  const downloadsDir = 'C:\\Users\\Kaan Çolakoğlu\\Downloads';
  const fullBackupJsonPath = path.join(downloadsDir, 'EconNotes_Full_Database_Backup.json');
  const fullBackup = {
    exportedAt: new Date().toISOString(),
    sourceProject: 'htjmuzogayyufewirvlp',
    counts: {
      notes: notes.length,
      announcements: announcements.length,
      banners: banners.length,
      pdfsDownloaded: downloadedCount
    },
    notes: notes,
    announcements: announcements,
    banners: banners,
    siteConfig: siteConfig
  };
  fs.writeFileSync(fullBackupJsonPath, JSON.stringify(fullBackup, null, 2), 'utf8');
  console.log(`\nCreated full unified JSON backup at: ${fullBackupJsonPath}`);

  console.log(`\n========================================`);
  console.log(`           BACKUP COMPLETED             `);
  console.log(`========================================`);
  console.log(`Notes count: ${notes.length}`);
  console.log(`Announcements count: ${announcements.length}`);
  console.log(`Banners count: ${banners.length}`);
  console.log(`PDFs successfully saved: ${downloadedCount} / ${notes.length}`);
  console.log(`PDFs failed: ${failedCount}`);
  console.log(`Local backup directory: ${backupDir}`);
  console.log(`========================================\n`);
}

main().catch(console.error);
