(function () {
  "use strict";

  const STORAGE_KEY = "LANGUAGE";
  const DEFAULT_LANG = "zh-CN";
  const BASE_PATH = "language/";

  const FALLBACK_FILES = ["strings.po"];

  let locale = DEFAULT_LANG;
  let ready = false;

  // msgctxt -> Map(msgid -> msgstr)
  const catalogs = Object.create(null);

  function bucketFor(msgctxt) {
    if (!catalogs[msgctxt]) {
      catalogs[msgctxt] = new Map();
    }
    return catalogs[msgctxt];
  }

  function mergePo(text) {
    const parsed = window.PO.parse(text);

    for (const item of parsed.items) {
      const msgid = item.msgid;
      if (!msgid) continue;

      const msgstr = (item.msgstr || []).filter(Boolean)[0];
      if (!msgstr) continue;

      const store = bucketFor(item.msgctxt || "");
      if (!store.has(msgid)) {
        store.set(msgid, msgstr);
      }
    }
  }

  function lookup(msgctxt, msgid) {
    const store = catalogs[msgctxt];
    if (!store) return undefined;
    return store.get(msgid);
  }
  function t(msgid) {
    const hit = lookup("", msgid);
    return hit === undefined ? msgid : hit;
  }

  // 指定 msgctxt 查表
  function tp(msgctxt, msgid) {
    const hit = lookup(msgctxt || "", msgid);
    return hit === undefined ? msgid : hit;
  }

  async function fetchText(path) {
    const response = await fetch(path, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`${path} HTTP ${response.status}`);
    }
    return response.text();
  }

  async function listPoFiles(lang) {
    try {
      const manifest = await fetchText(`${BASE_PATH}${lang}/index.json`);
      const names = JSON.parse(manifest);
      if (Array.isArray(names) && names.length) {
        return names.filter((name) => /\.po$/i.test(name));
      }
    } catch (error) {
    }
    return FALLBACK_FILES;
  }

  // 顺序合并
  async function load(lang) {
    for (const key of Object.keys(catalogs)) {
      delete catalogs[key];
    }

    const files = await listPoFiles(lang);
    const loaded = [];

    for (const file of files) {
      try {
        const text = await fetchText(`${BASE_PATH}${lang}/${file}`);
        mergePo(text);
        loaded.push(file);
      } catch (error) {
        console.warn(`语言文件加载失败：${lang}/${file}`, error);
      }
    }

    return loaded;
  }

  async function setLanguage(lang) {
    locale = lang;
    localStorage.setItem(STORAGE_KEY, lang);
    await load(lang);
    ready = true;
    document.dispatchEvent(new CustomEvent("th-card:i18n-ready", { detail: { lang } }));
    return lang;
  }
  
  window.addEventListener("load", async function () {
    const lang = localStorage.getItem(STORAGE_KEY) || DEFAULT_LANG;

    try {
      locale = lang;
      const loaded = await load(lang);
      ready = true;
      console.info(`i18n: ${lang} load ${loaded.length}  .po file`, loaded);
    } catch (error) {
      console.warn("i18n load fail", error);
    }

    document.dispatchEvent(new CustomEvent("th-card:i18n-ready", { detail: { lang } }));
  });

  window.i18n = {
    t,
    tp,
    get locale() {
      return locale;
    },
    get ready() {
      return ready;
    },
    setLanguage
  };
})();