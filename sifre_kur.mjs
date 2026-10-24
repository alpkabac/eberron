// GitHub anahtarını grup şifresiyle şifreleyip quartz/static/duzenle-anahtar.json'a yazar.
// Anahtarın kendisi hiçbir yere düz metin olarak kaydedilmez.
import { webcrypto as crypto } from "node:crypto"
import fs from "node:fs"
import readline from "node:readline/promises"

const REPO = "alpkabac/eberron"
const ITER = 600000
const rl = readline.createInterface({ input: process.stdin, output: process.stdout })

const token = (await rl.question("GitHub anahtarini yapistir (github_pat_...): ")).trim()
const res = await fetch(`https://api.github.com/repos/${REPO}`, {
  headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
})
if (!res.ok) {
  console.log(`\nHATA: Anahtar calismiyor (${res.status}). Repo erisimini kontrol et.`)
  process.exit(1)
}

const password = await rl.question("Grup sifresi (oyunculara verecegin): ")
if ((await rl.question("Sifreyi tekrar yaz: ")) !== password) {
  console.log("\nHATA: Sifreler ayni degil.")
  process.exit(1)
}
if (password.length < 10) {
  console.log("\nHATA: Sifre en az 10 karakter olsun (or. 3-4 kelime: kobold-tas-hancer-graska).")
  process.exit(1)
}
rl.close()

const salt = crypto.getRandomValues(new Uint8Array(16))
const iv = crypto.getRandomValues(new Uint8Array(12))
const raw = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"])
const key = await crypto.subtle.deriveKey(
  { name: "PBKDF2", salt, iterations: ITER, hash: "SHA-256" },
  raw,
  { name: "AES-GCM", length: 256 },
  false,
  ["encrypt"],
)
const data = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(token)))
const b64 = (b) => Buffer.from(b).toString("base64")

fs.writeFileSync(
  new URL("./quartz/static/duzenle-anahtar.json", import.meta.url),
  JSON.stringify({ iter: ITER, salt: b64(salt), iv: b64(iv), data: b64(data) }) + "\n",
)
console.log("\nTamam! Simdi 'Eberron Yayinla' ile yayinla, Duzenle butonu calisacak.")
