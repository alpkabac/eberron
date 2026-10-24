// Sitede "Düzenle" butonu: grup şifresiyle GitHub'a hesapsız kaydetme.
// Şifreli anahtar (duzenle-anahtar.json) duzenleme-kur.bat ile oluşturulur.
;(() => {
  const REPO = "alpkabac/eberron"
  const BRANCH = "v5"
  const API = `https://api.github.com/repos/${REPO}/contents/`
  const base = new URL(".", document.currentScript.src)
  const TOKEN_KEY = "eberron-duzenle-anahtar"
  const NAME_KEY = "eberron-duzenle-isim"
  // Web kayıtları [skip ci] ile gider; site toplu derlenene kadar (12 saat / 20 değişiklik) düzenleyen kişi
  // kendi halini bu tarayıcıda görür (yerel kopya, build.json tarihi geçince silinir)
  const LOCAL_PREFIX = "eberron-yerel:"
  const MARKED = "https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js"
  const root = new URL("..", base)

  const store = {
    get: (k) => {
      try {
        return localStorage.getItem(k)
      } catch {
        return null
      }
    },
    set: (k, v) => {
      try {
        localStorage.setItem(k, v)
      } catch {}
    },
    del: (k) => {
      try {
        localStorage.removeItem(k)
      } catch {}
    },
  }
  // sifre_kur.mjs ile aynı: harf büyüklüğü, Türkçe karakter ve boşluk farkı önemsiz
  const fold = (s) =>
    s.trim().replace(/\s+/g, " ").replace(/[İIı]/g, "i").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")

  let index = null
  let token = store.get(TOKEN_KEY)

  const b64ToBytes = (s) => Uint8Array.from(atob(s.replace(/\s/g, "")), (c) => c.charCodeAt(0))
  const bytesToB64 = (b) => {
    let s = ""
    for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000))
    return btoa(s)
  }

  async function decryptToken(password) {
    const res = await fetch(new URL("duzenle-anahtar.json", base), { cache: "no-store" })
    if (!res.ok) throw new Error("Düzenleme henüz kurulmamış.")
    const k = await res.json()
    const raw = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"])
    const key = await crypto.subtle.deriveKey(
      { name: "PBKDF2", salt: b64ToBytes(k.salt), iterations: k.iter, hash: "SHA-256" },
      raw,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"],
    )
    try {
      const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64ToBytes(k.iv) }, key, b64ToBytes(k.data))
      return new TextDecoder().decode(plain)
    } catch {
      throw new Error("Şifre yanlış.")
    }
  }

  async function gh(path, opts = {}) {
    const url = API + path.split("/").map(encodeURIComponent).join("/")
    const res = await fetch(opts.method ? url : `${url}?ref=${BRANCH}`, {
      cache: "no-store", // yoksa tarayıcı 60 sn eski metni verir, yeniden düzenleme eskiden başlar
      ...opts,
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
    })
    if (res.status === 401) {
      store.del(TOKEN_KEY)
      token = null
      throw new Error("Anahtar geçersiz ya da süresi dolmuş. Oktay'a haber ver.")
    }
    if (res.status === 409) throw Object.assign(new Error("Sayfa bu arada değişti."), { conflict: true })
    if (!res.ok) throw new Error(`GitHub hatası (${res.status}).`)
    return res.json()
  }

  function el(tag, props = {}, ...kids) {
    const e = Object.assign(document.createElement(tag), props)
    e.append(...kids)
    return e
  }

  function modal(title) {
    const box = el("div", { className: "dz-box" }, el("h3", { textContent: title }))
    const overlay = el("div", { className: "dz-overlay" }, box)
    overlay.addEventListener("mousedown", (e) => e.target === overlay && overlay.remove())
    document.body.append(overlay)
    return { box, close: () => overlay.remove() }
  }

  function askPassword() {
    return new Promise((resolve) => {
      const m = modal("Düzenleme girişi")
      // type=password değil: tarayıcı/şifre yöneticisi bazı kullanıcılarda yazmayı engelliyor
      const pw = el("input", { type: "text", autocomplete: "off", spellcheck: false, autocapitalize: "off" })
      const msg = el("p", { className: "dz-msg" })
      const ok = el("button", { textContent: "Giriş", className: "dz-primary" })
      const go = async () => {
        if (!pw.value.trim()) {
          msg.textContent = "Önce üstteki kutuya grup şifresini yaz."
          return
        }
        ok.disabled = true
        msg.textContent = "Kontrol ediliyor…"
        try {
          token = await decryptToken(fold(pw.value)).catch(() => decryptToken(pw.value))
          store.set(TOKEN_KEY, token)
          // şifre yanlışlıkla isim olarak kaydedildiyse geçmişe sızmasın
          if (fold(store.get(NAME_KEY) ?? "") === fold(pw.value)) store.del(NAME_KEY)
          m.close()
          resolve(true)
        } catch (e) {
          msg.textContent = e.message
          ok.disabled = false
        }
      }
      ok.onclick = go
      pw.onkeydown = (e) => {
        if (e.key === "Enter") go() // false döndürmemeli: diğer tuşları iptal eder
      }
      m.box.append(
        el("label", {}, "Grup şifresi", pw),
        msg,
        el("div", { className: "dz-row" }, ok),
      )
      pw.focus()
    })
  }

  async function openEditor(slug, filePath, title) {
    if (!token && !(await askPassword())) return
    const repoPath = `content/${filePath}`
    const m = modal(`Düzenle: ${title}`)
    const msg = el("p", { className: "dz-msg", textContent: "Yükleniyor…" })
    m.box.append(msg)
    let file
    try {
      file = await gh(repoPath)
    } catch (e) {
      msg.textContent = e.message
      return
    }
    let text = decodeFile(file)
    const local = readLocal(slug)
    if (local?.prevSha === file.sha && local.sha) {
      // GitHub hâlâ son kaydımızdan önceki hali veriyor: yerel hal geçerli
      text = local.md
      file.sha = local.sha
    } else if (local && local.sha !== file.sha) {
      // başkası bizden sonra düzenlemiş: sayfada artık onun hali görünsün
      store.set(LOCAL_PREFIX + slug, JSON.stringify({ ...local, md: text, sha: file.sha, prevSha: null }))
      applyLocal(slug)
    }
    let baseText = text
    const area = el("textarea", { value: text, spellcheck: false })
    const name = el("input", { type: "text", value: store.get(NAME_KEY) ?? "", placeholder: "örn. Oktay" })
    const save = el("button", { textContent: "Kaydet", className: "dz-primary" })
    const cancel = el("button", { textContent: "İptal", onclick: m.close })
    msg.textContent = "Bağlantı için [[Sayfa Adı]] yaz. Sen hemen görürsün, diğerleri en geç 12 saat içinde."
    save.onclick = async () => {
      if (area.value.includes(CONFLICT_START)) {
        msg.textContent = "Önce <<<<<<< ve >>>>>>> işaretli kısımları düzelt, işaretleri sil."
        return
      }
      save.disabled = true
      msg.textContent = "Kaydediliyor…"
      const who = name.value.trim() || "isimsiz"
      store.set(NAME_KEY, name.value.trim())
      try {
        const res = await gh(repoPath, {
          method: "PUT",
          body: JSON.stringify({
            message: `Web düzenlemesi: ${title} (${who}) [skip ci]`,
            content: bytesToB64(new TextEncoder().encode(area.value)),
            sha: file.sha,
            branch: BRANCH,
          }),
        })
        store.set(
          LOCAL_PREFIX + slug,
          JSON.stringify({
            md: area.value,
            date: Date.parse(res.commit.committer.date),
            sha: res.content.sha,
            prevSha: file.sha,
          }),
        )
        file.sha = res.content.sha
        await applyLocal(slug)
        m.box.replaceChildren(
          el("h3", { textContent: "Kaydedildi!" }),
          el("p", { textContent: "Yeni hali sen şimdi görüyorsun. Site herkes için en geç 12 saat içinde güncellenecek." }),
          el("div", { className: "dz-row" }, el("button", { textContent: "Tamam", className: "dz-primary", onclick: m.close })),
        )
      } catch (e) {
        save.disabled = false
        if (!e.conflict) return void (msg.textContent = e.message)
        // Sen düzenlerken başkası kaydetmiş: iki değişikliği birleştir, kaydetmeden önce göster
        try {
          const latest = await gh(repoPath)
          const theirs = decodeFile(latest)
          const merged = merge3(area.value, baseText, theirs)
          area.value = merged.text
          baseText = theirs
          file.sha = latest.sha
          msg.textContent = merged.conflict
            ? "Sen düzenlerken başkası da aynı yerleri değiştirdi. <<<<<<< Senin ile >>>>>>> Diğeri arasından doğru olanı bırak, işaretleri sil, sonra Kaydet."
            : "Sen düzenlerken başkası da bu sayfayı değiştirdi. İkinizin değişikliği birleştirildi; kontrol edip tekrar Kaydet'e bas."
        } catch (e2) {
          msg.textContent = e2.message
        }
      }
    }
    m.box.append(
      el("label", {}, "Adın (değişiklik geçmişinde herkese görünür — şifre yazma!)", name),
      area,
      el("div", { className: "dz-row" }, cancel, save),
    )
    area.focus()
  }

  let buildDate = null
  async function deployedAt() {
    buildDate ??= await fetch(new URL("build.json", base), { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : {}))
      .then((j) => Date.parse(j.date) || 0)
      .catch(() => 0)
    return buildDate
  }

  let markedReady = null
  const loadMarked = () =>
    (markedReady ??= new Promise((resolve, reject) =>
      document.head.append(el("script", { src: MARKED, onload: resolve, onerror: reject })),
    ))

  function linkTarget(name) {
    const n = name.trim().toLowerCase()
    for (const [slug, e] of Object.entries(index)) {
      const file = e.filePath?.replace(/\.md$/, "").split("/").pop()
      if (e.title?.toLowerCase() === n || file?.toLowerCase() === n) return slug
    }
    return null
  }

  function render(md) {
    const body = md
      .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "")
      .replace(/(!?)\[\[([^\]|#]+)(#[^\]|]*)?(?:\|([^\]]+))?\]\]/g, (_, embed, name, _anchor, label) => {
        const slug = linkTarget(name)
        if (embed || !slug) return label ?? name
        return `<a class="internal" href="${new URL(slug, root)}">${label ?? name}</a>`
      })
    return window.marked.parse(body, { breaks: true, gfm: true })
  }

  const decodeFile = (file) => new TextDecoder().decode(b64ToBytes(file.content)).replace(/\r\n/g, "\n")

  // Satır bazlı üç yönlü birleştirme (diff3): taban o, bizimki a, onlarınki b
  const CONFLICT_START = "<<<<<<< Senin"
  function lcsMap(o, x) {
    const n = o.length,
      m = x.length
    const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1))
    for (let i = n - 1; i >= 0; i--)
      for (let j = m - 1; j >= 0; j--)
        dp[i][j] = o[i] === x[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    const map = new Map()
    for (let i = 0, j = 0; i < n && j < m; ) {
      if (o[i] === x[j]) map.set(i++, j++)
      else if (dp[i + 1][j] >= dp[i][j + 1]) i++
      else j++
    }
    return map
  }
  function merge3(aText, oText, bText) {
    const [a, o, b] = [aText, oText, bText].map((s) => s.replace(/\r\n/g, "\n").split("\n"))
    const ma = lcsMap(o, a),
      mb = lcsMap(o, b)
    const same = (x, y) => x.length === y.length && x.every((v, k) => v === y[k])
    const out = []
    let conflict = false
    for (let io = 0, ia = 0, ib = 0; ; ) {
      let i = io
      while (i < o.length && !(ma.has(i) && mb.has(i))) i++
      const ea = i < o.length ? ma.get(i) : a.length
      const eb = i < o.length ? mb.get(i) : b.length
      const [O, A, B] = [o.slice(io, i), a.slice(ia, ea), b.slice(ib, eb)]
      if (same(A, O)) out.push(...B)
      else if (same(B, O) || same(A, B)) out.push(...A)
      else {
        conflict = true
        out.push(CONFLICT_START, ...A, "=======", ...B, ">>>>>>> Diğeri")
      }
      if (i >= o.length) break
      out.push(o[i])
      ;[io, ia, ib] = [i + 1, ea + 1, eb + 1]
    }
    return { text: out.join("\n"), conflict }
  }

  function readLocal(slug) {
    try {
      return JSON.parse(store.get(LOCAL_PREFIX + slug))
    } catch {
      return null
    }
  }

  async function applyLocal(slug) {
    const saved = readLocal(slug)
    if (!saved) return
    if ((await deployedAt()) >= saved.date) return store.del(LOCAL_PREFIX + slug)
    const target = document.querySelector("article .markdown-preview-view") ?? document.querySelector("article")
    if (!target || document.body.dataset.slug !== slug) return
    await loadMarked()
    target.innerHTML = render(saved.md)
    target.prepend(
      el("p", { className: "dz-local", textContent: "Bu sayfanın senin düzenlediğin hali; diğerleri en geç 12 saat içinde görecek." }),
    )
  }

  async function setup() {
    if (!index) index = await fetch(new URL("contentIndex.json", base)).then((r) => r.json())
    document.querySelector(".dz-edit")?.remove()
    const slug = document.body.dataset.slug
    const entry = index[slug]
    if (!entry?.filePath?.endsWith(".md")) return
    const btn = el("button", { className: "dz-edit", textContent: "✎ Düzenle", title: "Bu sayfayı düzenle" })
    btn.onclick = () => openEditor(slug, entry.filePath, entry.title)
    document.body.append(btn)
    await applyLocal(slug)
  }

  document.head.append(
    el(
      "style",
      {},
      `.dz-edit{position:fixed;right:1.2rem;bottom:1.2rem;z-index:900;padding:.5rem .9rem;border-radius:999px;border:1px solid var(--lightgray);background:var(--light);color:var(--secondary);font:inherit;cursor:pointer;box-shadow:0 2px 8px #0003}
.dz-edit:hover{background:var(--highlight)}
.dz-local{padding:.5rem .8rem;border-left:3px solid var(--secondary);background:var(--highlight);font-size:.9rem}
.dz-overlay{position:fixed;inset:0;z-index:1000;background:#0008;display:flex;align-items:center;justify-content:center;padding:1rem}
.dz-box{background:var(--light);color:var(--dark);border:1px solid var(--lightgray);border-radius:8px;padding:1rem 1.2rem;width:min(900px,100%);max-height:100%;display:flex;flex-direction:column;gap:.6rem;box-sizing:border-box}
.dz-box h3{margin:0}
.dz-box label{display:flex;flex-direction:column;gap:.3rem;font-size:.9rem;font-weight:600}
.dz-box input,.dz-box textarea{font:inherit;font-weight:normal;padding:.5rem;border:1px solid var(--gray)!important;border-radius:4px;background:var(--lightgray)!important;color:var(--dark)!important;box-sizing:border-box;width:100%}
.dz-box input:focus,.dz-box textarea:focus{outline:2px solid var(--secondary)!important}
.dz-box textarea{font-family:var(--codeFont),monospace;font-size:.9rem;height:65vh;resize:vertical}
.dz-msg{margin:0;font-size:.9rem;color:var(--darkgray)}
.dz-row{display:flex;justify-content:flex-end;gap:.5rem}
.dz-row button{font:inherit;padding:.4rem 1rem;border-radius:4px;border:1px solid var(--lightgray);background:var(--light);color:var(--dark);cursor:pointer}
.dz-row .dz-primary{background:var(--secondary);color:var(--light);border-color:var(--secondary)}`,
    ),
  )
  document.addEventListener("nav", setup)
  if (document.readyState !== "loading") setup()
  else document.addEventListener("DOMContentLoaded", setup)
})()
