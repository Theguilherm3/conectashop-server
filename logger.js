import fs from "node:fs";
import path from "node:path";

const prepared = new Set();

// Escreve uma linha de log no console e no arquivo indicado.
export function writeLog(file, line) {
  console.log(line);

  if (!prepared.has(file)) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    prepared.add(file);
  }

  fs.appendFile(file, line + "\n", (err) => {
    if (err) console.error(`Falha ao gravar log em ${file}:`, err.message);
  });
}

export function timestamp() {
  return new Date().toISOString();
}
