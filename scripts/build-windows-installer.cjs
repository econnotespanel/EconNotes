const fs = require('fs');
const path = require('path');
const cp = require('child_process');

console.log('=== EconNotes Windows Installer & Desktop Client Builder ===');

const cscPath = 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe';
if (!fs.existsSync(cscPath)) {
  console.error('C# compiler not found at:', cscPath);
  process.exit(1);
}

const rootDir = path.resolve(__dirname, '..');
const publicDir = path.join(rootDir, 'public');
const downloadsDir = path.join(publicDir, 'downloads');
const iconsDir = path.join(publicDir, 'icons');
const tempDir = path.join(rootDir, 'temp_build_win');

// Read dynamic application version from src/lib/version.ts
const versionFilePath = path.join(rootDir, 'src', 'lib', 'version.ts');
let appVersion = 'v2.20.95';
try {
  const versionContent = fs.readFileSync(versionFilePath, 'utf8');
  const m = versionContent.match(/APP_VERSION\s*=\s*['"]([^'"]+)['"]/);
  if (m && m[1]) appVersion = m[1];
} catch (e) {}
const cleanVersion = appVersion.replace(/^v/, '');
console.log(`Packaging for version: ${appVersion} (clean: ${cleanVersion})`);

if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

// 1. Generate ICO if needed
const icoPath = path.join(iconsDir, 'econnotes.ico');
if (!fs.existsSync(icoPath)) {
  console.log('Generating econnotes.ico...');
  const pngPath = path.join(iconsDir, 'icon-192x192.png');
  const pngBytes = fs.readFileSync(pngPath);
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  const entry = Buffer.alloc(16);
  entry.writeUInt8(192, 0);
  entry.writeUInt8(192, 1);
  entry.writeUInt8(0, 2);
  entry.writeUInt8(0, 3);
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(pngBytes.length, 8);
  entry.writeUInt32LE(22, 12);
  fs.writeFileSync(icoPath, Buffer.concat([header, entry, pngBytes]));
  console.log('ICO created at:', icoPath);
}

const icoBytes = fs.readFileSync(icoPath);
const icoBase64 = icoBytes.toString('base64');

// 2. Generate Desktop Client (EconNotes.exe)
console.log('Compiling EconNotes.exe (Desktop Application Launcher)...');
const launcherCsPath = path.join(tempDir, 'Launcher.cs');
const launcherExePath = path.join(tempDir, 'EconNotes.exe');

const launcherCode = `
using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;

namespace EconNotes.Desktop
{
    static class Program
    {
        [STAThread]
        static void Main(string[] args)
        {
            try
            {
                string targetUrl = "https://econnotes.online";
                if (args != null && args.Length > 0 && !string.IsNullOrEmpty(args[0]))
                {
                    if (args[0].StartsWith("http://") || args[0].StartsWith("https://"))
                        targetUrl = args[0];
                }

                string userDataDir = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    "EconNotes\\\\AppProfile"
                );

                string edgePath = FindEdge();
                string chromePath = FindChrome();

                if (!string.IsNullOrEmpty(edgePath) && File.Exists(edgePath))
                {
                    Process.Start(new ProcessStartInfo
                    {
                        FileName = edgePath,
                        Arguments = "--app=\\"" + targetUrl + "\\" --user-data-dir=\\"" + userDataDir + "\\" --window-size=1280,820",
                        UseShellExecute = false
                    });
                    return;
                }

                if (!string.IsNullOrEmpty(chromePath) && File.Exists(chromePath))
                {
                    Process.Start(new ProcessStartInfo
                    {
                        FileName = chromePath,
                        Arguments = "--app=\\"" + targetUrl + "\\" --user-data-dir=\\"" + userDataDir + "\\" --window-size=1280,820",
                        UseShellExecute = false
                    });
                    return;
                }

                // Fallback to default browser
                Process.Start(targetUrl);
            }
            catch (Exception ex)
            {
                MessageBox.Show("EconNotes başlatılırken bir hata oluştu: " + ex.Message, "EconNotes", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        static string FindEdge()
        {
            string[] paths = new string[]
            {
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "Microsoft\\\\Edge\\\\Application\\\\msedge.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Microsoft\\\\Edge\\\\Application\\\\msedge.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Microsoft\\\\Edge\\\\Application\\\\msedge.exe")
            };
            foreach (string p in paths)
            {
                if (File.Exists(p)) return p;
            }
            return null;
        }

        static string FindChrome()
        {
            string[] paths = new string[]
            {
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Google\\\\Chrome\\\\Application\\\\chrome.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "Google\\\\Chrome\\\\Application\\\\chrome.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Google\\\\Chrome\\\\Application\\\\chrome.exe")
            };
            foreach (string p in paths)
            {
                if (File.Exists(p)) return p;
            }
            return null;
        }
    }
}
`;
fs.writeFileSync(launcherCsPath, launcherCode, 'utf8');

cp.execSync(`"${cscPath}" /target:winexe /optimize+ /win32icon:"${icoPath}" /out:"${launcherExePath}" "${launcherCsPath}"`, { stdio: 'inherit' });
console.log('EconNotes.exe compiled successfully, size:', fs.statSync(launcherExePath).size);

// 3. Generate Uninstaller (Uninstall.exe)
console.log('Compiling Uninstall.exe...');
const uninstallerCsPath = path.join(tempDir, 'Uninstaller.cs');
const uninstallerExePath = path.join(tempDir, 'Uninstall.exe');

const uninstallerCode = `
using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;
using Microsoft.Win32;

namespace EconNotes.Uninstaller
{
    static class Program
    {
        [STAThread]
        static void Main()
        {
            DialogResult dr = MessageBox.Show(
                "EconNotes uygulamasını bilgisayarınızdan kaldırmak istediğinize emin misiniz?",
                "EconNotes Kaldırma Sihirbazı",
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Question
            );

            if (dr != DialogResult.Yes) return;

            try
            {
                // Delete desktop shortcut
                string desktopShortcut = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Desktop), "EconNotes.lnk");
                if (File.Exists(desktopShortcut)) File.Delete(desktopShortcut);

                // Delete start menu folder
                string startMenu = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.StartMenu), "Programs\\\\EconNotes");
                if (Directory.Exists(startMenu)) Directory.Delete(startMenu, true);

                // Delete registry entry
                try
                {
                    using (RegistryKey key = Registry.CurrentUser.OpenSubKey("Software\\\\Microsoft\\\\Windows\\\\CurrentVersion\\\\Uninstall", true))
                    {
                        if (key != null) key.DeleteSubKeyTree("EconNotes", false);
                    }
                }
                catch { }

                // Schedule directory cleanup via cmd
                string installDir = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\\\', '/');
                ProcessStartInfo psi = new ProcessStartInfo
                {
                    FileName = "cmd.exe",
                    Arguments = "/c timeout /t 2 /nobreak > nul & rmdir /s /q \\"" + installDir + "\\"",
                    WindowStyle = ProcessWindowStyle.Hidden,
                    CreateNoWindow = true
                };
                Process.Start(psi);

                MessageBox.Show(
                    "EconNotes bilgisayarınızdan başarıyla kaldırıldı.",
                    "EconNotes",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Information
                );
            }
            catch (Exception ex)
            {
                MessageBox.Show("Kaldırma sırasında bir sorun oluştu: " + ex.Message, "EconNotes", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
        }
    }
}
`;
fs.writeFileSync(uninstallerCsPath, uninstallerCode, 'utf8');

cp.execSync(`"${cscPath}" /target:winexe /optimize+ /win32icon:"${icoPath}" /out:"${uninstallerExePath}" "${uninstallerCsPath}"`, { stdio: 'inherit' });
console.log('Uninstall.exe compiled successfully, size:', fs.statSync(uninstallerExePath).size);

// Read embedded binaries as Base64
const launcherBytes = fs.readFileSync(launcherExePath);
const uninstallerBytes = fs.readFileSync(uninstallerExePath);
const launcherBase64 = launcherBytes.toString('base64');
const uninstallerBase64 = uninstallerBytes.toString('base64');

// 4. Generate Installer with Wizard Screens (EconNotes-Kurulum.exe)
console.log('Compiling EconNotes-Kurulum.exe (Installation Wizard)...');
const installerCsPath = path.join(tempDir, 'Installer.cs');
const installerExePath = path.join(downloadsDir, 'EconNotes-Kurulum.exe');

const installerCode = `
using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

namespace EconNotes.Installer
{
    public class InstallerForm : Form
    {
        private int currentStep = 1;
        private Panel contentPanel;
        private Button btnBack;
        private Button btnNext;
        private Button btnCancel;
        private CheckBox chkDesktop;
        private CheckBox chkStartMenu;
        private CheckBox chkLaunchNow;
        private TextBox txtTargetDir;
        private ProgressBar prgInstall;
        private Label lblStatus;
        private System.Windows.Forms.Timer animTimer;
        private int installProgress = 0;

        private static readonly string LauncherPayload = "${launcherBase64}";
        private static readonly string UninstallerPayload = "${uninstallerBase64}";
        private static readonly string IconPayload = "${icoBase64}";

        public InstallerForm()
        {
            this.Text = "EconNotes Kurulum Sihirbazı";
            this.Size = new Size(580, 440);
            this.StartPosition = FormStartPosition.CenterScreen;
            this.FormBorderStyle = FormBorderStyle.FixedDialog;
            this.MaximizeBox = false;
            this.MinimizeBox = true;
            this.BackColor = Color.FromArgb(15, 23, 42); // slate-900
            this.ForeColor = Color.White;
            this.Font = new Font("Segoe UI", 9.25f, FontStyle.Regular);

            // Set Form Icon
            try
            {
                byte[] icoData = Convert.FromBase64String(IconPayload);
                using (MemoryStream ms = new MemoryStream(icoData))
                {
                    this.Icon = new Icon(ms);
                }
            }
            catch { }

            // Bottom control strip
            Panel bottomPanel = new Panel
            {
                Dock = DockStyle.Bottom,
                Height = 60,
                BackColor = Color.FromArgb(11, 15, 25), // slate-950
                Padding = new Padding(15, 12, 15, 12)
            };
            this.Controls.Add(bottomPanel);

            btnCancel = new Button
            {
                Text = "İptal",
                Size = new Size(85, 34),
                Location = new Point(bottomPanel.Width - 105, 13),
                Anchor = AnchorStyles.Right | AnchorStyles.Top,
                BackColor = Color.FromArgb(30, 41, 59),
                ForeColor = Color.FromArgb(226, 232, 240),
                FlatStyle = FlatStyle.Flat,
                Cursor = Cursors.Hand
            };
            btnCancel.FlatAppearance.BorderColor = Color.FromArgb(51, 65, 85);
            btnCancel.Click += (s, e) => this.Close();
            bottomPanel.Controls.Add(btnCancel);

            btnNext = new Button
            {
                Text = "İleri >",
                Size = new Size(100, 34),
                Location = new Point(bottomPanel.Width - 215, 13),
                Anchor = AnchorStyles.Right | AnchorStyles.Top,
                BackColor = Color.FromArgb(37, 99, 235), // blue-600
                ForeColor = Color.White,
                FlatStyle = FlatStyle.Flat,
                Font = new Font("Segoe UI", 9.25f, FontStyle.Bold),
                Cursor = Cursors.Hand
            };
            btnNext.FlatAppearance.BorderSize = 0;
            btnNext.Click += OnNextClicked;
            bottomPanel.Controls.Add(btnNext);

            btnBack = new Button
            {
                Text = "< Geri",
                Size = new Size(85, 34),
                Location = new Point(bottomPanel.Width - 308, 13),
                Anchor = AnchorStyles.Right | AnchorStyles.Top,
                BackColor = Color.FromArgb(30, 41, 59),
                ForeColor = Color.FromArgb(226, 232, 240),
                FlatStyle = FlatStyle.Flat,
                Enabled = false,
                Cursor = Cursors.Hand
            };
            btnBack.FlatAppearance.BorderColor = Color.FromArgb(51, 65, 85);
            btnBack.Click += OnBackClicked;
            bottomPanel.Controls.Add(btnBack);

            // Main Content Panel
            contentPanel = new Panel
            {
                Dock = DockStyle.Fill,
                BackColor = Color.FromArgb(15, 23, 42),
                Padding = new Padding(30, 25, 30, 20)
            };
            this.Controls.Add(contentPanel);

            ShowStep(1);
        }

        private void ShowStep(int step)
        {
            currentStep = step;
            contentPanel.Controls.Clear();

            if (step == 1)
            {
                btnBack.Enabled = false;
                btnNext.Text = "İleri >";
                btnNext.Visible = true;
                btnCancel.Text = "İptal";

                // Step 1: Welcome Screen
                Label lblTitle = new Label
                {
                    Text = "EconNotes Kurulum Sihirbazı",
                    Font = new Font("Segoe UI", 16f, FontStyle.Bold),
                    ForeColor = Color.White,
                    Location = new Point(30, 25),
                    Size = new Size(480, 36)
                };
                contentPanel.Controls.Add(lblTitle);

                Label lblSubtitle = new Label
                {
                    Text = "İktisat ve Akademik Not Platformu (Windows Sürümü ${appVersion})",
                    Font = new Font("Segoe UI", 9.5f, FontStyle.Regular),
                    ForeColor = Color.FromArgb(96, 165, 250), // blue-400
                    Location = new Point(32, 62),
                    Size = new Size(480, 24)
                };
                contentPanel.Controls.Add(lblSubtitle);

                Panel card = new Panel
                {
                    Location = new Point(30, 95),
                    Size = new Size(500, 200),
                    BackColor = Color.FromArgb(30, 41, 59),
                    Padding = new Padding(20)
                };
                contentPanel.Controls.Add(card);

                Label lblDesc = new Label
                {
                    Text = "Bu kurulum sihirbazı EconNotes uygulamasını bilgisayarınıza bağımsız bir masaüstü uygulaması olarak kuracaktır.\\n\\n" +
                           "Öne Çıkan Özellikler:\\n" +
                           " • Tarayıcı sekmelerinden bağımsız, kesintisiz tam ekran çalışma ortamı\\n" +
                           " • Masaüstünden ve Başlat menüsünden tek tıkla hızlı erişim\\n" +
                           " • Çalışma Stüdyosu, KPSS paneli ve ders notlarına anında ulaşım\\n" +
                           " • Hafif, hızlı ve cihazınızı yormayan optimize mimari\\n\\n" +
                           "Kuruluma devam etmek için lütfen 'İleri' butonuna tıklayın.",
                    Font = new Font("Segoe UI", 9.25f, FontStyle.Regular),
                    ForeColor = Color.FromArgb(226, 232, 240),
                    Dock = DockStyle.Fill
                };
                card.Controls.Add(lblDesc);
            }
            else if (step == 2)
            {
                btnBack.Enabled = true;
                btnNext.Text = "Kur >";
                btnNext.Visible = true;
                btnCancel.Text = "İptal";

                // Step 2: Destination & Shortcuts
                Label lblTitle = new Label
                {
                    Text = "Kurulum Konumu ve Seçenekler",
                    Font = new Font("Segoe UI", 14f, FontStyle.Bold),
                    ForeColor = Color.White,
                    Location = new Point(30, 25),
                    Size = new Size(480, 32)
                };
                contentPanel.Controls.Add(lblTitle);

                Label lblPathHelp = new Label
                {
                    Text = "EconNotes aşağıdaki hedef klasöre kurulacaktır:",
                    Font = new Font("Segoe UI", 9.25f, FontStyle.Regular),
                    ForeColor = Color.FromArgb(148, 163, 184),
                    Location = new Point(30, 65),
                    Size = new Size(480, 22)
                };
                contentPanel.Controls.Add(lblPathHelp);

                string defaultDir = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    "Programs\\\\EconNotes"
                );

                txtTargetDir = new TextBox
                {
                    Text = defaultDir,
                    Location = new Point(30, 92),
                    Size = new Size(390, 28),
                    BackColor = Color.FromArgb(30, 41, 59),
                    ForeColor = Color.White,
                    BorderStyle = BorderStyle.FixedSingle,
                    Font = new Font("Segoe UI", 9.25f, FontStyle.Regular)
                };
                contentPanel.Controls.Add(txtTargetDir);

                Button btnBrowse = new Button
                {
                    Text = "Gözat...",
                    Location = new Point(430, 90),
                    Size = new Size(80, 30),
                    BackColor = Color.FromArgb(51, 65, 85),
                    ForeColor = Color.White,
                    FlatStyle = FlatStyle.Flat,
                    Cursor = Cursors.Hand
                };
                btnBrowse.FlatAppearance.BorderSize = 0;
                btnBrowse.Click += (s, e) =>
                {
                    using (FolderBrowserDialog fbd = new FolderBrowserDialog())
                    {
                        fbd.SelectedPath = txtTargetDir.Text;
                        if (fbd.ShowDialog() == DialogResult.OK)
                        {
                            txtTargetDir.Text = fbd.SelectedPath;
                        }
                    }
                };
                contentPanel.Controls.Add(btnBrowse);

                Panel optsCard = new Panel
                {
                    Location = new Point(30, 140),
                    Size = new Size(500, 140),
                    BackColor = Color.FromArgb(30, 41, 59),
                    Padding = new Padding(20)
                };
                contentPanel.Controls.Add(optsCard);

                Label lblOpts = new Label
                {
                    Text = "Kısayol ve Entegrasyon Seçenekleri:",
                    Font = new Font("Segoe UI", 9.5f, FontStyle.Bold),
                    ForeColor = Color.FromArgb(96, 165, 250),
                    Location = new Point(15, 12),
                    Size = new Size(400, 24)
                };
                optsCard.Controls.Add(lblOpts);

                chkDesktop = new CheckBox
                {
                    Text = "Masaüstüne EconNotes kısayolu ekle (Önerilen)",
                    Checked = true,
                    ForeColor = Color.White,
                    Location = new Point(18, 45),
                    Size = new Size(450, 26),
                    Cursor = Cursors.Hand
                };
                optsCard.Controls.Add(chkDesktop);

                chkStartMenu = new CheckBox
                {
                    Text = "Başlat Menüsü'ne EconNotes kısayolu ekle",
                    Checked = true,
                    ForeColor = Color.White,
                    Location = new Point(18, 80),
                    Size = new Size(450, 26),
                    Cursor = Cursors.Hand
                };
                optsCard.Controls.Add(chkStartMenu);
            }
            else if (step == 3)
            {
                btnBack.Enabled = false;
                btnNext.Enabled = false;
                btnCancel.Enabled = false;

                // Step 3: Installation Progress
                Label lblTitle = new Label
                {
                    Text = "EconNotes Kuruluyor...",
                    Font = new Font("Segoe UI", 14f, FontStyle.Bold),
                    ForeColor = Color.White,
                    Location = new Point(30, 40),
                    Size = new Size(480, 32)
                };
                contentPanel.Controls.Add(lblTitle);

                lblStatus = new Label
                {
                    Text = "Kurulum dosyaları hazırlanıyor...",
                    Font = new Font("Segoe UI", 9.25f, FontStyle.Regular),
                    ForeColor = Color.FromArgb(148, 163, 184),
                    Location = new Point(30, 85),
                    Size = new Size(480, 24)
                };
                contentPanel.Controls.Add(lblStatus);

                prgInstall = new ProgressBar
                {
                    Location = new Point(30, 115),
                    Size = new Size(500, 26),
                    Minimum = 0,
                    Maximum = 100,
                    Value = 0,
                    Style = ProgressBarStyle.Continuous
                };
                contentPanel.Controls.Add(prgInstall);

                StartInstallation();
            }
            else if (step == 4)
            {
                btnBack.Visible = false;
                btnCancel.Visible = false;
                btnNext.Visible = true;
                btnNext.Enabled = true;
                btnNext.Text = "Bitir";

                // Step 4: Finished Screen
                Label lblTitle = new Label
                {
                    Text = "Kurulum Başarıyla Tamamlandı!",
                    Font = new Font("Segoe UI", 16f, FontStyle.Bold),
                    ForeColor = Color.FromArgb(52, 211, 153), // emerald-400
                    Location = new Point(30, 30),
                    Size = new Size(480, 36)
                };
                contentPanel.Controls.Add(lblTitle);

                Panel finishCard = new Panel
                {
                    Location = new Point(30, 80),
                    Size = new Size(500, 180),
                    BackColor = Color.FromArgb(30, 41, 59),
                    Padding = new Padding(20)
                };
                contentPanel.Controls.Add(finishCard);

                Label lblFinishDesc = new Label
                {
                    Text = "EconNotes bilgisayarınıza başarıyla kuruldu.\\n\\n" +
                           "Artık masaüstünüzdeki veya Başlat Menüsü'ndeki EconNotes simgesine çift tıklayarak ders notlarınıza, sınav hazırlık araçlarınıza ve çalışma stüdyonuza doğrudan erişebilirsiniz.\\n\\n" +
                           "Kurulum Sihirbazı'ndan çıkmak için 'Bitir' butonuna tıklayın.",
                    Font = new Font("Segoe UI", 9.25f, FontStyle.Regular),
                    ForeColor = Color.FromArgb(226, 232, 240),
                    Dock = DockStyle.Fill
                };
                finishCard.Controls.Add(lblFinishDesc);

                chkLaunchNow = new CheckBox
                {
                    Text = "EconNotes uygulamasını şimdi başlat",
                    Checked = true,
                    ForeColor = Color.FromArgb(96, 165, 250),
                    Font = new Font("Segoe UI", 9.5f, FontStyle.Bold),
                    Location = new Point(35, 275),
                    Size = new Size(450, 30),
                    Cursor = Cursors.Hand
                };
                contentPanel.Controls.Add(chkLaunchNow);
            }
        }

        private void OnNextClicked(object sender, EventArgs e)
        {
            if (currentStep == 1)
            {
                ShowStep(2);
            }
            else if (currentStep == 2)
            {
                ShowStep(3);
            }
            else if (currentStep == 4)
            {
                if (chkLaunchNow != null && chkLaunchNow.Checked)
                {
                    string targetDir = txtTargetDir != null ? txtTargetDir.Text : Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs\\\\EconNotes");
                    string exePath = Path.Combine(targetDir, "EconNotes.exe");
                    if (File.Exists(exePath))
                    {
                        try { Process.Start(exePath); } catch { }
                    }
                }
                this.Close();
            }
        }

        private void OnBackClicked(object sender, EventArgs e)
        {
            if (currentStep == 2)
            {
                ShowStep(1);
            }
        }

        private void StartInstallation()
        {
            installProgress = 0;
            animTimer = new System.Windows.Forms.Timer { Interval = 60 };
            animTimer.Tick += (s, e) =>
            {
                installProgress += 4;
                if (installProgress > 100) installProgress = 100;
                prgInstall.Value = installProgress;

                if (installProgress < 25)
                    lblStatus.Text = "Hedef dizin oluşturuluyor ve yapılandırılıyor...";
                else if (installProgress < 55)
                    lblStatus.Text = "EconNotes masaüstü istemcisi yükleniyor...";
                else if (installProgress < 75)
                    lblStatus.Text = "Uygulama simgeleri ve kaldırma aracı kaydediliyor...";
                else if (installProgress < 95)
                    lblStatus.Text = "Masaüstü ve Başlat Menüsü kısayolları ekleniyor...";
                else
                    lblStatus.Text = "Kurulum tamamlanıyor...";

                if (installProgress >= 100)
                {
                    animTimer.Stop();
                    animTimer.Dispose();
                    PerformActualDiskInstall();
                    ShowStep(4);
                }
            };
            animTimer.Start();
        }

        private void PerformActualDiskInstall()
        {
            try
            {
                string targetDir = txtTargetDir.Text.Trim();
                if (string.IsNullOrEmpty(targetDir))
                    targetDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs\\\\EconNotes");

                if (!Directory.Exists(targetDir))
                    Directory.CreateDirectory(targetDir);

                // 1. Write EconNotes.exe
                string exePath = Path.Combine(targetDir, "EconNotes.exe");
                byte[] launcherBytes = Convert.FromBase64String(LauncherPayload);
                File.WriteAllBytes(exePath, launcherBytes);

                // 2. Write Uninstall.exe
                string uninstallerPath = Path.Combine(targetDir, "Uninstall.exe");
                byte[] uninstBytes = Convert.FromBase64String(UninstallerPayload);
                File.WriteAllBytes(uninstallerPath, uninstBytes);

                // 3. Write icon
                string icoPath = Path.Combine(targetDir, "econnotes.ico");
                byte[] iconBytes = Convert.FromBase64String(IconPayload);
                File.WriteAllBytes(icoPath, iconBytes);

                // 4. Create Desktop Shortcut if checked
                if (chkDesktop != null && chkDesktop.Checked)
                {
                    string desktopLink = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Desktop), "EconNotes.lnk");
                    CreateShortcut(desktopLink, exePath, targetDir, icoPath, "EconNotes - Dijital İktisat Çalışma Platformu");
                }

                // 5. Create Start Menu Shortcut if checked
                if (chkStartMenu != null && chkStartMenu.Checked)
                {
                    string startMenuFolder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.StartMenu), "Programs\\\\EconNotes");
                    if (!Directory.Exists(startMenuFolder)) Directory.CreateDirectory(startMenuFolder);

                    string startMenuLink = Path.Combine(startMenuFolder, "EconNotes.lnk");
                    CreateShortcut(startMenuLink, exePath, targetDir, icoPath, "EconNotes - Dijital İktisat Çalışma Platformu");

                    string uninstallLink = Path.Combine(startMenuFolder, "EconNotes Kaldır.lnk");
                    CreateShortcut(uninstallLink, uninstallerPath, targetDir, icoPath, "EconNotes Kaldırma");
                }

                // 6. Register in Windows Add/Remove Programs (HKCU)
                try
                {
                    using (RegistryKey parent = Registry.CurrentUser.CreateSubKey("Software\\\\Microsoft\\\\Windows\\\\CurrentVersion\\\\Uninstall\\\\EconNotes"))
                    {
                        if (parent != null)
                        {
                            parent.SetValue("DisplayName", "EconNotes", RegistryValueKind.String);
                            parent.SetValue("DisplayVersion", "${cleanVersion}", RegistryValueKind.String);
                            parent.SetValue("Publisher", "EconNotes", RegistryValueKind.String);
                            parent.SetValue("DisplayIcon", exePath + ",0", RegistryValueKind.String);
                            parent.SetValue("InstallLocation", targetDir, RegistryValueKind.String);
                            parent.SetValue("UninstallString", "\\"" + uninstallerPath + "\\"", RegistryValueKind.String);
                            parent.SetValue("URLInfoAbout", "https://econnotes.online", RegistryValueKind.String);
                            parent.SetValue("EstimatedSize", 1500, RegistryValueKind.DWord);
                        }
                    }
                }
                catch { }
            }
            catch (Exception ex)
            {
                MessageBox.Show("Kurulum sırasında hata oluştu: " + ex.Message, "Kurulum Hatası", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private static void CreateShortcut(string shortcutPath, string targetPath, string workingDir, string iconPath, string description)
        {
            try
            {
                Type shellType = Type.GetTypeFromProgID("WScript.Shell");
                if (shellType == null) return;
                object shell = Activator.CreateInstance(shellType);
                object shortcut = shellType.InvokeMember("CreateShortcut", BindingFlags.InvokeMethod, null, shell, new object[] { shortcutPath });
                Type scType = shortcut.GetType();
                scType.InvokeMember("TargetPath", BindingFlags.SetProperty, null, shortcut, new object[] { targetPath });
                scType.InvokeMember("WorkingDirectory", BindingFlags.SetProperty, null, shortcut, new object[] { workingDir });
                scType.InvokeMember("IconLocation", BindingFlags.SetProperty, null, shortcut, new object[] { iconPath + ",0" });
                scType.InvokeMember("Description", BindingFlags.SetProperty, null, shortcut, new object[] { description });
                scType.InvokeMember("Save", BindingFlags.InvokeMethod, null, shortcut, null);
            }
            catch { }
        }
    }

    static class Program
    {
        [STAThread]
        static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new InstallerForm());
        }
    }
}
`;
fs.writeFileSync(installerCsPath, installerCode, 'utf8');

cp.execSync(`"${cscPath}" /target:winexe /optimize+ /win32icon:"${icoPath}" /r:System.Windows.Forms.dll /r:System.Drawing.dll /out:"${installerExePath}" "${installerCsPath}"`, { stdio: 'inherit' });
console.log('EconNotes-Kurulum.exe compiled successfully, size:', fs.statSync(installerExePath).size);

// Also copy to EconNotes-Setup.exe
const setupExePath = path.join(downloadsDir, 'EconNotes-Setup.exe');
fs.copyFileSync(installerExePath, setupExePath);
console.log('Copied to EconNotes-Setup.exe');

// Apply Authenticode signature
try {
  console.log('Applying Authenticode signature...');
  const signScriptPath = path.join(rootDir, 'scripts', 'sign-executables.ps1');
  if (fs.existsSync(signScriptPath)) {
    cp.execSync(`powershell -ExecutionPolicy Bypass -File "${signScriptPath}"`, { stdio: 'ignore' });
    console.log('Authenticode signature applied to executables.');
  }
} catch (e) {
  console.warn('Signature step skipped:', e.message);
}

// Generate ZIP package
const JSZip = require('jszip');
const zip = new JSZip();
zip.file('EconNotes-Kurulum.exe', fs.readFileSync(installerExePath));
zip.file(
  'EconNotes-Hizli-Baslat.bat',
  '@echo off\r\ntitle EconNotes Baslatiliyor...\r\necho EconNotes Platformu Masaustunde Aciliyor...\r\nstart "" "https://econnotes.online"\r\n'
);
zip.file(
  'Kurulum-Rehberi.txt',
  `EconNotes Desktop Kurulum ve Calistirma Rehberi (${appVersion})

1. 'EconNotes-Kurulum.exe' dosyasina cift tiklayarak kurulum sihirbazini calistirin.
2. Acilan pencerede 'Ileri' ve 'Kur' butonlarina basarak kurulumu 5 saniyede tamamlayin.
3. Masaustunuze ve Baslat menunuze 'EconNotes' kisayolu eklenecektir.

Alternatif Olarak:
- Kurulum yapmadan dogrudan 'EconNotes-Hizli-Baslat.bat' dosyasina cift tiklayarak da uygulamayi baslatabilirsiniz.

Destek ve Yardim: https://econnotes.online/support
`
);

const zipPath = path.join(downloadsDir, 'EconNotes-Kurulum.zip');
zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } })
  .then((zipBuf) => {
    fs.writeFileSync(zipPath, zipBuf);
    console.log('ZIP package created successfully:', (zipBuf.length / 1024).toFixed(1), 'KB');

    // Cleanup temp files
    try {
      fs.unlinkSync(launcherCsPath);
      fs.unlinkSync(launcherExePath);
      fs.unlinkSync(uninstallerCsPath);
      fs.unlinkSync(uninstallerExePath);
      fs.unlinkSync(installerCsPath);
      fs.rmdirSync(tempDir);
    } catch (e) {}

    console.log('=== BUILD COMPLETE ===');
    console.log('Artifacts created in public/downloads:');
    console.log(' - EconNotes-Kurulum.exe (' + (fs.statSync(installerExePath).size / 1024).toFixed(1) + ' KB)');
    console.log(' - EconNotes-Setup.exe (' + (fs.statSync(setupExePath).size / 1024).toFixed(1) + ' KB)');
    console.log(' - EconNotes-Kurulum.zip (' + (fs.statSync(zipPath).size / 1024).toFixed(1) + ' KB)');
  });
