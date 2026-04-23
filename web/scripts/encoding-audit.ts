import { readdir, readFile, stat } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";

const rootDir = resolve(process.argv[2] ?? process.cwd());

const ignoredDirectories = new Set([
  ".git",
  ".next",
  "build",
  "coverage",
  "dist",
  "node_modules"
]);

const ignoredExtensions = new Set([
  ".7z",
  ".avif",
  ".bz2",
  ".db",
  ".eot",
  ".gif",
  ".gz",
  ".ico",
  ".jpeg",
  ".jpg",
  ".lock",
  ".mp3",
  ".mp4",
  ".pdf",
  ".png",
  ".ttf",
  ".webp",
  ".woff",
  ".woff2",
  ".zip"
]);

const suspiciousSequencePattern = new RegExp(
  [
    "(?:",
    "\\u00C3[\\u0080-\\u00BF]",
    "|\\u00C2[\\u0080-\\u00BF]",
    "|\\u00E2[\\u0080-\\u00BF]{1,2}",
    "|\\u00F0[\\u0080-\\u00BF]{2,3}",
    "|\\u00EF\\u00B8[\\u0080-\\u00BF]",
    "|\\uFFFD",
    ")"
  ].join(""),
  "u"
);

type Hit = {
  file: string;
  lineNumber: number;
  line: string;
};

async function collectFiles(directory: string, results: string[] = []) {
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    if (ignoredDirectories.has(entry.name)) {
      continue;
    }

    const fullPath = join(directory, entry.name);

    if (entry.isDirectory()) {
      await collectFiles(fullPath, results);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    if (ignoredExtensions.has(extname(entry.name).toLowerCase())) {
      continue;
    }

    results.push(fullPath);
  }

  return results;
}

function isProbablyBinary(buffer: Buffer) {
  if (buffer.length === 0) {
    return false;
  }

  const sample = buffer.subarray(0, Math.min(buffer.length, 4096));
  let suspiciousBytes = 0;

  for (const byte of sample) {
    if (byte === 0) {
      return true;
    }

    const isControlCharacter = byte < 7 || (byte > 14 && byte < 32);
    if (isControlCharacter) {
      suspiciousBytes += 1;
    }
  }

  return suspiciousBytes / sample.length > 0.05;
}

function normalizePreview(line: string) {
  return line.trim().replace(/\s+/g, " ").slice(0, 160);
}

async function inspectFile(filePath: string) {
  const content = await readFile(filePath);

  if (isProbablyBinary(content)) {
    return [] satisfies Hit[];
  }

  const text = content.toString("utf8");
  const hits: Hit[] = [];

  for (const [index, line] of text.split(/\r?\n/u).entries()) {
    if (!suspiciousSequencePattern.test(line)) {
      continue;
    }

    hits.push({
      file: relative(rootDir, filePath),
      lineNumber: index + 1,
      line: normalizePreview(line)
    });
  }

  return hits;
}

async function main() {
  const rootStats = await stat(rootDir);
  if (!rootStats.isDirectory()) {
    throw new Error(`Diretório inválido para auditoria: ${rootDir}`);
  }

  const files = await collectFiles(rootDir);
  const hits = (await Promise.all(files.map((filePath) => inspectFile(filePath)))).flat();

  if (hits.length === 0) {
    console.log(`Encoding audit OK: nenhum sinal real de mojibake em ${files.length} arquivos de texto.`);
    return;
  }

  console.error(`Encoding audit failed: ${hits.length} ocorrência(s) suspeita(s) em ${new Set(hits.map((hit) => hit.file)).size} arquivo(s).`);
  for (const hit of hits) {
    console.error(`- ${hit.file}:${hit.lineNumber} ${hit.line}`);
  }

  process.exitCode = 1;
}

main().catch((error) => {
  console.error("Encoding audit failed");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
