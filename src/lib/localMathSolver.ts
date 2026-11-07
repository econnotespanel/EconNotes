export interface LocalSolveInput {
  question: string;
  extractedImageText?: string;
  documentText?: string;
  documentName?: string;
}

const PURE_GREETING_RE =
  /^(selam(lar|ün\s*aleyküm|un\s*aleykum)?|slm|merhaba(lar)?|mrb|hey|hi|hello|günaydın|iyi\s*(günler|akşamlar|geceler|çalışmalar)|kolay\s*gelsin)[!.?,\s😊👋]*$/i;

const HOW_ARE_YOU_RE =
  /^(merhaba\s+|selam\s+)?(nasılsın(ız)?|naber|ne\s*haber|iyi\s*misin(iz)?|keyifler\s*nasıl|durumlar\s*nasıl|napıyorsun|ne\s*yapıyorsun)[!.?,\s😊👋]*$/i;

const THANKS_RE =
  /^(çok\s+)?(teşekkür\s*ederim|teşekkürler|tşk|sağ\s*ol(un)?|sağol(un)?|eyvallah|eline\s*sağlık|emeğine\s*sağlık|harikasın|süpersin|tamamdır|anladım\s*teşekkürler)[!.?,\s🙏😊]*$/i;

const WHO_ARE_YOU_RE =
  /^(sen\s*kimsin|kimsin|ne\s*işe\s*yarıyorsun|ne\s*yapabiliyorsun|neler\s*yapabilirsin|nasıl\s*çalışıyorsun|hangi\s*dersleri\s*çözebiliyorsun|yardım\s*eder\s*misin|bana\s*nasıl\s*yardımcı\s*olabilirsin)[!.?,\s]*$/i;

/**
 * Matches pure short conversational greetings/courtesies (with zero math or course content)
 * so greetings like "selam" and "nasılsın" respond in <10ms without consuming LLM rate limits.
 */
export function matchConversationalIntent(
  rawMessage: string,
  hasAttachments: boolean,
): string | null {
  if (hasAttachments) return null;
  const msg = rawMessage.trim();
  if (!msg || msg.length > 75) return null;

  // Never intercept anything containing digits or mathematical operators
  if (/[0-9=+\-*/^∫∑√πθ\\$]/.test(msg)) return null;

  if (PURE_GREETING_RE.test(msg)) {
    return [
      'Merhaba! Hoş geldin 👋 **EconNotes Akademik Asistan** olarak yanındayım.',
      '',
      'Matematik, mühendislik, fizik, istatistik, iktisat ve tüm üniversite derslerindeki sorularını **hiçbir ara işlemi atlamadan, anlata anlata** çözebilirim:',
      '- **Soru yazabilirsin:** Kalkülüs (türev, integral, limit), Lineer Cebir, Diferansiyel Denklemler, Devre Analizi, Statik/Dinamik, Termodinamik, Olasılık vb.',
      '- **Galeriden görsel ekleyebilirsin:** Sol alttaki **Resim Seç** butonuyla `PNG` veya `JPG` soru fotoğrafı yükleyebilir ya da ekran görüntüsünü doğrudan (`Ctrl+V`) yapıştırabilirsin.',
      '- **Belge yükleyebilirsin:** `PDF`, `Word` veya `PowerPoint` ders notlarını ekleyip özetletebilir veya içindeki soruları çözdürebilirsin.',
      '',
      'Hangi soruyla başlayalım?',
    ].join('\n');
  }

  if (HOW_ARE_YOU_RE.test(msg)) {
    return [
      'İyiyim, çok teşekkür ederim! 😊 Senin çalışmaların nasıl gidiyor?',
      '',
      'Zorlandığın bir **matematik / mühendislik sorusu**, kontrol ettirmek istediğin kendi çözümün ya da anlamak istediğin bir formül varsa hemen yazabilir veya galeriden **PNG / JPG** fotoğrafını gönderebilirsin; adım adım birlikte çözelim.',
    ].join('\n');
  }

  if (THANKS_RE.test(msg)) {
    return 'Rica ederim, ne demek! Başarılar dilerim 😊 Takıldığın başka bir adım, formül veya yeni bir soru olursa hemen yazabilir ya da görselini paylaşabilirsin.';
  }

  if (WHO_ARE_YOU_RE.test(msg)) {
    return [
      'Ben **EconNotes Akademik Asistanı**yım — üniversite öğrencileri için geliştirilmiş adım adım problem çözme ve konu anlatım hocasıyım.',
      '',
      '### Neler Yapabiliyorum?',
      '1. **Adım Adım Soru Çözümü:** Kalkülüs, Lineer Cebir, Diferansiyel Denklemler, Olasılık & İstatistik, Fizik, Elektrik-Elektronik Devreleri, Mukavemet/Statik, Termodinamik ve İktisat sorularını tüm ara işlemleriyle LaTeX denklemleriyle çözerim.',
      '2. **PNG / JPG Görselden Soru Çözme:** Galeriden seçtiğin soru fotoğrafını okuyup adım adım çözerim.',
      '3. **Çözüm Kontrolü:** Kendi çözümünü gönderdiğinde hangi satırda işlem veya işaret hatası yaptığını bulup doğrusunu gösteririm.',
      '4. **PDF / Ders Notu Analizi:** Yüklediğin ders notlarını özetler ve sınavda çıkabilecek noktaları vurgularım.',
    ].join('\n');
  }

  return null;
}

/**
 * Safe recursive-descent arithmetic & scientific expression parser (NO eval).
 * Supports +, -, *, /, ^, parentheses, pi, e, sqrt, sin, cos, tan, ln, log, exp, abs.
 */
class SafeMathEvaluator {
  private pos = 0;
  private readonly str: string;

  constructor(expr: string) {
    this.str = expr
      .replace(/\s+/g, '')
      .replace(/,/g, '.')
      .replace(/π|pi/gi, `(${Math.PI})`)
      .replace(/√\(/g, 'sqrt(');
  }

  evaluate(): number | null {
    if (!this.str) return null;
    const val = this.parseAddSub();
    if (this.pos < this.str.length || val === null || !Number.isFinite(val)) {
      return null;
    }
    return val;
  }

  private parseAddSub(): number | null {
    let left = this.parseMulDiv();
    if (left === null) return null;
    while (this.pos < this.str.length && (this.str[this.pos] === '+' || this.str[this.pos] === '-')) {
      const op = this.str[this.pos++];
      const right = this.parseMulDiv();
      if (right === null) return null;
      left = op === '+' ? left + right : left - right;
    }
    return left;
  }

  private parseMulDiv(): number | null {
    let left = this.parsePower();
    if (left === null) return null;
    while (this.pos < this.str.length && (this.str[this.pos] === '*' || this.str[this.pos] === '/')) {
      const op = this.str[this.pos++];
      const right = this.parsePower();
      if (right === null) return null;
      if (op === '/' && Math.abs(right) < 1e-15) return null;
      left = op === '*' ? left * right : left / right;
    }
    return left;
  }

  private parsePower(): number | null {
    const base = this.parseUnary();
    if (base === null) return null;
    if (this.pos < this.str.length && this.str[this.pos] === '^') {
      this.pos++;
      const exp = this.parsePower();
      if (exp === null) return null;
      return Math.pow(base, exp);
    }
    return base;
  }

  private parseUnary(): number | null {
    if (this.str[this.pos] === '+') {
      this.pos++;
      return this.parseUnary();
    }
    if (this.str[this.pos] === '-') {
      this.pos++;
      const v = this.parseUnary();
      return v === null ? null : -v;
    }
    return this.parsePrimary();
  }

  private parsePrimary(): number | null {
    if (this.str[this.pos] === '(') {
      this.pos++;
      const inner = this.parseAddSub();
      if (this.str[this.pos] !== ')') return null;
      this.pos++;
      return inner;
    }

    const fnMatch = this.str.slice(this.pos).match(/^(sqrt|sin|cos|tan|ln|log|exp|abs)\(/i);
    if (fnMatch) {
      const fn = fnMatch[1].toLowerCase();
      this.pos += fn.length + 1;
      const arg = this.parseAddSub();
      if (arg === null || this.str[this.pos] !== ')') return null;
      this.pos++;
      switch (fn) {
        case 'sqrt':
          return arg >= 0 ? Math.sqrt(arg) : null;
        case 'sin':
          return Math.sin(arg);
        case 'cos':
          return Math.cos(arg);
        case 'tan':
          return Math.tan(arg);
        case 'ln':
          return arg > 0 ? Math.log(arg) : null;
        case 'log':
          return arg > 0 ? Math.log10(arg) : null;
        case 'exp':
          return Math.exp(arg);
        case 'abs':
          return Math.abs(arg);
      }
    }

    if (this.str[this.pos] === 'e' && !/[a-z]/i.test(this.str[this.pos + 1] || '')) {
      this.pos++;
      return Math.E;
    }

    const numMatch = this.str.slice(this.pos).match(/^\d+(\.\d+)?/);
    if (numMatch) {
      this.pos += numMatch[0].length;
      return Number(numMatch[0]);
    }

    return null;
  }
}

function fmtNum(n: number): string {
  if (Math.abs(n) < 1e-11) return '0';
  const roundedInt = Math.round(n);
  if (Math.abs(n - roundedInt) < 1e-9) return String(roundedInt);
  return Number(n.toFixed(6)).toString();
}

/**
 * Attempts to parse and step-by-step solve univariate linear or quadratic equations (a*x^2 + b*x + c = d)
 * or direct arithmetic/scientific expressions when offline from cloud reasoning gateways.
 */
function trySolveEquationOrExpression(rawText: string): string | null {
  const cleaned = rawText
    .replace(/\r?\n/g, ' ')
    .replace(/[?]|nedir|hesapla|çöz|bulunuz|bulun|adım adım|anlata anlata/gi, '')
    .trim();

  // 1. Direct numerical expression (no variables)
  const exprCandidate = cleaned.replace(/=\s*$/, '').trim();
  if (/^[0-9+\-*/^().,\sπesqrtincotalgxp√]+$/i.test(exprCandidate) && /[0-9]/.test(exprCandidate) && !/=/.test(exprCandidate)) {
    const val = new SafeMathEvaluator(exprCandidate).evaluate();
    if (val !== null) {
      return [
        '### 📌 Sorunun Analizi',
        `Verilen matematiksel ifade: $${exprCandidate.replace(/\*/g, ' \\cdot ')}$`,
        '',
        '### ✍️ Adım Adım Hesaplama',
        'İşlem önceliği kuralları (parantez içi → üs/fonksiyon → çarpma/bölme → toplama/çıkarma) uygulanarak ifade değerlendirildiğinde:',
        '$$',
        `${exprCandidate.replace(/\*/g, ' \\cdot ')} = \\boxed{${fmtNum(val)}}`,
        '$$',
      ].join('\n');
    }
  }

  // 2. Quadratic or linear equation in x: e.g. 2x^2 - 5x + 2 = 0 or 2x + 6 = 14
  const eqMatch = cleaned.match(/([0-9xX+\-*/^().\s]+)=([0-9xX+\-*/^().\s]+)/);
  if (eqMatch && /[xX]/.test(eqMatch[0])) {
    const evalSide = (side: string, xVal: number): number | null => {
      const normalized = side
        .replace(/(\d)\s*([xX])/g, '$1*($2)')
        .replace(/\)\s*([xX])/g, ')*($1)')
        .replace(/([xX])\s*\(/g, '($1)*(')
        .replace(/[xX]/g, `(${xVal})`);
      return new SafeMathEvaluator(normalized).evaluate();
    };

    const fAt = (xVal: number): number | null => {
      const l = evalSide(eqMatch[1], xVal);
      const r = evalSide(eqMatch[2], xVal);
      return l !== null && r !== null ? l - r : null;
    };

    const f0 = fAt(0);
    const f1 = fAt(1);
    const fm1 = fAt(-1);
    const f2 = fAt(2);

    if (f0 !== null && f1 !== null && fm1 !== null && f2 !== null) {
      const c = f0;
      const a = (f1 + fm1 - 2 * f0) / 2;
      const b = (f1 - fm1) / 2;
      // Verify polynomial of degree <= 2 matches at x = 2
      const predictedF2 = 4 * a + 2 * b + c;
      if (Math.abs(predictedF2 - f2) < 1e-6) {
        const rawEq = `${eqMatch[1].trim()} = ${eqMatch[2].trim()}`;
        if (Math.abs(a) < 1e-9 && Math.abs(b) > 1e-9) {
          const root = -c / b;
          return [
            '### 📌 Sorunun Analizi ve Verilenler',
            `Çözülmesi istenen birinci dereceden denklem: $${rawEq}$`,
            '',
            '### ✍️ Adım Adım, Anlata Anlata Çözüm',
            `**Adım 1:** Tüm terimleri tek tarafta toplayarak standart doğrusal forma ($bx + c = 0$) getirelim:`,
            '$$',
            `${fmtNum(b)}x + (${fmtNum(c)}) = 0`,
            '$$',
            `**Adım 2:** Bilinmeyen $x$ terimini yalnız bırakalım:`,
            '$$',
            `${fmtNum(b)}x = ${fmtNum(-c)} \\implies x = \\frac{${fmtNum(-c)}}{${fmtNum(b)}} = \\boxed{${fmtNum(root)}}`,
            '$$',
            '',
            '### ✅ Sağlama (Doğrulama)',
            `$x = ${fmtNum(root)}$ değerini başlangıçtaki denklemin her iki yanına yazdığımızda eşitlik tam olarak sağlanır.`,
          ].join('\n');
        }

        if (Math.abs(a) >= 1e-9) {
          const delta = b * b - 4 * a * c;
          if (delta >= -1e-9) {
            const safeDelta = Math.max(0, delta);
            const sqrtDelta = Math.sqrt(safeDelta);
            const x1 = (-b + sqrtDelta) / (2 * a);
            const x2 = (-b - sqrtDelta) / (2 * a);
            return [
              '### 📌 Sorunun Analizi ve Verilenler',
              `Verilen ikinci dereceden denklem: $${rawEq}$`,
              `Standart form ($ax^2 + bx + c = 0$) katsayıları: $a = ${fmtNum(a)}$, $b = ${fmtNum(b)}$, $c = ${fmtNum(c)}$.`,
              '',
              '### 🧭 Çözüm Stratejisi',
              'İkinci dereceden denklemin köklerini bulmak için **diskriminant ($\\Delta$)** yöntemini kullanacağız:',
              '$$',
              '\\Delta = b^2 - 4ac, \\qquad x_{1,2} = \\frac{-b \\pm \\sqrt{\\Delta}}{2a}',
              '$$',
              '',
              '### ✍️ Adım Adım, Anlata Anlata Çözüm',
              '**Adım 1:** Katsayıları diskriminant formülünde yerine koyalım:',
              '$$',
              `\\Delta = (${fmtNum(b)})^2 - 4 \\cdot (${fmtNum(a)}) \\cdot (${fmtNum(c)}) = ${fmtNum(safeDelta)}`,
              '$$',
              safeDelta < 1e-9
                ? [
                    '**Adım 2:** $\\Delta = 0$ olduğundan çakışık (çift katlı) tek bir gerçel kök vardır:',
                    '$$',
                    `x_1 = x_2 = \\frac{-(${fmtNum(b)})}{2 \\cdot (${fmtNum(a)})} = \\boxed{${fmtNum(x1)}}`,
                    '$$',
                  ].join('\n')
                : [
                    '**Adım 2:** $\\Delta > 0$ olduğundan birbirinden farklı iki gerçel kök bulunur:',
                    '$$',
                    `x_1 = \\frac{-(${fmtNum(b)}) + \\sqrt{${fmtNum(safeDelta)}}}{2 \\cdot (${fmtNum(a)})} = \\boxed{${fmtNum(x1)}}`,
                    '$$',
                    '$$',
                    `x_2 = \\frac{-(${fmtNum(b)}) - \\sqrt{${fmtNum(safeDelta)}}}{2 \\cdot (${fmtNum(a)})} = \\boxed{${fmtNum(x2)}}`,
                    '$$',
                  ].join('\n'),
              '',
              '### ✅ Sağlama (Vieta Kök-Katsayı Kontrolü)',
              `- Kökler toplamı: $x_1 + x_2 = ${fmtNum(x1 + x2)} = -\\frac{b}{a}$`,
              `- Kökler çarpımı: $x_1 \\cdot x_2 = ${fmtNum(x1 * x2)} = \\frac{c}{a}$`,
            ].join('\n');
          } else {
            const realPart = -b / (2 * a);
            const imagPart = Math.sqrt(-delta) / Math.abs(2 * a);
            return [
              '### 📌 Sorunun Analizi',
              `Standart form katsayıları: $a = ${fmtNum(a)}$, $b = ${fmtNum(b)}$, $c = ${fmtNum(c)}$.`,
              '',
              '### ✍️ Adım Adım Çözüm',
              `**Adım 1:** Diskriminantı hesaplayalım: $\\Delta = (${fmtNum(b)})^2 - 4(${fmtNum(a)})(${fmtNum(c)}) = ${fmtNum(delta)} < 0$.`,
              '**Adım 2:** $\\Delta < 0$ olduğundan gerçel kök yoktur; eşlenik iki karmaşık kök vardır:',
              '$$',
              `x_{1,2} = \\boxed{${fmtNum(realPart)} \\pm ${fmtNum(imagPart)}i}`,
              '$$',
            ].join('\n');
          }
        }
      }
    }
  }

  return null;
}

/**
 * Offline / emergency fallback solver used ONLY when all cloud AI gateways are unreachable.
 */
/**
 * Deterministic Gauss-Jordan solver for 2x2 and 3x3 linear systems (x_1, x_2, x_3 or x, y, z)
 * used when completely offline from cloud gateways.
 */
function trySolveLinearSystem(rawText: string): string | null {
  const candidates = rawText
    .split(/[\r\n,;]+/)
    .map((s) => s.replace(/\$|\\/g, '').trim())
    .filter((s) => s.includes('='));

  if (candidates.length < 2) return null;

  const useIndexed = /x_?1/i.test(rawText) && /x_?2/i.test(rawText);
  const varNames = useIndexed
    ? /x_?3/i.test(rawText)
      ? ['x_1', 'x_2', 'x_3']
      : ['x_1', 'x_2']
    : /[zZ]/.test(rawText) && /[yY]/.test(rawText)
    ? ['x', 'y', 'z']
    : /[yY]/.test(rawText)
    ? ['x', 'y']
    : null;

  if (!varNames) return null;
  const n = varNames.length;

  const parseLinearEq = (eqStr: string): { row: number[]; rhs: number } | null => {
    const parts = eqStr.split('=');
    if (parts.length !== 2) return null;
    const evalLinear = (expr: string, vals: number[]): number | null => {
      let s = expr.replace(/\s+/g, '');
      if (useIndexed) {
        s = s
          .replace(/(\d)(x_?[123])/gi, '$1*$2')
          .replace(/x_?1/gi, `(${vals[0]})`)
          .replace(/x_?2/gi, `(${vals[1]})`)
          .replace(/x_?3/gi, `(${vals[2] ?? 0})`);
      } else {
        s = s
          .replace(/(\d)([xyzXYZ])/g, '$1*$2')
          .replace(/[xX]/g, `(${vals[0]})`)
          .replace(/[yY]/g, `(${vals[1]})`)
          .replace(/[zZ]/g, `(${vals[2] ?? 0})`);
      }
      return new SafeMathEvaluator(s).evaluate();
    };

    const zeroVec = new Array(n).fill(0);
    const l0 = evalLinear(parts[0], zeroVec);
    const r0 = evalLinear(parts[1], zeroVec);
    if (l0 === null || r0 === null) return null;
    const constDiff = l0 - r0; // a*x + constDiff = 0 -> a*x = -constDiff

    const coeffs: number[] = [];
    for (let j = 0; j < n; j++) {
      const unit = new Array(n).fill(0);
      unit[j] = 1;
      const lj = evalLinear(parts[0], unit);
      const rj = evalLinear(parts[1], unit);
      if (lj === null || rj === null) return null;
      coeffs.push(lj - rj - constDiff);
    }

    if (coeffs.every((c) => Math.abs(c) < 1e-11)) return null;
    return { row: coeffs, rhs: -constDiff };
  };

  const parsedEqs: Array<{ row: number[]; rhs: number }> = [];
  for (const c of candidates) {
    const p = parseLinearEq(c);
    if (p) parsedEqs.push(p);
    if (parsedEqs.length === n) break;
  }

  if (parsedEqs.length !== n) return null;

  const aug = parsedEqs.map((e) => [...e.row, e.rhs]);
  const initialMatrixLatex = aug
    .map((r) => `${r.slice(0, n).map(fmtNum).join(' & ')} & ${fmtNum(r[n])}`)
    .join(' \\\\\n');
  const colSpec = `${'c'.repeat(n)}|c`;

  // Gauss-Jordan elimination with partial pivoting
  const mat = aug.map((r) => [...r]);
  const stepLogs: string[] = [];

  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(mat[r][col]) > Math.abs(mat[pivot][col])) pivot = r;
    }
    if (Math.abs(mat[pivot][col]) < 1e-10) return null;
    if (pivot !== col) {
      [mat[col], mat[pivot]] = [mat[pivot], mat[col]];
      stepLogs.push(`- $R_{${col + 1}} \\leftrightarrow R_{${pivot + 1}}$ satır değişimi yapıldı.`);
    }

    const diag = mat[col][col];
    if (Math.abs(diag - 1) > 1e-10) {
      for (let j = col; j <= n; j++) mat[col][j] /= diag;
      stepLogs.push(`- $R_{${col + 1}} \\leftarrow \\frac{1}{${fmtNum(diag)}} R_{${col + 1}}$ ile pivot $1$ yapıldı.`);
    }

    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = mat[r][col];
      if (Math.abs(factor) > 1e-10) {
        for (let j = col; j <= n; j++) mat[r][j] -= factor * mat[col][j];
        stepLogs.push(`- $R_{${r + 1}} \\leftarrow R_{${r + 1}} - (${fmtNum(factor)}) R_{${col + 1}}$ uygulandı.`);
      }
    }
  }

  const rrefLatex = mat
    .map((r) => `${r.slice(0, n).map(fmtNum).join(' & ')} & ${fmtNum(r[n])}`)
    .join(' \\\\\n');

  const solLatex = varNames.map((v, idx) => `${v} = ${fmtNum(mat[idx][n])}`).join(', \\quad ');

  return [
    '### 📌 Sorunun Analizi ve Genişletilmiş Matris',
    'Verilen doğrusal denklem sisteminin genişletilmiş matrisi ($[A \\mid b]$):',
    '$$',
    `\\left[\\begin{array}{${colSpec}}\n${initialMatrixLatex}\n\\end{array}\\right]`,
    '$$',
    '',
    '### ✍️ Gauss-Jordan Eliminasyon Adımları',
    ...stepLogs,
    '',
    'İndirgenmiş satır basamak (RREF) matrisi:',
    '$$',
    `\\left[\\begin{array}{${colSpec}}\n${rrefLatex}\n\\end{array}\\right]`,
    '$$',
    '',
    '### ✅ Nihai Sonuç',
    '$$',
    `\\boxed{${solLatex}}`,
    '$$',
  ].join('\n');
}

export function solveLocallyAsLastResort(input: LocalSolveInput): string {
  const combinedSource = [input.extractedImageText, input.question].filter(Boolean).join('\n').trim();
  const linearSolved = trySolveLinearSystem(combinedSource);
  if (linearSolved) {
    return linearSolved;
  }
  const solved = trySolveEquationOrExpression(combinedSource);
  if (solved) {
    return solved;
  }

  if (input.extractedImageText) {
    return [
      '### 📌 Görselden Okunan Soru Metni',
      `> ${input.extractedImageText.split('\n').join('\n> ')}`,
      '',
      '### ⚠️ Bulut Çözüm Motoru Geçici Olarak Yoğun',
      'Görseliniz başarıyla okundu ancak derin matematiksel çözüm sunucusu şu an yoğunluk nedeniyle yanıt veremedi. Lütfen **15-20 saniye** bekleyip sorunuzu tekrar gönderin; adım adım tam çözüm hazırlanacaktır.',
    ].join('\n');
  }

  if (input.documentText) {
    const preview = input.documentText.slice(0, 900).trim();
    return [
      `### 📄 ${input.documentName || 'Yüklenen Belge'} — Ön İnceleme`,
      preview ? `> ${preview.replace(/\n+/g, '\n> ')}...` : '',
      '',
      'Belge metniniz başarıyla ayıklandı. Bulut AI servisi şu an yoğun olduğundan derin analiz için lütfen birkaç saniye sonra tekrar gönderin.',
    ]
      .filter(Boolean)
      .join('\n');
  }

  return 'Şu anda yoğunluk nedeniyle bulut çözüm motoruna ulaşılamadı. Sorunuz korundu; lütfen **15-20 saniye** bekleyip tekrar gönderin.';
}
