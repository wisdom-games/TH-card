(function () {
  "use strict";

  const DEBUG_KEY = "TH_CARD_DEBUGMODE";

  window.debugmode = readDebugMode();

  const LANGUAGES = [
    { code: "zh", label: "中文" },
    { code: "en", label: "English" }
  ];

  function byId(id) {
    return document.getElementById(id);
  }

  function t(msgid) {
    return window.i18n && typeof window.i18n.t === "function" ? window.i18n.t(msgid) : msgid;
  }

  // language
  function currentLanguageCode() {
    const locale = window.i18n && window.i18n.locale ? String(window.i18n.locale) : "";
    return locale.split("-")[0];
  }

  function renderLanguageMenu() {
    const menu = byId("th-card-language-menu");
    if (!menu) return;

    const current = currentLanguageCode();
    menu.innerHTML = "";

    LANGUAGES.forEach(function (language) {
      const option = document.createElement("button");
      option.type = "button";
      option.className = "th-card-language-option";
      option.dataset.language = language.code;
      option.setAttribute("role", "menuitemradio");
      option.setAttribute("aria-checked", language.code === current ? "true" : "false");
      option.textContent = language.label;
      if (language.code === current) {
        option.classList.add("is-checked");
      }

      option.addEventListener("click", function () {
        chooseLanguage(language.code);
      });

      menu.appendChild(option);
    });
  }

  function chooseLanguage(code) {
    setLanguageMenuOpen(false);

    if (!window.i18n || typeof window.i18n.setLanguage !== "function") return;

    if (String(code) === currentLanguageCode()) {
      setSettingsMenuOpen(false);
      return;
    }

    Promise.resolve(window.i18n.setLanguage(code))
      .then(function () {
        window.location.reload();
      })
      .catch(function (error) {
        console.warn("语言切换失败", error);
      });
  }

  // debugmode

  function readDebugMode() {
    const saved = localStorage.getItem(DEBUG_KEY);
    if (saved !== null && saved !== "") {
      return Number(saved) === 1 ? 1 : 0;
    }
    return Number(window.debugmode) === 1 ? 1 : 0;
  }

  function updateDebugLabel() {
    const toggle = byId("th-card-debug-toggle");
    if (toggle) {
      toggle.textContent = window.debugmode ? t("调试模式：开启") : t("调试模式：关闭");
    }
  }

  function setDebugMode(next) {
    window.debugmode = next ? 1 : 0;
    localStorage.setItem(DEBUG_KEY, String(window.debugmode));
    updateDebugLabel();

    document.dispatchEvent(
      new CustomEvent("th-card:debugmode-changed", {
        detail: { debugmode: window.debugmode }
      })
    );
  }

  // 菜单

  function setLanguageMenuOpen(open) {
    const menu = byId("th-card-language-menu");
    const button = byId("th-card-language-btn");
    if (!menu || !button) return;

    if (open) {
      renderLanguageMenu();
    }

    menu.hidden = !open;
    button.setAttribute("aria-expanded", open ? "true" : "false");
  }

  function setSettingsMenuOpen(open) {
    const menu = byId("th-card-settings-menu");
    const button = byId("th-card-settings-btn");
    if (!menu || !button) return;

    menu.hidden = !open;
    button.setAttribute("aria-expanded", open ? "true" : "false");

    if (!open) {
      setLanguageMenuOpen(false);
    }
  }

  function updateLabels() {
    const settingsButton = byId("th-card-settings-btn");
    const languageButton = byId("th-card-language-btn");
    const backButton = byId("th-card-back-menu");

    if (settingsButton) settingsButton.textContent = t("设置");
    if (languageButton) languageButton.textContent = t("语言");
    if (backButton) backButton.textContent = t("返回主菜单");

    updateDebugLabel();
    renderLanguageMenu();
  }

  function backToMainMenu() {
    setSettingsMenuOpen(false);

    if (typeof window.setScene === "function") {
      window.setScene("menu");
    }
  }

  function initSettings() {
    const wrap = byId("th-card-settings");
    const settingsButton = byId("th-card-settings-btn");
    const debugToggle = byId("th-card-debug-toggle");
    const languageItem = byId("th-card-language-item");
    const languageButton = byId("th-card-language-btn");
    const backButton = byId("th-card-back-menu");
    const languageMenu = byId("th-card-language-menu");
    const settingsMenu = byId("th-card-settings-menu");

    updateLabels();

    if (settingsButton && settingsMenu) {
      settingsButton.addEventListener("click", function () {
        setSettingsMenuOpen(settingsMenu.hidden);
      });
    }

    if (debugToggle) {
      debugToggle.addEventListener("click", function () {
        setDebugMode(!window.debugmode);
      });
    }

    if (languageItem && languageButton && languageMenu) {
      languageItem.addEventListener("mouseenter", function () {
        setLanguageMenuOpen(true);
      });

      languageItem.addEventListener("mouseleave", function () {
        setLanguageMenuOpen(false);
      });

      languageItem.addEventListener("focusin", function () {
        setLanguageMenuOpen(true);
      });

      languageItem.addEventListener("focusout", function (event) {
        if (!languageItem.contains(event.relatedTarget)) {
          setLanguageMenuOpen(false);
        }
      });

      languageButton.addEventListener("click", function (event) {
        event.stopPropagation();
        setLanguageMenuOpen(true);
      });
    }

    if (backButton) {
      backButton.addEventListener("click", backToMainMenu);
    }
    document.addEventListener("click", function (event) {
      if (!wrap || !wrap.contains(event.target)) {
        setSettingsMenuOpen(false);
      }
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        setSettingsMenuOpen(false);
      }
    });
  }

  // language
  document.addEventListener("th-card:i18n-ready", function () {
    updateLabels();
  });

  document.addEventListener("DOMContentLoaded", initSettings);

  window.setDebugMode = setDebugMode;
})();