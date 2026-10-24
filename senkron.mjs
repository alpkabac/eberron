// Sitede yapılan web düzenlemelerini Obsidian vault'una çeker.
// Taban = son yayınlanan sürüm (HEAD), bizimki = vault, onlarınki = origin/v5.
// İki taraf da aynı sayfayı değiştirdiyse git merge-file ile birleştirir.
import { execFileSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

const VAULT = process.env.EBERRON_VAULT ?? "C:\\Users\\Oktay\\Documents\\Eberron\\Eberron"
const HOME_NOTE = "00 Kampanya Ana Sayfa.md"

const git = (...args) =>
  execFileSync("git", args, { encoding: "utf8", maxBuffer: 1 << 28, stdio: ["ignore", "pipe", "pipe"] })
const show = (ref, p) => {
  try {
    return git("show", `${ref}:${p}`)
  } catch {
    return null
  }
}
const lf = (s) => s?.replace(/\r\n/g, "\n") ?? null
const crlf = (s) => s.replace(/\n/g, "\r\n")

git("fetch", "-q", "origin")
const parts = git("diff", "--name-status", "-z", "HEAD...origin/v5", "--", "content/").split("\0")
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "senkron-"))
let pulled = 0
const conflicts = []

for (let i = 0; i < parts.length - 1; ) {
  const status = parts[i++]
  if (/^[RC]/.test(status)) i++ // yeniden adlandırmada eski yolu atla
  const file = parts[i++]
  if (!file || !/^[AM]/.test(status) || !file.endsWith(".md")) continue

  const rel = file.slice("content/".length)
  const target = path.join(VAULT, rel === "index.md" ? HOME_NOTE : rel)
  const theirs = lf(show("origin/v5", file))
  const base = lf(show("HEAD", file))
  const ours = fs.existsSync(target) ? lf(fs.readFileSync(target, "utf8")) : null

  if (ours === theirs) continue
  if (ours?.includes("<<<<<<< Obsidian")) {
    conflicts.push(rel) // önceki çakışma henüz düzeltilmemiş
    continue
  }
  if (ours === null && base !== null) continue // vault'ta silinmiş: silme kazanır

  let result = theirs
  if (ours !== null && ours !== base) {
    const [o, b, t] = ["ours", "base", "theirs"].map((n) => path.join(tmp, n))
    fs.writeFileSync(o, ours)
    fs.writeFileSync(b, base ?? "")
    fs.writeFileSync(t, theirs)
    try {
      result = execFileSync("git", ["merge-file", "-p", "-L", "Obsidian", "-L", "eski", "-L", "Web", o, b, t], {
        encoding: "utf8",
      })
    } catch (e) {
      if (e.status < 0 || e.status > 127 || !e.stdout) throw e
      result = e.stdout
      conflicts.push(rel)
    }
  }
  if (result === ours) continue
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, crlf(result))
  pulled++
}

fs.rmSync(tmp, { recursive: true, force: true })
if (pulled) console.log(`Web'den ${pulled} sayfa duzenlemesi Obsidian'a alindi.`)
for (const c of conflicts) console.log(`  DIKKAT: "${c}" iki tarafta da degismis, <<<<<<< isaretlerini duzelt.`)
