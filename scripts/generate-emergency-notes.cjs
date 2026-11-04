const fs = require('fs');
const https = require('https');
const path = require('path');

const apikey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh0am11em9nYXl5dWZld2lydmxwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2NDEwOTAsImV4cCI6MjA5MDIxNzA5MH0.IDqFOhUj0CGBjIrz85KGxAJEyXcOR-pS4UhwlZo9Juo';

async function main() {
  const notesRaw = JSON.parse(fs.readFileSync('backup/notes.json', 'utf8'));
  console.log('Total notes from backup:', notesRaw.length);

  // Authenticate to get signing token
  const email = 'signer_' + Date.now() + '@econnotes.online';
  const postData = JSON.stringify({ email: email, password: 'EconNotesBackupTest2026!' });

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
      res.on('end', () => resolve(JSON.parse(b).access_token));
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });

  console.log('Signer auth token acquired.');

  const emergencyNotes = [];
  const oneYearSeconds = 60 * 60 * 24 * 365;

  for (let i = 0; i < notesRaw.length; i++) {
    const note = notesRaw[i];
    let fileUrl = note.file_url;
    if (!fileUrl) continue;

    let storagePath = fileUrl;
    if (storagePath.includes('/storage/v1/object/public/notes/')) {
      storagePath = storagePath.split('/storage/v1/object/public/notes/')[1];
    } else if (storagePath.includes('/storage/v1/object/authenticated/notes/')) {
      storagePath = storagePath.split('/storage/v1/object/authenticated/notes/')[1];
    }
    storagePath = storagePath.replace(/^\/+/, '');

    const signPayload = JSON.stringify({ expiresIn: oneYearSeconds });
    const signedData = await new Promise((resolve) => {
      const signReq = https.request('https://htjmuzogayyufewirvlp.supabase.co/storage/v1/object/sign/notes/' + storagePath, {
        method: 'POST',
        headers: {
          'apikey': apikey,
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(signPayload)
        }
      }, (sRes) => {
        let sb = '';
        sRes.on('data', d => sb += d);
        sRes.on('end', () => {
          try {
            resolve(JSON.parse(sb));
          } catch(e) {
            resolve(null);
          }
        });
      });
      signReq.on('error', () => resolve(null));
      signReq.write(signPayload);
      signReq.end();
    });

    let directDownloadUrl = '';
    if (signedData && signedData.signedURL) {
      directDownloadUrl = 'https://htjmuzogayyufewirvlp.supabase.co/storage/v1' + signedData.signedURL;
    }

    // Check local file size in backup/pdf_notes if exists
    let fileSizeStr = '';
    const safeTitle = (note.title || 'note_' + note.id).replace(/[^a-zA-Z0-9çğıöşüÇĞİÖŞÜ _-]/g, '_').slice(0, 50).trim();
    const ext = path.extname(fileUrl) || (note.file_name ? path.extname(note.file_name) : '.pdf');
    const localName = String(i + 1).padStart(2, '0') + '_' + safeTitle + ext;
    const localPath = path.join('backup/pdf_notes', localName);
    if (fs.existsSync(localPath)) {
      const bytes = fs.statSync(localPath).size;
      fileSizeStr = bytes > 1024 * 1024 ? (bytes / 1024 / 1024).toFixed(1) + ' MB' : (bytes / 1024).toFixed(0) + ' KB';
    }

    emergencyNotes.push({
      id: note.id,
      title: note.title,
      description: note.description || '',
      department: note.department || 'İktisat',
      grade: Number(note.grade) || 2,
      course: note.course || note.title,
      semester: note.semester || 'Dönem Notu',
      fileName: note.file_name || (note.title + '.pdf'),
      fileType: note.file_type || 'application/pdf',
      fileSize: fileSizeStr,
      downloadUrl: directDownloadUrl,
      uploaderName: note.uploader_name || 'EconNotes Arşivi',
      createdAt: note.created_at
    });

    console.log('[' + (i + 1) + '/33] Signed: ' + note.title + ' (' + fileSizeStr + ') -> ' + !!directDownloadUrl);
  }

  // Ensure src/data exists
  if (!fs.existsSync('src/data')) fs.mkdirSync('src/data', { recursive: true });

  const tsContent = `// Otomatik olusturulan acil ders notlari arsivi (Vize Donemi Ozel)
// Veritabani ve giris servisleri bakimdayken ogrencilerin sinavlara kesintisiz calisabilmesi icin dogrudan erisim saglar.

export interface EmergencyNote {
  id: string;
  title: string;
  description: string;
  department: string;
  grade: number;
  course: string;
  semester: string;
  fileName: string;
  fileType: string;
  fileSize: string;
  downloadUrl: string;
  uploaderName: string;
  createdAt: string;
}

export const EMERGENCY_NOTES: EmergencyNote[] = ${JSON.stringify(emergencyNotes, null, 2)};
`;

  fs.writeFileSync('src/data/emergencyNotes.ts', tsContent, 'utf8');
  console.log('Saved src/data/emergencyNotes.ts with', emergencyNotes.length, 'notes.');
}

main().catch(console.error);
