import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getFileExtension(filename: string): string {
  const match = /\.([a-zA-Z0-9]+)$/.exec(filename);
  return match ? match[1].toLowerCase() : "";
}

// Clean raw LaTeX math symbols ($$\text{...} = \frac{...}{...}$$) into clean human-readable text
export function cleanLatexMath(text: string): string {
  if (!text) return "";
  let res = text;
  // 1. Math symbols
  res = res.replace(/\\times/g, "×").replace(/\\cdot/g, "·").replace(/\\pm/g, "±");
  // 2. Strip \text{...}
  for (let i = 0; i < 3; i++) {
    res = res.replace(/\\text\{([^{}]+)\}/g, "$1");
  }
  // 3. \frac{A}{B}
  for (let i = 0; i < 3; i++) {
    res = res.replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, "($1) / ($2)");
  }
  // 4. Strip $$ and $
  res = res.replace(/\$\$([^$]+)\$\$/g, "$1");
  res = res.replace(/\$([^$]+)\$/g, "$1");
  // 5. Clean stray backslashes before words
  res = res.replace(/\\([a-zA-Z]+)/g, "$1");
  return res.trim();
}
