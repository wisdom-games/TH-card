(function () {
  "use strict";

  const DECK_STORAGE_KEY = "TH_CARD_DECK";

  let cardDatabase = {};
  let tagDatabase = {};
  let deckCards = [];

  window.cardDatabase = cardDatabase;
  window.tagDatabase = tagDatabase;

  function cardinfoAPI(type,name) {
    const targetType = Number(type);
    const targetName = String(name ?? "").trim();

    if (!targetName) {
      return null;
    }

    if (targetType === 1) {
      const card = cardDatabase[targetName];

      if (!isObject(card)) {
        return null;
      }

      return {
        name: card.display,
        description: card.info,
        data:card.MP === null || card.MP === undefined || (typeof card.MP === "string" && card.MP.trim() === "") ? {...card,MP:0} : card
      };
    }

    if (targetType === 2) {
      const tag = itagDatabase[targetName];

      if (!isObject(tag)) {
        return null;
      }

      return {
        name: tag.display,
        description: tag.info,
        data: tag
      };
    }

    return null;
  }

  window.cardinfoAPI = cardinfoAPI;
  function fightcardImage(cardName) {
    const name = String(cardName ?? "").trim();

    if (name === "") {
      return "null.png";
    }

    const database = window.cardDatabase;
    const card = (database && typeof database === "object") ? database[name] : null;

    if (card && card["image"]) {
      return String(card["image"]);
    }

    return `images/fight/${name}.png`;
  }

  window.fightcardImage = fightcardImage;
  let pcDatabase = {};
  function stripJsonComments(text) {
    let result = "";
    let inString = false;
    let escaped = false;

    for (let index = 0; index < text.length; index += 1) {
      const current = text[index];
      const next = text[index + 1];

      if (inString) {
        result += current;

        if (escaped) {
          escaped = false;
        } else if (current === "\\") {
          escaped = true;
        } else if (current === "\"") {
          inString = false;
        }

        continue;
      }

      if (current === "\"") {
        inString = true;
        result += current;
        continue;
      }

      if (current === "/" && next === "/") {
        while (index < text.length && text[index] !== "\n") index += 1;
        result += "\n";
        continue;
      }

      if (current === "/" && next === "*") {
        index += 2;
        while (
          index < text.length &&
          !(text[index] === "*" && text[index + 1] === "/")
        ) {
          if (text[index] === "\n") result += "\n";
          index += 1;
        }
        index += 1;
        continue;
      }

      result += current;
    }

    return result;
  }

  async function fetchJsonFile(path, allowComments) {
    const response = await fetch(path, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`${path} 请求失败：HTTP ${response.status}`);
    }

    const text = await response.text();
    return JSON.parse(allowComments ? stripJsonComments(text) : text);
  }

  const databaseReady = Promise.all([
    fetchJsonFile("cards.json", true),
    fetchJsonFile("pc.json", false),
    fetchJsonFile("tags.json", true)
  ])
    .then(function (result) {
      cardDatabase = result[0];
      pcDatabase = result[1];
      tagDatabase = result[2];

      window.cardDatabase = cardDatabase;
      window.pcDatabase = pcDatabase;
      window.tagDatabase = tagDatabase;

      renderDeck();

      if (window.playerBag) {
        window.playerBag.refresh();
      }

      return {
        cards: cardDatabase,
        characters: pcDatabase
      };
    })
    .catch(function (error) {
      console.error("卡牌或角色数据读取失败", error);
      throw error;
    });

  function saveDeck() {
    localStorage.setItem(DECK_STORAGE_KEY, JSON.stringify(deckCards));
  }

  function loadSavedDeck() {
    const saved = localStorage.getItem(DECK_STORAGE_KEY);

    if (!saved) {
      deckCards = [];
      return;
    }

    try {
      const data = JSON.parse(saved);
      deckCards = Array.isArray(data) ? data : [];
    } catch (error) {
      console.warn("牌库存档读取失败，将使用空牌库", error);
      deckCards = [];
    }
  }

  function createCardSlot(cardName) {
    const button = document.createElement("button");
    const img = document.createElement("img");
    const card = cardDatabase[cardName];

    button.className = "bag-slot";
    button.type = "button";
    button.dataset.card = cardName;
    button.dataset.source = "deck";
    button.setAttribute("aria-label", cardName);

    img.src = card && card["image"] ? card["image"] : "null.png";
    img.alt = cardName;
    button.appendChild(img);

    button.addEventListener("mouseenter", function () {
      if (typeof window.showCardInfo === "function") {
        window.showCardInfo(cardName);
      }
    });

    button.addEventListener("click", function () {
      moveDeckCardToDedicatedSlot(cardName);
    });

    return button;
  }

  function renderDeck() {
    const box = document.querySelector("#bagcards");
    if (!box) return;

    box.innerHTML = "";
    deckCards.forEach(function (cardName) {
      box.appendChild(createCardSlot(cardName));
    });
  }

  function addDirect(cardName) {
    deckCards.push(cardName);
    saveDeck();
    renderDeck();
  }

  function resetDeck() {
    deckCards = [];
    saveDeck();
    renderDeck();
  }

  function moveDeckCardToDedicatedSlot(cardName) {
    const card = cardDatabase[cardName];
    if (!card) return;

    if (card["类型"] === "基本卡") return;

    const index = deckCards.indexOf(cardName);
    if (index === -1) return;

    if (
      !window.playerBag ||
      typeof window.playerBag.moveFromDeck !== "function"
    ) {
      return;
    }

    const moved = window.playerBag.moveFromDeck(cardName);
    if (!moved) return;

    deckCards.splice(index, 1);
    saveDeck();
    renderDeck();
  }

  function moveCardToDeck(cardName, source) {
    if (
      !window.playerBag ||
      typeof window.playerBag.take !== "function"
    ) {
      return false;
    }

    const removed = window.playerBag.take(cardName, source);
    if (!removed) return false;

    addDirect(cardName);
    return true;
  }

  function normalizeCount(value) {
    const count = Number(value);
    if (!Number.isFinite(count) || count <= 0) return 0;
    return Math.floor(count);
  }

  async function giveCardToPlayer(cardName, count) {
    await databaseReady;

    const amount = normalizeCount(count === undefined ? 1 : count);

    if (!cardDatabase[cardName]) {
      console.warn(`pc.json 引用了 cards.json 中不存在的卡牌：${cardName}`);
    }

    for (let index = 0; index < amount; index += 1) {
      if (window.playerBag && typeof window.playerBag.addNew === "function") {
        window.playerBag.addNew(cardName);
      } else {
        addDirect(cardName);
      }
    }
  }

  async function initializeCharacterCards(characterName) {
    await databaseReady;

    const character = pcDatabase[characterName];
    if (!character) {
      throw new Error(`pc.json 中不存在角色：${characterName}`);
    }
    
  window.playerCharacterData = {
    ...character,
    ability: character.ability
      ? {
          name: String(character.ability.name || ""),
          turn: normalizeCount(character.ability.turn)
        }
      : null
  };
    resetDeck();

    if (window.playerBag) {
      window.playerBag.reset();
      window.playerBag.setLimits(character.ME, character.MB);
    }

    const initialCards = character["初始卡"] || {};

    for (const [cardName, count] of Object.entries(initialCards)) {
      await giveCardToPlayer(cardName, count);
    }

    saveDeck();
    renderDeck();

    if (window.playerBag) {
      window.playerBag.refresh();
    }
  }

  window.playerDeck = {
    getCards: function () {
      return deckCards.slice();
    },
    addDirect: addDirect,
    reset: resetDeck,
    refresh: renderDeck
  };

  window.moveCardToDeck = moveCardToDeck;
  window.giveCardToPlayer = giveCardToPlayer;
  window.initializeCharacterCards = initializeCharacterCards;

  if (Array.isArray(window.TH_CARD_PENDING_DECK)) {
    window.TH_CARD_PENDING_DECK.forEach(function (cardName) {
      addDirect(cardName);
    });
    window.TH_CARD_PENDING_DECK = [];
  }

  document.addEventListener("th-card:character-selected", function (event) {
    const characterName = event.detail && event.detail.name;
    if (!characterName) return;

    initializeCharacterCards(characterName).catch(function (error) {
      console.error("角色初始卡发放失败", error);
    });
  });

  document.addEventListener("DOMContentLoaded", function () {
    loadSavedDeck();
    renderDeck();
  });
})();