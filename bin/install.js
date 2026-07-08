#!/usr/bin/env node

import { existsSync, mkdirSync, statSync, createWriteStream, cpSync, rmSync } from "fs";
import { readFile } from "fs/promises";
import { join, resolve } from "path";
import { homedir, platform } from "os";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { createInterface } from "readline";
const require    = createRequire(import.meta.url);
const __dirname  = fileURLToPath(new URL(".", import.meta.url));
const ROOT     = resolve(__dirname, "..");
const SKILL_MD = join(ROOT, "SKILL.md");
const REFS_DIR = join(ROOT, "references");
function claudeDesktopPath() {
  const p = platform();
  if (p === "win32")
    return join(process.env.APPDATA || homedir(), "Claude", "skills");
  if (p === "darwin")
    return join(homedir(), "Library", "Application Support", "Claude", "skills");
  return join(homedir(), ".claude", "skills");
}
const CLAUDE_SKILLS_DIR  = claudeDesktopPath();
const SKILL_INSTALL_PATH = join(CLAUDE_SKILLS_DIR, "cf-daml-skill");
const C = {
  cyan:   s => `\x1b[36m${s}\x1b[0m`,
  green:  s => `\x1b[32m${s}\x1b[0m`,
  yellow: s => `\x1b[33m${s}\x1b[0m`,
  bold:   s => `\x1b[1m${s}\x1b[0m`,
  dim:    s => `\x1b[2m${s}\x1b[0m`,
  red:    s => `\x1b[31m${s}\x1b[0m`,
};

const info    = msg => console.log(`${C.yellow("ℹ")}  ${msg}`);
const success = msg => console.log(`${C.cyan("✓")}  ${msg}`);
const warn    = msg => console.log(`${C.red("⚠")}  ${msg}`);
const step    = (n, t, msg) => console.log(`${C.cyan(`[${n}/${t}]`)} ${msg}`);
const hr      = () => console.log(C.dim("─".repeat(54)));
function prompt(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(res => rl.question(question, ans => { rl.close(); res(ans.trim()); }));
}

function verifySource() {
  if (!existsSync(SKILL_MD))
    throw new Error(`SKILL.md not found at ${SKILL_MD}`);
  if (!existsSync(REFS_DIR))
    throw new Error(`references/ folder not found at ${REFS_DIR}`);
  for (const f of ["canton35.md", "language.md", "patterns.md"])
    if (!existsSync(join(REFS_DIR, f)))
      throw new Error(`Missing references/${f}`);
}

async function buildZip(outputDir) {
  const archiver = require("archiver");
  const outFile  = join(outputDir, "CF-daml-skill.zip");
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });
  await new Promise((res, rej) => {
    const output  = createWriteStream(outFile);
    const archive = archiver("zip", { zlib: { level: 9 } });
    output.on("close", res);
    archive.on("error", rej);
    archive.pipe(output);
    archive.file(SKILL_MD, { name: "SKILL.md" });
    archive.directory(REFS_DIR, "references");
    archive.finalize();
  });

  return outFile;
}

async function installToDesktop() {
  if (existsSync(SKILL_INSTALL_PATH)) {
    warn(`Already installed at ${C.bold(SKILL_INSTALL_PATH)}`);
    const ans = await prompt(`  ${C.yellow("Overwrite?")} (y/N) `);
    if (!ans.toLowerCase().startsWith("y")) {
      console.log(`\n  Skipped.\n`);
      return false;
    }
    rmSync(SKILL_INSTALL_PATH, { recursive: true });
  }
  mkdirSync(SKILL_INSTALL_PATH, { recursive: true });
  cpSync(SKILL_MD, join(SKILL_INSTALL_PATH, "SKILL.md"));
  cpSync(REFS_DIR, join(SKILL_INSTALL_PATH, "references"), { recursive: true });
  return true;
}

function printDesktopSuccess() {
  success(`Installed to ${C.bold(SKILL_INSTALL_PATH)}`);
  console.log("");
  console.log(`  ${C.dim("Installed files:")}`);
  console.log(`  ${C.dim("•")} SKILL.md`);
  console.log(`  ${C.dim("•")} references/canton35.md`);
  console.log(`  ${C.dim("•")} references/language.md`);
  console.log(`  ${C.dim("•")} references/patterns.md`);
  console.log("");
  console.log(`  ${C.green("The skill is now active in Claude Desktop.")}`);
}

function printWebSuccess(outFile) {
  const { size } = statSync(outFile);
  success(`CF-daml-skill.zip created: ${(size / 1024).toFixed(1)} KB`);
  console.log("");
  console.log(C.bold("  Upload to Claude.ai"));
  console.log("");
  console.log(`  1. Go to ${C.bold("claude.ai → Settings → Skills")}`);
  console.log(`  2. Click ${C.bold("Upload skill")}`);
  console.log(`  3. Select ${C.bold(outFile)}`);
  console.log(`  4. Start a new conversation and ask about Daml`);
}

function printPrompts() {
  console.log("");
  console.log(C.cyan("  Try these prompts:"));
  console.log(`  ${C.dim("•")} "Review this Daml template for authorization errors"`);
  console.log(`  ${C.dim("•")} "What pattern for a regulated asset transfer?"`);
  console.log(`  ${C.dim("•")} "Write a DvP workflow with a regulator observer"`);
  console.log(`  ${C.dim("•")} "Why is my choice failing authorization?"`);
  console.log("");
  console.log(`  ${C.dim("Docs:")} https://docs.canton.network`);
}

async function main() {
  const raw = await readFile(join(ROOT, "package.json"), "utf8");
  const pkg = JSON.parse(raw);
  console.log("");
  console.log(C.bold("Canton Foundation Daml Claude Skill"));
  console.log("");
  info(`Version : ${C.bold(pkg.version)}`);
  info(`Claude MCP: ${C.bold("https://github.com/canton-network-devs/Build-on-Canton-MCP")}`);
  verifySource();
  success("Skill source files verified");
  console.log("");
  const desktopFound = existsSync(CLAUDE_SKILLS_DIR);
  if (desktopFound) {
    success(`Claude Desktop detected`);
    info(`Skills folder: ${C.dim(CLAUDE_SKILLS_DIR)}`);
    console.log("");
    console.log(`  ${C.bold("Where would you like to install?")}`);
    console.log("");
    console.log(`  ${C.cyan("1")}  Claude Desktop: auto-install to skills folder`);
    console.log(`  ${C.cyan("2")}  Claude.ai website: builds .zip for manual upload`);
    console.log(`  ${C.cyan("3")}  Both`);
    console.log("");
    const choice = await prompt(`  ${C.bold("Choice [1/2/3]:")} `);
    console.log("");
    console.log("");
    const outputDir = process.argv[2] ? resolve(process.argv[2]) : process.cwd();
    if (choice === "1" || choice === "3") {
      step(1, choice === "3" ? 2 : 1, "Installing to Claude Desktop…");
      const installed = await installToDesktop();
      if (installed) printDesktopSuccess();
      if (choice === "1") { printPrompts(); return; }
      console.log("");
    }
    if (choice === "2" || choice === "3") {
      const n = choice === "3" ? 2 : 1;
      step(n, choice === "3" ? 2 : 1, "Building zip for Claude.ai…");
      const outFile = await buildZip(outputDir);
      printWebSuccess(outFile);
      printPrompts();
      return;
    }
    if (!["1","2","3"].includes(choice)) {
      warn("Invalid choice, Please Run again and enter 1, 2, or 3.\n");
      process.exit(1);
    }
  } else {
    warn("Claude Desktop not detected");
    info("Building CF-daml-skill.zip for Claude.ai web upload…");
    console.log("");
    const outputDir = process.argv[2] ? resolve(process.argv[2]) : process.cwd();
    step(1, 1, "Building zip…");
    const outFile = await buildZip(outputDir);
    hr();
    console.log("");
    printWebSuccess(outFile);
    printPrompts();
  }
}
main().catch(err => {
  console.error(`\n${C.red("Error:")} ${err.message}\n`);
  process.exit(1);
});