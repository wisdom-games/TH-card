/*从 pc.json 建立角色选择界面。*/

(function () {
  "use strict";

  const CHARACTER_STORAGE_KEY = "TH_CARD_CHARACTER";

  let characters = {};
  let characterNames = [];
  let currentIndex = 0;
  let pcTemplate = {};

  function getElement(selector) {
    return document.querySelector(selector);
  }

  function characterImagePath(characterName) {
    const fileName = htmlToPlainText(characterName).trim();
    return `/images/character/${encodeURIComponent(fileName)}.png`;
  }

  function htmlToPlainText(html) {
    const temporary = document.createElement("div");
    temporary.innerHTML = html;
    return temporary.textContent || temporary.innerText || "角色";
  }

  function setSelectorEnabled(enabled) {
    ["#character-prev", "#character-next", "#character-name"]
      .forEach(function (selector) {
        const element = getElement(selector);

        if (element) {
          element.disabled = !enabled;
        }
      });
  }

  function renderCharacter() {
    if (characterNames.length === 0) {
      return;
    }

    const characterName = characterNames[currentIndex];
    const character = characters[characterName];
    const image = getElement("#character-image");
    const nameButton = getElement("#character-name");
    const displayName = window.i18n.t(character.display);

    if (image) {
      delete image.dataset.fallbackUsed;
      image.src = characterImagePath(characterName);
      image.alt = displayName;
    }

    if (nameButton) {
      nameButton.innerHTML = displayName;
      nameButton.setAttribute(
        "aria-label",
        `${window.i18n.t("选择角色：")}${displayName}`
      );
    }
  }

  function changeCharacter(offset) {
    if (characterNames.length === 0) {
      return;
    }

    currentIndex = (
      currentIndex + offset + characterNames.length
    ) % characterNames.length;

    renderCharacter();
  }

function saveCharacterState(characterName, character) {
  const hp = Number(character.HP) || 0;
  const mp = Number(character.MP) || 0;
  const me = Math.max(0, Math.floor(Number(character.ME) || 0));
  const mb = Math.max(0, Math.floor(Number(character.MB) || 0));

  window.selectedCharacter = characterName;

  window.HP = hp;
  window.maxHP = hp;
  window.MP = mp;
  window.maxMP = mp;

  window.adventurehp = hp;
  window.adventuremp = mp;
  window.adventurexp = 0;
  window.adventuregold = 25;

  const state = {
    name: characterName,
    Level:1,
    XP:0,
    HP: hp,
    maxHP: hp,
    MP: mp,
    maxMP: mp,
    ME: me,
    MB: mb,
    adventurehp: window.adventurehp,
    adventuremp: window.adventuremp,
    adventurexp: window.adventurexp,
    adventuregold: window.adventuregold
  };

  localStorage.setItem(CHARACTER_STORAGE_KEY, JSON.stringify(state));

  document.dispatchEvent(new Event("th-card:stats-changed"));
  return state;
}
function showAdventure() {
    const selector = getElement("#character-select");
    const adventure = getElement("#adventure");

    if (selector) {
      selector.classList.add("is-hidden");
      selector.setAttribute("aria-hidden", "true");
    }

    if (adventure) {
      adventure.classList.add("is-active");
      adventure.setAttribute("aria-hidden", "false");
    }
  }
  function selectCurrentCharacter() {
    if (characterNames.length === 0) {
      return;
    }
      localStorage.removeItem("TH_CARD_CHARACTER");
      localStorage.removeItem("TH_CARD_ADVENTURE_STATE");
      localStorage.removeItem("TH_CARD_DECK");
      localStorage.removeItem("TH_CARD_PLAYER_BAG");
      const shopKeys = [];
      for (let i = 0; i < localStorage.length; i += 1) {
        const k = localStorage.key(i);
        if (k && k.indexOf("SHOP_DATA_") === 0) shopKeys.push(k);
      }
      shopKeys.forEach(function (k) { localStorage.removeItem(k); });
      window.startingNewGame = false;
      window._thCardPendingNewGame = true;
    
    const characterName = characterNames[currentIndex];
    const character = characters[characterName];
    const state = saveCharacterState(characterName, character);

    if (window.playerBag) {
      window.playerBag.setLimits(state.ME, state.MB);
    }

    updateAdventureView(characterName, state);
    showAdventure();

    document.dispatchEvent(
      new CustomEvent("th-card:character-selected", {
        detail: {
          name: characterName,
          character: character,
          state: state,
          newGame: true 
        }
      })
    );
  }
function updateAdventureView(characterName, state) {
  const formatStat = window.thCardFormatStat
    ? window.thCardFormatStat
    : function (current, max) {
        return `${current}/${max}`;
      };

  const values = {
    adventurehp: formatStat(state.HP, state.maxHP),
    adventuremp: formatStat(state.MP, state.maxMP),
    adventurexp: state.adventurexp,
    adventuregold: state.adventuregold
  };

  Object.entries(values).forEach(function (entry) {
    const element = document.getElementById(entry[0]);
    if (element) {
      element.textContent = entry[1];
    }
  });

  const avatar = getElement("#adventure-character-image");
  if (avatar) {
    avatar.src = characterImagePath(characterName);
    avatar.alt = window.i18n.t(characters[characterName].display);
  }

  document.dispatchEvent(new Event("th-card:stats-changed"));
}

function restoreSavedCharacter() {
  const saved = localStorage.getItem(CHARACTER_STORAGE_KEY);

  if (!saved) {
    return false;
  }

  try {
    const savedState = JSON.parse(saved);

    if (
      !savedState ||
      typeof savedState !== "object" ||
      !savedState.name
    ) {
      return false;
    }

    const adventureequip = Array.isArray(savedState.adventureequip)
      ? savedState.adventureequip.slice()
      : [];

    const adventurebagitem = Array.isArray(savedState.adventurebagitem)
      ? savedState.adventurebagitem.slice()
      : [];

    const hp = Number(savedState.HP) || 0;
    const mp = Number(savedState.MP) || 0;

    const maxHP = Number.isFinite(Number(savedState.maxHP)) ? Number(savedState.maxHP) : hp;

    const maxMP = Number.isFinite(Number(savedState.maxMP)) ? Number(savedState.maxMP) : mp;

    const state = {
      name: savedState.name,
      Level: Number(savedState.Level) || 1,
      XP: Number(savedState.XP) || 0,
      HP: Math.min(hp, maxHP),
      maxHP: maxHP,
      MP: Math.min(mp, maxMP),
      maxMP: maxMP,
      ME: Math.max(0, Math.floor(Number(savedState.ME) || 0)),
      MB: Math.max(0, Math.floor(Number(savedState.MB) || 0)),
      adventurehp: Number(savedState.adventurehp) || Math.min(hp, maxHP),
      adventuremp: Number(savedState.adventuremp) || Math.min(mp, maxMP),
      adventurexp: Number(savedState.adventurexp) || 0,
      adventuregold: Number(savedState.adventuregold) || 0,
      adventureequip: adventureequip,
      adventurebagitem: adventurebagitem
    };

    window.selectedCharacter = state.name;

    window.HP = state.HP;
    window.maxHP = state.maxHP;
    window.MP = state.MP;
    window.maxMP = state.maxMP;

    window.adventurehp = state.adventurehp;
    window.adventuremp = state.adventuremp;
    window.adventurexp = state.adventurexp;
    window.adventuregold = state.adventuregold;

    window.adventureequip = state.adventureequip.slice();
    window.adventurebagitem = state.adventurebagitem.slice();

    if (window.playerBag) {
      window.playerBag.setLimits(state.ME, state.MB);

      if (typeof window.playerBag.restoreState === "function") {
        window.playerBag.restoreState(
          state.adventureequip,
          state.adventurebagitem
        );
      }
    }

    updateAdventureView(state.name, state);
    showAdventure();

    document.dispatchEvent(new Event("th-card:stats-changed"));
    return true;
  } catch (error) {
    console.warn("已保存的角色状态无法恢复，将进入角色选择", error);
    return false;
  }
}
function mergePCData(base, target) {
  const result = {};

  Object.assign(result, base);

  for (const [key, value] of Object.entries(target || {})) {
    if (key === "level" && isObject(value) && isObject(result.level)) {
      result.level = {
        ...result.level,
        ...value
      };
      continue;
    }

      result[key] = value;
  }

  return result;
}

function PCAPI(pcName) {
  const pcData = characters[pcName] || {};

  return mergePCData(pcTemplate, pcData);
}

window.PCAPI = PCAPI;
  async function loadCharacters() {
    const response = await fetch("pc.json", { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`pc.json 请求失败：HTTP ${response.status}`);
    }

    characters = await response.json();

    if (characters.ALLPC_template) {
      pcTemplate = characters.ALLPC_template;
    }

    characterNames = Object.keys(characters).filter(function(name){
      return name !== "ALLPC_template";
    });

    if (characterNames.length === 0) {
      throw new Error("pc.json 中没有可选择的角色");
    }

    const saved = localStorage.getItem(CHARACTER_STORAGE_KEY);

    if (saved) {
      try {
        const savedState = JSON.parse(saved);
        const savedIndex = characterNames.indexOf(savedState.name);

        if (savedIndex !== -1) {
          currentIndex = savedIndex;
        }
      } catch (error) {
        console.warn("已保存的角色信息无法读取", error);
      }
    }

    renderCharacter();
    setSelectorEnabled(true);
  }
document.addEventListener("th-card:start-new-game", function () {
  currentIndex = 0;
  setSelectorEnabled(false);
  loadCharacters().catch(function (error) {
    console.error("角色选择界面初始化失败", error);
  });
});
  document.addEventListener("DOMContentLoaded", function () {
    const previousButton = getElement("#character-prev");
    const nextButton = getElement("#character-next");
    const nameButton = getElement("#character-name");
    const image = getElement("#character-image");

    setSelectorEnabled(false);

    if (previousButton) {
      previousButton.addEventListener("click", function () {
        changeCharacter(-1);
      });
    }

    if (nextButton) {
      nextButton.addEventListener("click", function () {
        changeCharacter(1);
      });
    }

    const startButton = getElement("#pcui2-1");
    if (startButton) {
      startButton.addEventListener("click", selectCurrentCharacter);
    }
    if (nameButton) {
      nameButton.addEventListener("click", selectCurrentCharacter);
    }
    if (image) {
      image.addEventListener("error", function () {
        if (!image.dataset.fallbackUsed) {
          image.dataset.fallbackUsed = "true";
          image.src = "null.png";
        }
      });

      image.addEventListener("load", function () {
        if (image.src.endsWith("null.png")) {
          return;
        }

        delete image.dataset.fallbackUsed;
      });
    }

loadCharacters()
  .then(function () {
    restoreSavedCharacter();
  })
  .catch(function (error) {
    console.error("角色选择界面初始化失败", error);

    if (nameButton) {
      nameButton.textContent = "角色数据读取失败";
    }
  });
  });
})();
/* 接口 window.giveCardToPlayer("卡牌名", 数量); */