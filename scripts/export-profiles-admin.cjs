const fs = require('fs');
const https = require('https');
const path = require('path');

const apikey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh0am11em9nYXl5dWZld2lydmxwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2NDEwOTAsImV4cCI6MjA5MDIxNzA5MH0.IDqFOhUj0CGBjIrz85KGxAJEyXcOR-pS4UhwlZo9Juo';

async function main() {
  const email = process.argv[2];
  const password = process.argv[3];

  if (!email || !password) {
    console.log('Kullanım: node scripts/export-profiles-admin.cjs <admin_email> <admin_password>');
    console.log('Örnek: node scripts/export-profiles-admin.cjs kaancolakogullari1@gmail.com Sifreniz123');
    process.exit(1);
  }

  console.log(`1. Admin girişi yapılıyor: ${email}...`);
  const postData = JSON.stringify({ email, password });

  const token = await new Promise((resolve, reject) => {
    const req = https.request('https://htjmuzogayyufewirvlp.supabase.co/auth/v1/token?grant_type=password', {
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
          else reject(new Error('Giriş başarısız: ' + (parsed.msg || parsed.error_description || b)));
        } catch(e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });

  console.log('Admin oturumu başarıyla açıldı.');

  function getJson(urlPath) {
    return new Promise((resolve, reject) => {
      https.get('https://htjmuzogayyufewirvlp.supabase.co' + urlPath, {
        headers: {
          'apikey': apikey,
          'Authorization': 'Bearer ' + token,
          'Prefer': 'count=exact'
        }
      }, (res) => {
        let b = '';
        res.on('data', d => b += d);
        res.on('end', () => {
          try {
            resolve({
              count: res.headers['content-range'],
              data: JSON.parse(b)
            });
          } catch(e) {
            resolve({ count: null, data: b });
          }
        });
      }).on('error', reject);
    });
  }

  const backupDir = path.join(process.cwd(), 'backup');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

  console.log('2. Tüm kullanıcı profilleri çekiliyor (profiles)...');
  const profilesRes = await getJson('/rest/v1/profiles?select=*&order=created_at.desc');
  fs.writeFileSync(path.join(backupDir, 'profiles.json'), JSON.stringify(profilesRes.data, null, 2), 'utf8');
  console.log(`Kaydedilen profil sayısı: ${Array.isArray(profilesRes.data) ? profilesRes.data.length : 0} (Range: ${profilesRes.count})`);

  console.log('3. Kullanıcı rolleri çekiliyor (user_roles)...');
  const rolesRes = await getJson('/rest/v1/user_roles?select=*');
  fs.writeFileSync(path.join(backupDir, 'user_roles.json'), JSON.stringify(rolesRes.data, null, 2), 'utf8');
  console.log(`Kaydedilen rol sayısı: ${Array.isArray(rolesRes.data) ? rolesRes.data.length : 0}`);

  console.log('4. Destek talepleri ve loglar kontrol ediliyor...');
  try {
    const downloadsRes = await getJson('/rest/v1/note_downloads?select=*');
    if (Array.isArray(downloadsRes.data)) {
      fs.writeFileSync(path.join(backupDir, 'note_downloads.json'), JSON.stringify(downloadsRes.data, null, 2), 'utf8');
      console.log(`Kaydedilen indirme kaydı: ${downloadsRes.data.length}`);
    }
  } catch(e) {}

  console.log('\n=============================================');
  console.log('TÜM KULLANICI VE ADMİN YEDEKLERİ TAMAMLANDI!');
  console.log(`Dizin: ${backupDir}`);
  console.log('=============================================\n');
}

main().catch(err => {
  console.error('\nHata oluştu:', err.message);
});
