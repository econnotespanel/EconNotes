const fs = require('fs');

let css = fs.readFileSync('src/index.css', 'utf8').replace(/\r\n/g, '\n');

const oldRoot = `  :root {
    --background: 225 33% 98%; --foreground: 224 34% 13%;
    --card: 0 0% 100%; --card-foreground: 224 34% 13%;
    --popover: 0 0% 100%; --popover-foreground: 224 34% 13%;
    --primary: 226 91% 58%; --primary-foreground: 0 0% 100%; --primary-glow: 226 91% 68%;
    --secondary: 245 72% 59%; --secondary-foreground: 0 0% 100%;
    --muted: 224 35% 95%; --muted-foreground: 218 17% 40%;
    --accent: 226 91% 58%; --accent-foreground: 0 0% 100%;
    --destructive: 0 73% 50%; --destructive-foreground: 0 0% 100%;
    --success: 163 77% 35%; --success-foreground: 0 0% 100%;
    --warning: 32 94% 44%; --warning-foreground: 224 34% 13%;
    --border: 221 31% 88%; --input: 221 31% 90%; --ring: 226 91% 58%;
    --radius: 0.75rem;
    --sidebar-background: 0 0% 100%; --sidebar-foreground: 218 17% 40%;
    --sidebar-primary: 226 91% 58%; --sidebar-primary-foreground: 0 0% 100%;
    --sidebar-accent: 222 100% 96%; --sidebar-accent-foreground: 226 91% 52%;
    --sidebar-border: 221 31% 88%; --sidebar-ring: 226 91% 58%;
    --neon-cyan: 226 91% 58%; --neon-blue: 245 72% 59%; --neon-indigo: 245 72% 59%; --neon-ice: 222 94% 75%;
    --gradient-neon: linear-gradient(115deg, hsl(var(--primary)), hsl(var(--secondary)));
    --gradient-neon-soft: linear-gradient(115deg, hsl(var(--primary) / 0.1), hsl(var(--secondary) / 0.07));
    --glow-cyan: 0 8px 24px hsl(var(--primary) / 0.13); --glow-blue: 0 8px 24px hsl(var(--secondary) / 0.13);
    --sheen: linear-gradient(180deg, hsl(0 0% 100% / 0.45), transparent);
    --hairline: var(--border);
    --panel-shadow: 0 2px 4px hsl(226 30% 30% / 0.03), 0 12px 24px hsl(226 30% 30% / 0.035);
    --panel-shadow-hover: 0 10px 30px hsl(226 45% 35% / 0.1);
    --sticker-pink: var(--primary); --sticker-lime: var(--success); --sticker-cobalt: var(--secondary);
  }
  .dark {
    --background: 224 25% 11%; --foreground: 220 25% 94%;
    --card: 224 22% 16%; --card-foreground: 220 25% 94%;
    --popover: 224 22% 16%; --popover-foreground: 220 25% 94%;
    --primary: 226 89% 72%; --primary-foreground: 224 28% 10%; --primary-glow: 226 89% 78%;
    --secondary: 245 75% 75%; --secondary-foreground: 224 28% 10%;
    --muted: 224 18% 23%; --muted-foreground: 219 17% 70%;
    --accent: 226 89% 72%; --accent-foreground: 224 28% 10%;
    --destructive: 0 69% 68%; --destructive-foreground: 224 28% 10%;
    --success: 163 57% 61%; --success-foreground: 224 28% 10%;
    --warning: 35 83% 65%; --warning-foreground: 224 28% 10%;
    --border: 223 19% 28%; --input: 223 19% 28%; --ring: 226 89% 72%;
    --sidebar-background: 224 22% 16%; --sidebar-foreground: 219 17% 79%;
    --sidebar-primary: 226 89% 72%; --sidebar-primary-foreground: 224 28% 10%;
    --sidebar-accent: 224 21% 24%; --sidebar-accent-foreground: 226 89% 78%;
    --sidebar-border: 223 19% 28%; --sidebar-ring: 226 89% 72%;
    --neon-cyan: 226 89% 72%; --neon-blue: 245 75% 75%; --neon-indigo: 245 75% 75%; --neon-ice: 222 94% 85%;
    --gradient-neon: linear-gradient(115deg, hsl(var(--primary)), hsl(var(--secondary)));
    --gradient-neon-soft: linear-gradient(115deg, hsl(var(--primary) / 0.1), hsl(var(--secondary) / 0.07));
    --glow-cyan: 0 8px 24px hsl(var(--primary) / 0.13); --glow-blue: 0 8px 24px hsl(var(--secondary) / 0.13);
    --sheen: linear-gradient(180deg, hsl(var(--foreground) / 0.04), transparent);
    --hairline: var(--border);
    --panel-shadow: 0 6px 22px hsl(224 40% 4% / 0.16);
    --panel-shadow-hover: 0 12px 28px hsl(224 40% 4% / 0.25);
    --sticker-pink: var(--primary); --sticker-lime: var(--success); --sticker-cobalt: var(--secondary);
  }`;

const newRoot = `  :root {
    --background: 220 38% 97%; --foreground: 224 45% 11%;
    --card: 0 0% 100%; --card-foreground: 224 45% 11%;
    --popover: 0 0% 100%; --popover-foreground: 224 45% 11%;
    --primary: 215 100% 38%; --primary-foreground: 0 0% 100%; --primary-glow: 215 100% 55%;
    --secondary: 210 95% 48%; --secondary-foreground: 0 0% 100%;
    --muted: 220 30% 93%; --muted-foreground: 220 18% 40%;
    --accent: 215 100% 38%; --accent-foreground: 0 0% 100%;
    --destructive: 0 73% 50%; --destructive-foreground: 0 0% 100%;
    --success: 158 80% 36%; --success-foreground: 0 0% 100%;
    --warning: 38 92% 50%; --warning-foreground: 224 45% 11%;
    --border: 220 25% 88%; --input: 220 25% 90%; --ring: 215 100% 45%;
    --radius: 0.875rem;
    --sidebar-background: 0 0% 100%; --sidebar-foreground: 220 18% 40%;
    --sidebar-primary: 215 100% 38%; --sidebar-primary-foreground: 0 0% 100%;
    --sidebar-accent: 215 100% 96%; --sidebar-accent-foreground: 215 100% 38%;
    --sidebar-border: 220 25% 88%; --sidebar-ring: 215 100% 45%;
    --neon-cyan: 205 100% 48%; --neon-blue: 215 100% 45%; --neon-indigo: 222 90% 56%; --neon-ice: 210 95% 75%;
    --gradient-neon: linear-gradient(115deg, #003791, #0070d1);
    --gradient-neon-soft: linear-gradient(115deg, hsl(215 100% 45% / 0.12), hsl(205 100% 50% / 0.08));
    --glow-cyan: 0 8px 24px hsl(205 100% 50% / 0.18); --glow-blue: 0 8px 28px hsl(215 100% 45% / 0.22);
    --sheen: linear-gradient(180deg, hsl(0 0% 100% / 0.6), transparent);
    --hairline: var(--border);
    --panel-shadow: 0 4px 16px hsl(215 40% 20% / 0.05), 0 1px 3px hsl(215 40% 20% / 0.03);
    --panel-shadow-hover: 0 12px 32px hsl(215 100% 35% / 0.12);
    --sticker-pink: var(--primary); --sticker-lime: var(--success); --sticker-cobalt: var(--secondary);
  }
  .dark {
    --background: 224 45% 6%; --foreground: 220 30% 98%;
    --card: 224 35% 10%; --card-foreground: 220 30% 98%;
    --popover: 224 35% 10%; --popover-foreground: 220 30% 98%;
    --primary: 214 100% 55%; --primary-foreground: 224 45% 6%; --primary-glow: 214 100% 68%;
    --secondary: 208 100% 50%; --secondary-foreground: 220 30% 98%;
    --muted: 224 25% 15%; --muted-foreground: 218 20% 68%;
    --accent: 214 100% 55%; --accent-foreground: 224 45% 6%;
    --destructive: 0 75% 65%; --destructive-foreground: 224 45% 6%;
    --success: 158 70% 55%; --success-foreground: 224 45% 6%;
    --warning: 38 90% 60%; --warning-foreground: 224 45% 6%;
    --border: 222 28% 18%; --input: 222 28% 18%; --ring: 214 100% 55%;
    --sidebar-background: 225 45% 7%; --sidebar-foreground: 218 20% 75%;
    --sidebar-primary: 214 100% 55%; --sidebar-primary-foreground: 224 45% 6%;
    --sidebar-accent: 214 100% 50% / 0.14; --sidebar-accent-foreground: 214 100% 68%;
    --sidebar-border: 222 28% 16%; --sidebar-ring: 214 100% 55%;
    --neon-cyan: 205 100% 55%; --neon-blue: 214 100% 55%; --neon-indigo: 222 95% 65%; --neon-ice: 210 95% 82%;
    --gradient-neon: linear-gradient(115deg, #00439c, #0070d1);
    --gradient-neon-soft: linear-gradient(115deg, hsl(214 100% 55% / 0.16), hsl(205 100% 55% / 0.1));
    --glow-cyan: 0 8px 30px hsl(205 100% 55% / 0.22); --glow-blue: 0 8px 32px hsl(214 100% 55% / 0.28);
    --sheen: linear-gradient(180deg, hsl(var(--foreground) / 0.06), transparent);
    --hairline: var(--border);
    --panel-shadow: 0 8px 32px hsl(224 45% 3% / 0.45), 0 2px 6px hsl(224 45% 3% / 0.3);
    --panel-shadow-hover: 0 16px 40px hsl(214 100% 55% / 0.25);
    --sticker-pink: var(--primary); --sticker-lime: var(--success); --sticker-cobalt: var(--secondary);
  }`;

if (css.includes(oldRoot)) {
  css = css.replace(oldRoot, newRoot);
  fs.writeFileSync('src/index.css', css, 'utf8');
  console.log('Successfully applied PlayStation tokens to src/index.css');
} else {
  console.error('oldRoot not found in index.css');
}
