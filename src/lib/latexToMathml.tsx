import React from 'react';

/**
 * Zero-dependency, XSS-safe LaTeX-to-MathML AST renderer and Markdown+Math segmenter
 * engineered for University Mathematics, Engineering, Physics, Statistics & Economics.
 */

export type MarkdownSegment =
  | { type: 'markdown'; content: string }
  | { type: 'display-math'; latex: string }
  | { type: 'code-block'; language: string; code: string }
  | { type: 'table'; headers: string[]; alignments: Array<'left' | 'center' | 'right'>; rows: string[][] };

export type InlineSegment =
  | { type: 'text'; content: string }
  | { type: 'inline-math'; latex: string };

const GREEK_AND_SYMBOLS: Record<string, string> = {
  // Lowercase Greek
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ϵ', varepsilon: 'ε',
  zeta: 'ζ', eta: 'η', theta: 'θ', vartheta: 'ϑ', iota: 'ι', kappa: 'κ', varkappa: 'ϰ',
  lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π', varpi: 'ϖ', rho: 'ρ', varrho: 'ϱ',
  sigma: 'σ', varsigma: 'ς', tau: 'τ', upsilon: 'υ', phi: 'ϕ', varphi: 'φ',
  chi: 'χ', psi: 'ψ', omega: 'ω',
  // Uppercase Greek
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π',
  Sigma: 'Σ', Upsilon: 'Υ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
  // Calculus, Physics & Engineering symbols
  partial: '∂', nabla: '∇', infty: '∞', hbar: 'ℏ', ell: 'ℓ', wp: '℘',
  Re: 'ℜ', Im: 'ℑ', aleph: 'ℵ', angle: '∠', measuredangle: '∡', triangle: '△',
  perp: '⊥', parallel: '∥', degree: '°', circ: '∘', bullet: '∙', cdot: '⋅',
  cdots: '⋯', ldots: '…', dots: '…', vdots: '⋮', ddots: '⋱',
  pm: '±', mp: '∓', times: '×', div: '÷', ast: '∗', star: '⋆',
  oplus: '⊕', ominus: '⊖', otimes: '⊗', oslash: '⊘', odot: '⊙',
  dagger: '†', ddagger: '‡', prime: '′', backslash: '\\',
  // Relations & Comparisons
  leq: '≤', le: '≤', geq: '≥', ge: '≥', neq: '≠', ne: '≠',
  approx: '≈', equiv: '≡', sim: '∼', simeq: '≃', cong: '≅', propto: '∝',
  ll: '≪', gg: '≫', prec: '≺', succ: '≻', mid: '∣', nmid: '∤',
  // Set Theory & Logic
  in: '∈', notin: '∉', ni: '∋', subset: '⊂', subseteq: '⊆', supset: '⊃', supseteq: '⊇',
  nsubseteq: '⊈', cup: '∪', cap: '∩', setminus: '∖', emptyset: '∅', varnothing: '∅',
  forall: '∀', exists: '∃', nexists: '∄', neg: '¬', lnot: '¬', land: '∧', wedge: '∧',
  lor: '∨', vee: '∨', top: '⊤', bot: '⊥', vdash: '⊢', models: '⊨',
  therefore: '∴', because: '∵',
  // Arrows
  to: '→', rightarrow: '→', gets: '←', leftarrow: '←', leftrightarrow: '↔',
  Rightarrow: '⇒', implies: '⟹', Leftarrow: '⇐', impliedby: '⟸',
  Leftrightarrow: '⇔', iff: '⟺', longrightarrow: '⟶', longleftarrow: '⟵',
  longleftrightarrow: '⟷', Longrightarrow: '⟹', Longleftarrow: '⟸',
   mapsto: '↦', longmapsto: '⟼', uparrow: '↑', downarrow: '↓', updownarrow: '↕',
  nearrow: '↗', searrow: '↘', swarrow: '↙', nwarrow: '↖', harpoonup: '⇀', rightleftharpoons: '⇌',
  // Big Operators
  int: '∫', iint: '∬', iiint: '∭', oint: '∮', oiint: '∯',
  sum: '∑', prod: '∏', coprod: '∐', bigcup: '⋃', bigcap: '⋂',
  bigoplus: '⨁', bigotimes: '⨂', bigvee: '⋁', bigwedge: '⋀',
  // Delimiters
  langle: '⟨', rangle: '⟩', lfloor: '⌊', rfloor: '⌋', lceil: '⌈', rceil: '⌉',
  lbrace: '{', rbrace: '}', vert: '|', Vert: '‖',
  // Escaped literals
  '%': '%', '&': '&', '#': '#', '_': '_', '$': '$', '{': '{', '}': '}',
};

const BIG_UNDEROVER_OPS = new Set([
  '∑', '∏', '∐', '⋃', '⋂', '⨁', '⨂', '⋁', '⋀',
  'lim', 'limsup', 'liminf', 'max', 'min', 'sup', 'inf',
]);

const NAMED_FUNCTIONS: Record<string, string> = {
  sin: 'sin', cos: 'cos', tan: 'tan', cot: 'cot', sec: 'sec', csc: 'csc',
  arcsin: 'arcsin', arccos: 'arccos', arctan: 'arctan', arccot: 'arccot',
  sinh: 'sinh', cosh: 'cosh', tanh: 'tanh', coth: 'coth',
  ln: 'ln', log: 'log', lg: 'lg', exp: 'exp',
  lim: 'lim', limsup: 'lim sup', liminf: 'lim inf',
  max: 'max', min: 'min', sup: 'sup', inf: 'inf',
  det: 'det', dim: 'dim', ker: 'ker', hom: 'hom', arg: 'arg', deg: 'deg',
  gcd: 'gcd', lcm: 'lcm', Pr: 'Pr', mod: 'mod', bmod: 'mod',
  sgn: 'sgn', tr: 'tr', rank: 'rank', diag: 'diag', span: 'span',
  cov: 'Cov', var: 'Var', Corr: 'Corr', erf: 'erf', Res: 'Res',
};

const BLACKBOARD_MAP: Record<string, string> = {
  A: '𝔸', B: '𝔹', C: 'ℂ', D: '𝔻', E: '𝔼', F: '𝔽', G: '𝔾', H: 'ℍ',
  I: '𝕀', J: '𝕁', K: '𝕂', L: '𝕃', M: '𝕄', N: 'ℕ', O: '𝕆', P: 'ℙ',
  Q: 'ℚ', R: 'ℝ', S: '𝕊', T: '𝕋', U: '𝕌', V: '𝕍', W: '𝕎', X: '𝕏',
  Y: '𝕐', Z: 'ℤ',
};

const CALLIGRAPHIC_MAP: Record<string, string> = {
  A: '𝒜', B: 'ℬ', C: '𝒞', D: '𝒟', E: 'ℰ', F: 'ℱ', G: '𝒢', H: 'ℋ',
  I: 'ℐ', J: '𝒥', K: '𝒦', L: 'ℒ', M: 'ℳ', N: '𝒩', O: '𝒪', P: '𝒫',
  Q: '𝒬', R: 'ℛ', S: '𝒮', T: '𝒯', U: '𝒰', V: '𝒱', W: '𝒲', X: '𝒳',
  Y: '𝒴', Z: '𝒵',
};

const ACCENT_MAP: Record<string, string> = {
  vec: '→',
  overrightarrow: '⟶',
  overleftarrow: '⟵',
  hat: '^',
  widehat: '^',
  tilde: '~',
  widetilde: '~',
  bar: '¯',
  overline: '¯',
  dot: '˙',
  ddot: '¨',
  dddot: '⃛',
  check: 'ˇ',
  breve: '˘',
  mathring: '˚',
};

const SPACING_MAP: Record<string, string> = {
  ',': '0.17em',
  ':': '0.22em',
  ';': '0.28em',
  ' ': '0.33em',
  enspace: '0.5em',
  quad: '1em',
  qquad: '2em',
  thinspace: '0.17em',
  '!': '0em',
};

const IGNORED_COMMANDS = new Set([
  'displaystyle', 'textstyle', 'scriptstyle', 'scriptscriptstyle',
  'limits', 'nolimits', 'allowbreak', 'nonumber', 'notag', 'relax', 'strut',
  'mathstrut', 'smash',
]);

const SIZE_DELIMITER_COMMANDS = new Set([
  'big', 'Big', 'bigg', 'Bigg',
  'bigl', 'Bigl', 'biggl', 'Biggl',
  'bigr', 'Bigr', 'biggr', 'Biggr',
  'bigm', 'Bigm', 'biggm', 'Biggm',
]);

type MathNode =
  | { kind: 'mi'; value: string; normal?: boolean; bold?: boolean }
  | { kind: 'mn'; value: string }
  | { kind: 'mo'; value: string; stretchy?: boolean; underover?: boolean }
  | { kind: 'mtext'; value: string; bold?: boolean; italic?: boolean }
  | { kind: 'mspace'; width: string }
  | { kind: 'mrow'; children: MathNode[]; boxed?: boolean; bold?: boolean }
  | { kind: 'mfrac'; num: MathNode; den: MathNode; noLine?: boolean }
  | { kind: 'msqrt'; base: MathNode }
  | { kind: 'mroot'; base: MathNode; index: MathNode }
  | { kind: 'msub'; base: MathNode; sub: MathNode }
  | { kind: 'msup'; base: MathNode; sup: MathNode }
  | { kind: 'msubsup'; base: MathNode; sub: MathNode; sup: MathNode }
  | { kind: 'munder'; base: MathNode; under: MathNode }
  | { kind: 'mover'; base: MathNode; over: MathNode }
  | { kind: 'munderover'; base: MathNode; under: MathNode; over: MathNode }
  | { kind: 'mtable'; rows: MathNode[][][]; align?: 'left' | 'center' }
  | { kind: 'menclose'; base: MathNode };

class LatexParser {
  private pos = 0;

  constructor(private readonly src: string, private readonly displayMode: boolean) {}

  parseAll(stopAtRight = false): MathNode[] {
    const nodes: MathNode[] = [];
    while (this.pos < this.src.length) {
      this.skipWhitespace();
      if (this.pos >= this.src.length) break;

      if (stopAtRight && this.src.startsWith('\\right', this.pos) && !/[a-zA-Z]/.test(this.src[this.pos + 6] || '')) {
        break;
      }
      if (this.src[this.pos] === '}') {
        break;
      }

      // Handle infix \over / \choose inside group
      if (
        (this.src.startsWith('\\over', this.pos) && !/[a-zA-Z]/.test(this.src[this.pos + 5] || '')) ||
        (this.src.startsWith('\\choose', this.pos) && !/[a-zA-Z]/.test(this.src[this.pos + 7] || ''))
      ) {
        const isChoose = this.src.startsWith('\\choose', this.pos);
        this.pos += isChoose ? 7 : 5;
        const rhs = this.parseAll(stopAtRight);
        const num = wrapRow(nodes);
        const den = wrapRow(rhs);
        if (isChoose) {
          return [{
            kind: 'mrow',
            children: [
              { kind: 'mo', value: '(', stretchy: true },
              { kind: 'mfrac', num, den, noLine: true },
              { kind: 'mo', value: ')', stretchy: true },
            ],
          }];
        }
        return [{ kind: 'mfrac', num, den }];
      }

      const atom = this.parseScriptedAtom();
      if (atom) nodes.push(atom);
    }
    return nodes;
  }

  private skipWhitespace(): void {
    while (this.pos < this.src.length && /\s/.test(this.src[this.pos])) {
      this.pos++;
    }
  }

  private parseScriptedAtom(): MathNode | null {
    const base = this.parseAtom();
    if (!base) return null;

    let sub: MathNode | null = null;
    let sup: MathNode | null = null;

    while (this.pos < this.src.length) {
      this.skipWhitespace();
      const ch = this.src[this.pos];
      if (ch === '_' && !sub) {
        this.pos++;
        sub = this.parseRequiredArg();
      } else if (ch === '^' && !sup) {
        this.pos++;
        sup = this.parseRequiredArg();
      } else if (ch === '\'' && !sup) {
        let primes = '';
        while (this.src[this.pos] === '\'') {
          primes += '′';
          this.pos++;
        }
        // Check if followed by ^ as well
        this.skipWhitespace();
        if (this.src[this.pos] === '^') {
          this.pos++;
          const extraSup = this.parseRequiredArg();
          sup = { kind: 'mrow', children: [{ kind: 'mo', value: primes }, extraSup] };
        } else {
          sup = { kind: 'mo', value: primes };
        }
      } else {
        break;
      }
    }

    if (!sub && !sup) return base;

    const useUnderOver =
      this.displayMode &&
      ((base.kind === 'mo' && (base.underover || BIG_UNDEROVER_OPS.has(base.value))) ||
        (base.kind === 'mi' && BIG_UNDEROVER_OPS.has(base.value)));

    if (sub && sup) {
      return useUnderOver
        ? { kind: 'munderover', base, under: sub, over: sup }
        : { kind: 'msubsup', base, sub, sup };
    }
    if (sub) {
      return useUnderOver ? { kind: 'munder', base, under: sub } : { kind: 'msub', base, sub };
    }
    return useUnderOver ? { kind: 'mover', base, over: sup! } : { kind: 'msup', base, sup: sup! };
  }

  private parseRequiredArg(): MathNode {
    this.skipWhitespace();
    if (this.pos >= this.src.length) return { kind: 'mtext', value: '' };
    if (this.src[this.pos] === '{') {
      this.pos++; // consume {
      const inner = this.parseAll(false);
      if (this.src[this.pos] === '}') this.pos++;
      return wrapRow(inner);
    }
    const single = this.parseAtom();
    return single ?? { kind: 'mtext', value: '' };
  }

  private parseOptionalBracketArg(): MathNode | null {
    this.skipWhitespace();
    if (this.src[this.pos] !== '[') return null;
    this.pos++; // [
    const start = this.pos;
    let depth = 1;
    while (this.pos < this.src.length && depth > 0) {
      if (this.src[this.pos] === '[') depth++;
      else if (this.src[this.pos] === ']') depth--;
      if (depth > 0) this.pos++;
    }
    const content = this.src.slice(start, this.pos);
    if (this.src[this.pos] === ']') this.pos++;
    const subParser = new LatexParser(content, false);
    return wrapRow(subParser.parseAll(false));
  }

  private readRawBraceText(): string {
    this.skipWhitespace();
    if (this.src[this.pos] !== '{') {
      const ch = this.src[this.pos] || '';
      if (ch) this.pos++;
      return ch;
    }
    this.pos++;
    let depth = 1;
    const start = this.pos;
    while (this.pos < this.src.length && depth > 0) {
      if (this.src[this.pos] === '\\') {
        this.pos += 2;
        continue;
      }
      if (this.src[this.pos] === '{') depth++;
      else if (this.src[this.pos] === '}') depth--;
      if (depth > 0) this.pos++;
    }
    const raw = this.src.slice(start, this.pos);
    if (this.src[this.pos] === '}') this.pos++;
    return raw;
  }

  private readDelimiterToken(): string {
    this.skipWhitespace();
    if (this.pos >= this.src.length) return '';
    if (this.src[this.pos] === '\\') {
      this.pos++;
      if (this.pos >= this.src.length) return '';
      if (!/[a-zA-Z]/.test(this.src[this.pos])) {
        const sym = this.src[this.pos++];
        if (sym === '|') return '‖';
        if (sym === '{' || sym === '}') return sym;
        return GREEK_AND_SYMBOLS[sym] ?? sym;
      }
      const start = this.pos;
      while (this.pos < this.src.length && /[a-zA-Z]/.test(this.src[this.pos])) this.pos++;
      const cmd = this.src.slice(start, this.pos);
      if (cmd === 'langle') return '⟨';
      if (cmd === 'rangle') return '⟩';
      if (cmd === 'lfloor') return '⌊';
      if (cmd === 'rfloor') return '⌋';
      if (cmd === 'lceil') return '⌈';
      if (cmd === 'rceil') return '⌉';
      if (cmd === 'lbrace') return '{';
      if (cmd === 'rbrace') return '}';
      if (cmd === 'vert' || cmd === 'lvert' || cmd === 'rvert') return '|';
      if (cmd === 'Vert' || cmd === 'lVert' || cmd === 'rVert') return '‖';
      return GREEK_AND_SYMBOLS[cmd] ?? '';
    }
    const ch = this.src[this.pos++];
    return ch === '.' ? '' : ch;
  }

  private parseAtom(): MathNode | null {
    this.skipWhitespace();
    if (this.pos >= this.src.length) return null;

    const ch = this.src[this.pos];

    // Group {...}
    if (ch === '{') {
      this.pos++;
      const inner = this.parseAll(false);
      if (this.src[this.pos] === '}') this.pos++;
      return wrapRow(inner);
    }

    if (ch === '}') {
      return null;
    }

    // Numbers (integers & decimals)
    if (/[0-9]/.test(ch)) {
      const start = this.pos;
      while (this.pos < this.src.length && /[0-9.]/.test(this.src[this.pos])) {
        // Avoid trailing dot if not followed by digit
        if (this.src[this.pos] === '.' && !/[0-9]/.test(this.src[this.pos + 1] || '')) break;
        this.pos++;
      }
      return { kind: 'mn', value: this.src.slice(start, this.pos) };
    }

    // Latin letters
    if (/[a-zA-Z]/.test(ch)) {
      this.pos++;
      return { kind: 'mi', value: ch };
    }

    // Backslash command
    if (ch === '\\') {
      return this.parseCommand();
    }

    // Operators & punctuation
    this.pos++;
    if (ch === '-') return { kind: 'mo', value: '−' };
    if (ch === '*' ) return { kind: 'mo', value: '∗' };
    if (ch === '~') return { kind: 'mspace', width: '0.33em' };
    if (ch === '&') return { kind: 'mspace', width: '0.5em' };
    return { kind: 'mo', value: ch };
  }

  private parseCommand(): MathNode | null {
    this.pos++; // skip '\'
    if (this.pos >= this.src.length) return null;

    // Double backslash \\ (line break outside environment)
    if (this.src[this.pos] === '\\') {
      this.pos++;
      // Optional [spacing] after \\
      if (this.src[this.pos] === '[') this.parseOptionalBracketArg();
      return { kind: 'mspace', width: '0.6em' };
    }

    // Single non-alpha escaped character (\, \; \{ \} \% \| etc.)
    if (!/[a-zA-Z]/.test(this.src[this.pos])) {
      const sym = this.src[this.pos++];
      if (sym === '|') return { kind: 'mo', value: '‖' };
      if (sym in SPACING_MAP) {
        return SPACING_MAP[sym] === '0em' ? null : { kind: 'mspace', width: SPACING_MAP[sym] };
      }
      if (sym in GREEK_AND_SYMBOLS) {
        return { kind: 'mo', value: GREEK_AND_SYMBOLS[sym] };
      }
      return { kind: 'mo', value: sym };
    }

    // Read alphabetic command name
    const start = this.pos;
    while (this.pos < this.src.length && /[a-zA-Z]/.test(this.src[this.pos])) {
      this.pos++;
    }
    const cmd = this.src.slice(start, this.pos);
    // Optional star on \operatorname* or \tag*
    if ((cmd === 'operatorname' || cmd === 'tag') && this.src[this.pos] === '*') {
      this.pos++;
    }

    if (IGNORED_COMMANDS.has(cmd)) {
      return this.parseAtom();
    }

    if (cmd === 'color' || cmd === 'textcolor') {
      this.readRawBraceText(); // color name
      if (cmd === 'textcolor') return this.parseRequiredArg();
      return this.parseAtom();
    }

    if (cmd === 'tag') {
      const tagText = this.readRawBraceText();
      return { kind: 'mtext', value: `  (${tagText})` };
    }

    if (cmd in SPACING_MAP) {
      return { kind: 'mspace', width: SPACING_MAP[cmd] };
    }

    if (cmd === 'hspace' || cmd === 'kern' || cmd === 'mkern') {
      this.readRawBraceText();
      return { kind: 'mspace', width: '0.5em' };
    }

    if (cmd === 'phantom' || cmd === 'hphantom' || cmd === 'vphantom') {
      this.parseRequiredArg();
      return { kind: 'mspace', width: '0.4em' };
    }

    // Environments: \begin{...} ... \end{...}
    if (cmd === 'begin') {
      const envName = this.readRawBraceText().trim();
      return this.parseEnvironment(envName);
    }

    // Left / Right stretchy delimiters
    if (cmd === 'left') {
      const openDelim = this.readDelimiterToken();
      const bodyNodes = this.parseAll(true);
      let closeDelim = '';
      if (this.src.startsWith('\\right', this.pos)) {
        this.pos += 6;
        closeDelim = this.readDelimiterToken();
      }
      const children: MathNode[] = [];
      if (openDelim) children.push({ kind: 'mo', value: openDelim, stretchy: true });
      children.push(...bodyNodes);
      if (closeDelim) children.push({ kind: 'mo', value: closeDelim, stretchy: true });
      return { kind: 'mrow', children };
    }

    if (SIZE_DELIMITER_COMMANDS.has(cmd)) {
      const delim = this.readDelimiterToken();
      return delim ? { kind: 'mo', value: delim, stretchy: true } : null;
    }

    // Fractions & Binomials
    if (cmd === 'frac' || cmd === 'dfrac' || cmd === 'tfrac' || cmd === 'cfrac') {
      const num = this.parseRequiredArg();
      const den = this.parseRequiredArg();
      return { kind: 'mfrac', num, den };
    }

    if (cmd === 'binom' || cmd === 'dbinom' || cmd === 'tbinom') {
      const n = this.parseRequiredArg();
      const k = this.parseRequiredArg();
      return {
        kind: 'mrow',
        children: [
          { kind: 'mo', value: '(', stretchy: true },
          { kind: 'mfrac', num: n, den: k, noLine: true },
          { kind: 'mo', value: ')', stretchy: true },
        ],
      };
    }

    // Roots
    if (cmd === 'sqrt') {
      const degree = this.parseOptionalBracketArg();
      const radicand = this.parseRequiredArg();
      return degree ? { kind: 'mroot', base: radicand, index: degree } : { kind: 'msqrt', base: radicand };
    }

    // Boxed final result
    if (cmd === 'boxed') {
      const inner = this.parseRequiredArg();
      return { kind: 'mrow', children: [inner], boxed: true };
    }

    // Cancel / strikeout
    if (cmd === 'cancel' || cmd === 'bcancel' || cmd === 'xcancel' || cmd === 'sout') {
      const inner = this.parseRequiredArg();
      return { kind: 'menclose', base: inner };
    }

    // Over/Under braces & stacking
    if (cmd === 'overbrace') {
      const base = this.parseRequiredArg();
      return { kind: 'mover', base, over: { kind: 'mo', value: '⏞', stretchy: true } };
    }
    if (cmd === 'underbrace') {
      const base = this.parseRequiredArg();
      return { kind: 'munder', base, under: { kind: 'mo', value: '⏟', stretchy: true } };
    }
    if (cmd === 'underline') {
      const base = this.parseRequiredArg();
      return { kind: 'munder', base, under: { kind: 'mo', value: '_', stretchy: true } };
    }
    if (cmd === 'overset' || cmd === 'stackrel') {
      const top = this.parseRequiredArg();
      const base = this.parseRequiredArg();
      return { kind: 'mover', base, over: top };
    }
    if (cmd === 'underset') {
      const bot = this.parseRequiredArg();
      const base = this.parseRequiredArg();
      return { kind: 'munder', base, under: bot };
    }
    if (cmd === 'xrightarrow' || cmd === 'xleftarrow') {
      const arrow = cmd === 'xrightarrow' ? '⟶' : '⟵';
      const sub = this.parseOptionalBracketArg();
      const sup = this.parseRequiredArg();
      const base: MathNode = { kind: 'mo', value: arrow, stretchy: true };
      return sub ? { kind: 'munderover', base, under: sub, over: sup } : { kind: 'mover', base, over: sup };
    }

    // Accents (\vec, \hat, \bar, \dot, \ddot, \overline, etc.)
    if (cmd in ACCENT_MAP) {
      const base = this.parseRequiredArg();
      return { kind: 'mover', base, over: { kind: 'mo', value: ACCENT_MAP[cmd] } };
    }

    // Text & font styles
    if (cmd === 'text' || cmd === 'textrm' || cmd === 'textnormal' || cmd === 'mbox' || cmd === 'hbox') {
      const raw = this.readRawBraceText();
      return { kind: 'mtext', value: raw };
    }
    if (cmd === 'textbf') {
      const raw = this.readRawBraceText();
      return { kind: 'mtext', value: raw, bold: true };
    }
    if (cmd === 'textit' || cmd === 'emph') {
      const raw = this.readRawBraceText();
      return { kind: 'mtext', value: raw, italic: true };
    }
    if (cmd === 'operatorname') {
      const raw = this.readRawBraceText();
      return { kind: 'mi', value: raw, normal: true };
    }
    if (cmd === 'mathrm') {
      const raw = this.readRawBraceText();
      // If simple letters/units (e.g. \mathrm{kg}, \mathrm{d}x, \mathrm{m/s}), render upright
      if (/^[a-zA-Z0-9\s./-]+$/.test(raw)) {
        return { kind: 'mi', value: raw, normal: true };
      }
      const sub = new LatexParser(raw, false);
      return wrapRow(sub.parseAll(false));
    }
    if (cmd === 'mathbf' || cmd === 'boldsymbol' || cmd === 'bm') {
      const inner = this.parseRequiredArg();
      if (inner.kind === 'mi') return { ...inner, bold: true, normal: true };
      return { kind: 'mrow', children: [inner], bold: true };
    }
    if (cmd === 'mathit') {
      const raw = this.readRawBraceText();
      return { kind: 'mi', value: raw };
    }
    if (cmd === 'mathbb') {
      const raw = this.readRawBraceText().trim();
      const mapped = raw.split('').map((c) => BLACKBOARD_MAP[c] ?? c).join('');
      return { kind: 'mi', value: mapped, normal: true };
    }
    if (cmd === 'mathcal' || cmd === 'mathscr') {
      const raw = this.readRawBraceText().trim();
      const mapped = raw.split('').map((c) => CALLIGRAPHIC_MAP[c] ?? c).join('');
      return { kind: 'mi', value: mapped, normal: true };
    }
    if (cmd === 'pmod') {
      const arg = this.parseRequiredArg();
      return {
        kind: 'mrow',
        children: [
          { kind: 'mspace', width: '0.4em' },
          { kind: 'mo', value: '(' },
          { kind: 'mi', value: 'mod', normal: true },
          { kind: 'mspace', width: '0.25em' },
          arg,
          { kind: 'mo', value: ')' },
        ],
      };
    }

    // Named trigonometric / algebraic functions
    if (cmd in NAMED_FUNCTIONS) {
      const fnName = NAMED_FUNCTIONS[cmd];
      return {
        kind: 'mi',
        value: fnName,
        normal: true,
      };
    }

    // Negated relation \not=...
    if (cmd === 'not') {
      const next = this.parseAtom();
      if (next && next.kind === 'mo') {
        if (next.value === '=') return { kind: 'mo', value: '≠' };
        if (next.value === '∈') return { kind: 'mo', value: '∉' };
        if (next.value === '⊂') return { kind: 'mo', value: '⊄' };
        if (next.value === '⊆') return { kind: 'mo', value: '⊈' };
      }
      return next ? { kind: 'menclose', base: next } : null;
    }

    // Greek letters & standard symbols
    if (cmd in GREEK_AND_SYMBOLS) {
      const val = GREEK_AND_SYMBOLS[cmd];
      const isAlphaGreek = /^[α-ωΑ-Ω∂∇ℓℏℵℜℑ]$/.test(val);
      if (isAlphaGreek) {
        return { kind: 'mi', value: val, normal: /^[Α-Ω∂∇]$/.test(val) };
      }
      return {
        kind: 'mo',
        value: val,
        underover: BIG_UNDEROVER_OPS.has(val),
      };
    }

    // Unknown command fallback: render readable identifier instead of raw backslash
    return { kind: 'mi', value: cmd, normal: true };
  }

  private parseEnvironment(envName: string): MathNode {
    const endMarker = `\\end{${envName}}`;
    // Find matching \end{envName} with nested \begin...\end awareness
    const beginMarker = `\\begin{${envName}}`;
    let depth = 1;
    let cursor = this.pos;
    while (cursor < this.src.length && depth > 0) {
      const nextBegin = this.src.indexOf(beginMarker, cursor);
      const nextEnd = this.src.indexOf(endMarker, cursor);
      if (nextEnd === -1) {
        cursor = this.src.length;
        break;
      }
      if (nextBegin !== -1 && nextBegin < nextEnd) {
        depth++;
        cursor = nextBegin + beginMarker.length;
      } else {
        depth--;
        if (depth === 0) {
          cursor = nextEnd;
          break;
        }
        cursor = nextEnd + endMarker.length;
      }
    }

    let body = this.src.slice(this.pos, cursor);
    this.pos = cursor < this.src.length ? cursor + endMarker.length : this.src.length;

    // Strip optional column alignment spec on array/matrix* e.g. {cc|c} or [r]
    if (envName === 'array' || envName === 'subarray') {
      body = body.replace(/^\s*\{[^}]*\}/, '');
    } else if (envName.endsWith('*') && /^\s*\[[^\]]*\]/.test(body)) {
      body = body.replace(/^\s*\[[^\]]*\]/, '');
    }

    // Strip \hline / \cline{...}
    body = body.replace(/\\hline\b/g, '').replace(/\\cline\s*\{[^}]*\}/g, '');

    const rawRows = splitTopLevelLatex(body, '\\\\')
      .map((r) => r.replace(/^\s*\[[^\]]*\]/, '').trim())
      .filter((r) => r.length > 0);

    const parsedRows: MathNode[][][] = rawRows.map((rowStr) => {
      const rawCells = splitTopLevelLatex(rowStr, '&');
      return rawCells.map((cellStr) => {
        const cellParser = new LatexParser(cellStr.trim(), this.displayMode);
        return cellParser.parseAll(false);
      });
    });

    const isLeftAligned =
      envName === 'cases' ||
      envName === 'dcases' ||
      envName === 'aligned' ||
      envName === 'align' ||
      envName === 'align*' ||
      envName === 'split';

    const table: MathNode = {
      kind: 'mtable',
      rows: parsedRows,
      align: isLeftAligned ? 'left' : 'center',
    };

    const wrappers: Record<string, [string, string]> = {
      pmatrix: ['(', ')'],
      bmatrix: ['[', ']'],
      Bmatrix: ['{', '}'],
      vmatrix: ['|', '|'],
      Vmatrix: ['‖', '‖'],
      cases: ['{', ''],
      dcases: ['{', ''],
      rcases: ['', '}'],
    };

    const pair = wrappers[envName];
    if (!pair) return table;

    const children: MathNode[] = [];
    if (pair[0]) children.push({ kind: 'mo', value: pair[0], stretchy: true });
    children.push(table);
    if (pair[1]) children.push({ kind: 'mo', value: pair[1], stretchy: true });
    return { kind: 'mrow', children };
  }
}

function wrapRow(nodes: MathNode[]): MathNode {
  if (nodes.length === 0) return { kind: 'mtext', value: '' };
  if (nodes.length === 1) return nodes[0];
  return { kind: 'mrow', children: nodes };
}

/**
 * Splits a LaTeX string by `delimiter` ('\\\\' or '&') only at top brace/environment depth.
 */
function splitTopLevelLatex(input: string, delimiter: '\\\\' | '&'): string[] {
  const parts: string[] = [];
  let braceDepth = 0;
  let envDepth = 0;
  let lastIdx = 0;
  let i = 0;

  while (i < input.length) {
    if (input.startsWith('\\begin{', i)) {
      envDepth++;
      i += 7;
      continue;
    }
    if (input.startsWith('\\end{', i)) {
      envDepth = Math.max(0, envDepth - 1);
      i += 5;
      continue;
    }
    if (delimiter === '\\\\' && braceDepth === 0 && envDepth === 0 && input.startsWith('\\\\', i)) {
      parts.push(input.slice(lastIdx, i));
      i += 2;
      lastIdx = i;
      continue;
    }
    if (input[i] === '\\') {
      i += 2;
      continue;
    }
    if (input[i] === '{') {
      braceDepth++;
    } else if (input[i] === '}') {
      braceDepth = Math.max(0, braceDepth - 1);
    } else if (delimiter === '&' && input[i] === '&' && braceDepth === 0 && envDepth === 0) {
      parts.push(input.slice(lastIdx, i));
      i++;
      lastIdx = i;
      continue;
    }
    i++;
  }

  parts.push(input.slice(lastIdx));
  return parts;
}

function renderNode(node: MathNode, key: string | number): React.ReactNode {
  switch (node.kind) {
    case 'mi': {
      return React.createElement(
        'mi',
        {
          key,
          ...(node.normal ? { mathvariant: 'normal' } : {}),
          ...(node.bold ? { className: 'math-bold' } : {}),
        },
        node.value,
      );
    }
    case 'mn':
      return React.createElement('mn', { key }, node.value);
    case 'mo':
      return React.createElement(
        'mo',
        { key, ...(node.stretchy ? { stretchy: 'true' } : { stretchy: 'false' }) },
        node.value,
      );
    case 'mtext': {
      const classes = [node.bold ? 'math-bold' : '', node.italic ? 'math-italic' : '']
        .filter(Boolean)
        .join(' ');
      return React.createElement(
        'mtext',
        { key, ...(classes ? { className: classes } : {}) },
        node.value,
      );
    }
    case 'mspace':
      return React.createElement('mspace', { key, width: node.width });
    case 'mrow': {
      const props: Record<string, unknown> = { key };
      if (node.boxed) {
        props.className = 'math-boxed';
      } else if (node.bold) {
        props.className = 'math-bold';
      }
      return React.createElement(
        'mrow',
        props,
        node.children.map((c, idx) => renderNode(c, idx)),
      );
    }
    case 'mfrac':
      return React.createElement(
        'mfrac',
        { key, ...(node.noLine ? { linethickness: '0' } : {}) },
        renderNode(node.num, 'n'),
        renderNode(node.den, 'd'),
      );
    case 'msqrt':
      return React.createElement('msqrt', { key }, renderNode(node.base, 'b'));
    case 'mroot':
      return React.createElement('mroot', { key }, renderNode(node.base, 'b'), renderNode(node.index, 'i'));
    case 'msub':
      return React.createElement('msub', { key }, renderNode(node.base, 'b'), renderNode(node.sub, 's'));
    case 'msup':
      return React.createElement('msup', { key }, renderNode(node.base, 'b'), renderNode(node.sup, 'p'));
    case 'msubsup':
      return React.createElement(
        'msubsup',
        { key },
        renderNode(node.base, 'b'),
        renderNode(node.sub, 's'),
        renderNode(node.sup, 'p'),
      );
    case 'munder':
      return React.createElement('munder', { key }, renderNode(node.base, 'b'), renderNode(node.under, 'u'));
    case 'mover':
      return React.createElement('mover', { key }, renderNode(node.base, 'b'), renderNode(node.over, 'o'));
    case 'munderover':
      return React.createElement(
        'munderover',
        { key },
        renderNode(node.base, 'b'),
        renderNode(node.under, 'u'),
        renderNode(node.over, 'o'),
      );
    case 'menclose':
      return React.createElement(
        'menclose',
        { key, notation: 'updiagonalstrike', className: 'line-through opacity-75' },
        renderNode(node.base, 'b'),
      );
    case 'mtable':
      return React.createElement(
        'mtable',
        { key, ...(node.align === 'left' ? { columnalign: 'left' } : {}) },
        node.rows.map((row, rIdx) =>
          React.createElement(
            'mtr',
            { key: rIdx },
            row.map((cellNodes, cIdx) =>
              React.createElement(
                'mtd',
                {
                  key: cIdx,
                  className: node.align === 'left' ? 'math-cell math-cell-left' : 'math-cell',
                },
                React.createElement(
                  'mrow',
                  null,
                  cellNodes.map((cn, nIdx) => renderNode(cn, nIdx)),
                ),
              ),
            ),
          ),
        ),
      );
  }
}

export function renderLatexToMathML(latex: string, displayMode = false): React.ReactNode {
  const cleaned = latex.trim();
  if (!cleaned) return null;

  try {
    const parser = new LatexParser(cleaned, displayMode);
    const nodes = parser.parseAll(false);
    return React.createElement(
      'math',
      {
        xmlns: 'http://www.w3.org/1998/Math/MathML',
        display: displayMode ? 'block' : 'inline',
        className: displayMode ? 'academic-math-block' : 'academic-math-inline',
      },
      React.createElement(
        'mrow',
        null,
        nodes.map((n, idx) => renderNode(n, idx)),
      ),
    );
  } catch {
    return React.createElement('code', { className: 'font-mono text-xs' }, cleaned);
  }
}

/**
 * Splits inline text into normal text and inline math ($...$ and \(...\))
 * while avoiding currency false-positives like "$100 ve $200".
 */
export function splitInlineMath(text: string): InlineSegment[] {
  if (!text || (!text.includes('$') && !text.includes('\\('))) {
    return [{ type: 'text', content: text }];
  }

  const segments: InlineSegment[] = [];
  let cursor = 0;
  let plainStart = 0;

  while (cursor < text.length) {
    // Escaped \$
    if (text[cursor] === '\\' && text[cursor + 1] === '$') {
      cursor += 2;
      continue;
    }

    // \( ... \)
    if (text[cursor] === '\\' && text[cursor + 1] === '(') {
      const endIdx = text.indexOf('\\)', cursor + 2);
      if (endIdx !== -1) {
        if (cursor > plainStart) {
          segments.push({ type: 'text', content: text.slice(plainStart, cursor) });
        }
        segments.push({ type: 'inline-math', latex: text.slice(cursor + 2, endIdx) });
        cursor = endIdx + 2;
        plainStart = cursor;
        continue;
      }
    }

    // $ ... $ (single dollar, not $$)
    if (text[cursor] === '$' && text[cursor + 1] !== '$') {
      const afterOpen = text[cursor + 1] || '';
      // Standard pandoc/remark-math rule: opening $ cannot be followed by whitespace
      if (afterOpen && !/\s/.test(afterOpen)) {
        let closeIdx = cursor + 1;
        let found = -1;
        while (closeIdx < text.length) {
          if (text[closeIdx] === '\\') {
            closeIdx += 2;
            continue;
          }
          if (text[closeIdx] === '\n') break;
          if (text[closeIdx] === '$' && text[closeIdx + 1] !== '$') {
            const beforeClose = text[closeIdx - 1] || '';
            const afterClose = text[closeIdx + 1] || '';
            // Closing $ cannot be preceded by whitespace and cannot be followed immediately by a digit (avoids $50 ... $100)
            if (!/\s/.test(beforeClose) && !/[0-9]/.test(afterClose)) {
              found = closeIdx;
              break;
            }
          }
          closeIdx++;
        }

        if (found !== -1) {
          const candidate = text.slice(cursor + 1, found);
          if (cursor > plainStart) {
            segments.push({ type: 'text', content: text.slice(plainStart, cursor) });
          }
          segments.push({ type: 'inline-math', latex: candidate });
          cursor = found + 1;
          plainStart = cursor;
          continue;
        }
      }
    }

    cursor++;
  }

  if (plainStart < text.length) {
    segments.push({ type: 'text', content: text.slice(plainStart) });
  }

  return segments.map((seg) =>
    seg.type === 'text' ? { ...seg, content: seg.content.replace(/\\\$/g, '$') } : seg,
  );
}

/**
 * Protects inline math ($...$ and \(...\)) outside inline backtick code spans by replacing
 * them with opaque inline-code tokens (`@@ECMATH_0@@`) so ReactMarkdown never mangles
 * underscores (_), asterisks (*), brackets, or backslashes inside formulas.
 */
export function protectInlineMathForMarkdown(markdown: string): {
  protectedText: string;
  mathExpressions: string[];
} {
  if (!markdown || (!markdown.includes('$') && !markdown.includes('\\('))) {
    return { protectedText: markdown, mathExpressions: [] };
  }

  const mathExpressions: string[] = [];
  // Preserve existing inline backtick spans `...` intact while transforming non-code chunks
  const parts = markdown.split(/(`+[^`\n]*?`+)/g);
  const transformed = parts.map((part, idx) => {
    // Odd indices in split with capturing group are the matched inline code spans
    if (idx % 2 === 1) return part;
    const inlineSegs = splitInlineMath(part);
    return inlineSegs
      .map((seg) => {
        if (seg.type === 'text') return seg.content;
        const tokenIndex = mathExpressions.length;
        mathExpressions.push(seg.latex);
        return `\`@@ECMATH_${tokenIndex}@@\``;
      })
      .join('');
  });

  return {
    protectedText: transformed.join(''),
    mathExpressions,
  };
}

/**
 * Segments full assistant response into code blocks, display math blocks, GFM tables, and markdown blocks.
 */
export function segmentAcademicMarkdown(raw: string): MarkdownSegment[] {
  if (!raw) return [];
  const normalized = raw.replace(/\r\n/g, '\n');

  // Step 1: Extract fenced code blocks & display math blocks first
  const coarseSegments: Array<MarkdownSegment> = [];
  const blockPattern =
    /```([a-zA-Z0-9_+-]*)\n([\s\S]*?)```|\$\$([\s\S]*?)\$\$|\\\[([\s\S]*?)\\\]|(\\begin\{(align\*?|aligned|equation\*?|gather\*?|pmatrix|bmatrix|vmatrix|cases)\}[\s\S]*?\\end\{\5\})/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = blockPattern.exec(normalized)) !== null) {
    if (match.index > lastIndex) {
      coarseSegments.push({
        type: 'markdown',
        content: normalized.slice(lastIndex, match.index),
      });
    }

    if (match[1] !== undefined || match[2] !== undefined) {
      const lang = (match[1] || '').trim().toLowerCase();
      const body = match[2] ?? '';
      if (lang === 'math' || lang === 'latex' || lang === 'tex') {
        coarseSegments.push({ type: 'display-math', latex: body.trim() });
      } else {
        coarseSegments.push({ type: 'code-block', language: lang, code: body.replace(/\n$/, '') });
      }
    } else if (match[3] !== undefined) {
      coarseSegments.push({ type: 'display-math', latex: match[3].trim() });
    } else if (match[4] !== undefined) {
      coarseSegments.push({ type: 'display-math', latex: match[4].trim() });
    } else if (match[5] !== undefined) {
      coarseSegments.push({ type: 'display-math', latex: match[5].trim() });
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < normalized.length) {
    coarseSegments.push({ type: 'markdown', content: normalized.slice(lastIndex) });
  }

  // Step 2: Within markdown segments, extract GFM pipe tables
  const finalSegments: MarkdownSegment[] = [];
  for (const seg of coarseSegments) {
    if (seg.type !== 'markdown') {
      finalSegments.push(seg);
      continue;
    }
    finalSegments.push(...extractMarkdownTables(seg.content));
  }

  return finalSegments.filter(
    (s) => s.type !== 'markdown' || s.content.trim().length > 0,
  );
}

function splitTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  const cells: string[] = [];
  let current = '';
  let inMath = false;

  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (ch === '\\' && i + 1 < trimmed.length) {
      if (trimmed[i + 1] === '|') {
        current += '|';
        i++;
        continue;
      }
      current += ch + trimmed[i + 1];
      i++;
      continue;
    }
    if (ch === '$') {
      inMath = !inMath;
      current += ch;
      continue;
    }
    if (ch === '|' && !inMath) {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  cells.push(current.trim());
  return cells;
}

function isSeparatorLine(line: string, expectedCols: number): Array<'left' | 'center' | 'right'> | null {
  if (!line.includes('|') || !line.includes('-')) return null;
  const cells = splitTableRow(line);
  if (cells.length !== expectedCols || expectedCols < 2) return null;
  const alignments: Array<'left' | 'center' | 'right'> = [];
  for (const cell of cells) {
    if (!/^:?-{2,}:?$/.test(cell)) return null;
    if (cell.startsWith(':') && cell.endsWith(':')) alignments.push('center');
    else if (cell.endsWith(':')) alignments.push('right');
    else alignments.push('left');
  }
  return alignments;
}

function extractMarkdownTables(text: string): MarkdownSegment[] {
  const lines = text.split('\n');
  const out: MarkdownSegment[] = [];
  let mdBuffer: string[] = [];
  let i = 0;

  const flushMd = () => {
    if (mdBuffer.length > 0) {
      out.push({ type: 'markdown', content: mdBuffer.join('\n') });
      mdBuffer = [];
    }
  };

  while (i < lines.length) {
    const line = lines[i];
    const nextLine = lines[i + 1];

    if (line && nextLine && line.includes('|')) {
      const headers = splitTableRow(line);
      const alignments = headers.length >= 2 ? isSeparatorLine(nextLine, headers.length) : null;

      if (alignments) {
        flushMd();
        const rows: string[][] = [];
        i += 2;
        while (i < lines.length && lines[i].trim().includes('|') && lines[i].trim() !== '') {
          const rowCells = splitTableRow(lines[i]);
          const normalizedRow = headers.map((_, idx) => rowCells[idx] ?? '');
          rows.push(normalizedRow);
          i++;
        }
        out.push({ type: 'table', headers, alignments, rows });
        continue;
      }
    }

    mdBuffer.push(line);
    i++;
  }

  flushMd();
  return out;
}
