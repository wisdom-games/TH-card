(function () {
  "use strict";

  const DEFAULT_LEVEL = "L14";
  const STATE_KEY = "TH_CARD_ADVENTURE_STATE";
  const CHARACTER_KEY = "TH_CARD_CHARACTER";
  const SHOP_DATA_PREFIX = "SHOP_DATA_";
  const HAND_LIMIT = 5;

  let cardDB = {};
  let adventureDB = {};
  let currentLevel = DEFAULT_LEVEL;
  let deck = [];
  let hand = [];
  let activeIndex = -1;
  let handSlots = [];
  let activated = false;
  let blockshop = false;

  let stats = {
    HP: 0,
    maxHP: 0,
    MP: 0,
    maxMP: 0,
    XP: 0,
    Gold: 0
  };

  function $(selector) {
    return document.querySelector(selector);
  }

  function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function toInt(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.floor(n) : fallback;
  }

  function sanitizeJsonText(text) {
    let result = "";
    let inString = false;
    let escaped = false;

    for (let i = 0; i < text.length; i += 1) {
      const current = text[i];
      const next = text[i + 1];

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
        while (i < text.length && text[i] !== "\n") i += 1;
        result += "\n";
        continue;
      }

      if (current === "/" && next === "*") {
        i += 2;
        while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) {
          if (text[i] === "\n") result += "\n";
          i += 1;
        }
        i += 1;
        continue;
      }

      result += current;
    }

    return result.replace(/,\s*([}\]])/g, "$1");
  }

  async function fetchJson(path) {
    const response = await fetch(path, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`${path} 请求失败：HTTP ${response.status}`);
    }

    const text = await response.text();
    return JSON.parse(sanitizeJsonText(text));
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll("\"", "&quot;")
      .replaceAll("'", "&#039;");
  }

  function formatStat(current, max) {
    const cur = Number.isFinite(Number(current)) ? Math.floor(Number(current)) : 0;
    const cap = Number.isFinite(Number(max)) ? Math.floor(Number(max)) : null;
    return cap === null ? String(cur) : `${cur}/${cap}`;
  }

  function readCharacterState() {
    const saved = localStorage.getItem(CHARACTER_KEY);
    if (!saved) return null;

    try {
      const data = JSON.parse(saved);
      return isObject(data) ? data : null;
    } catch (error) {
      console.warn("角色存档读取失败", error);
      return null;
    }
  }

  function saveStatsToCharacter() {
    const base = readCharacterState() || {};
    const next = {
      ...base,
      name: typeof base.name === "string" ? base.name : (window.selectedCharacter || ""),
      HP: stats.HP,
      maxHP: stats.maxHP,
      MP: stats.MP,
      maxMP: stats.maxMP,
      adventurehp: stats.HP,
      adventuremp: stats.MP,
      adventurexp: stats.XP,
      adventuregold: stats.Gold
    };

    localStorage.setItem(CHARACTER_KEY, JSON.stringify(next));
  }

  function syncMaxFromGlobals() {
    const globalMaxHP = Number(window.maxHP);
    const globalMaxMP = Number(window.maxMP);

    if (Number.isFinite(globalMaxHP) && globalMaxHP > 0) {
      stats.maxHP = globalMaxHP;
    } else if (!Number.isFinite(stats.maxHP) || stats.maxHP <= 0) {
      stats.maxHP = stats.HP;
    }

    if (Number.isFinite(globalMaxMP) && globalMaxMP > 0) {
      stats.maxMP = globalMaxMP;
    } else if (!Number.isFinite(stats.maxMP) || stats.maxMP <= 0) {
      stats.maxMP = stats.MP;
    }

    if (stats.HP > stats.maxHP) stats.HP = stats.maxHP;
    if (stats.MP > stats.maxMP) stats.MP = stats.maxMP;
    if (stats.HP < 0) stats.HP = 0;
    if (stats.MP < 0) stats.MP = 0;
  }

  function syncStatsToDom(persist) {
    syncMaxFromGlobals();

    const hp = $("#adventurehp");
    const mp = $("#adventuremp");
    const xp = $("#adventurexp");
    const gold = $("#adventuregold");

    if (hp) hp.textContent = formatStat(stats.HP, stats.maxHP);
    if (mp) mp.textContent = formatStat(stats.MP, stats.maxMP);
    if (xp) xp.textContent = `${stats.XP}/${getCurrentLevelXPNeed()}`;
    if (gold) gold.textContent = String(stats.Gold);

    window.HP = stats.HP;
    window.maxHP = stats.maxHP;
    window.MP = stats.MP;
    window.maxMP = stats.maxMP;
    window.adventurehp = stats.HP;
    window.adventuremp = stats.MP;
    window.adventurexp = stats.XP;
    window.adventuregold = stats.Gold;
    window.adventureStats = { ...stats };

    if (persist) {
      saveStatsToCharacter();
    }

    document.dispatchEvent(new Event("th-card:stats-changed"));
  }

  function loadStatsFromCharacter() {
    const saved = readCharacterState();

    if (saved) {
      const hp = Number.isFinite(Number(saved.adventurehp)) ? Number(saved.adventurehp) : Number(saved.HP);
      const mp = Number.isFinite(Number(saved.adventuremp)) ? Number(saved.adventuremp) : Number(saved.MP);

      stats.HP = Number.isFinite(hp) ? Math.floor(hp) : 0;
      stats.maxHP = Number.isFinite(Number(saved.maxHP)) ? Math.floor(Number(saved.maxHP)) : stats.HP;
      stats.MP = Number.isFinite(mp) ? Math.floor(mp) : 0;
      stats.maxMP = Number.isFinite(Number(saved.maxMP)) ? Math.floor(Number(saved.maxMP)) : stats.MP;
      stats.XP = Number.isFinite(Number(saved.adventurexp)) ? Math.floor(Number(saved.adventurexp)) : 0;
      stats.Gold = Number.isFinite(Number(saved.adventuregold)) ? Math.floor(Number(saved.adventuregold)) : 0;
    } else {
      const hp = Number.isFinite(Number(window.adventurehp ?? window.HP)) ? Math.floor(Number(window.adventurehp ?? window.HP)) : 0;
      const mp = Number.isFinite(Number(window.adventuremp ?? window.MP)) ? Math.floor(Number(window.adventuremp ?? window.MP)) : 0;

      stats.HP = hp;
      stats.maxHP = Number.isFinite(Number(window.maxHP)) ? Math.floor(Number(window.maxHP)) : hp;
      stats.MP = mp;
      stats.maxMP = Number.isFinite(Number(window.maxMP)) ? Math.floor(Number(window.maxMP)) : mp;
      stats.XP = Number.isFinite(Number(window.adventurexp)) ? Math.floor(Number(window.adventurexp)) : 0;
      stats.Gold = Number.isFinite(Number(window.adventuregold)) ? Math.floor(Number(window.adventuregold)) : 0;
    }

    syncStatsToDom(false);
    saveStatsToCharacter();
  }

  function shuffle(list) {
    for (let i = list.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }

  function getCardData(name) {
    return cardDB[name] || null;
  }
  /* 创建商店 */
  function createShopData(cardName) {
    const cardData = getCardData(cardName);
    if (!isObject(cardData) || !isObject(cardData.shops) || !cardData.ID) return;

    const characterState = readCharacterState();
    const characterName = characterState && typeof characterState.name === "string"
      ? characterState.name
      : "";

    const weightMap = {};

    for (const [shopCharacter, shopCards] of Object.entries(cardData.shops)) {
      if (!isObject(shopCards)) continue;

      let matched = shopCharacter === "all";

      if (!matched) {
        matched = shopCharacter
          .split(";")
          .some((name) => name === characterName);
      }

      if (!matched) continue;

      for (const [shopCardName, weightValue] of Object.entries(shopCards)) {
        const weight = Number(weightValue);
        if (!Number.isFinite(weight) || weight <= 0) continue;

        weightMap[shopCardName] = (weightMap[shopCardName] || 0) + weight;
      }
    }

    const indexTable = [];
    let totalWeight = 0;

    for (const [shopCardName, weight] of Object.entries(weightMap)) {
      totalWeight += weight;
      indexTable.push({
        name: shopCardName,
        weight,
        end: totalWeight
      });
    }

    if (totalWeight <= 0 || indexTable.length === 0) return;

    const result = [];

    for (let i = 0; i < 3; i += 1) {
      const randomValue = Math.random() * totalWeight;

      for (const item of indexTable) {
        if (randomValue < item.end) {
          result.push(item.name);
          break;
        }
      }
    }

    localStorage.setItem(
      `SHOP_DATA_${cardData.ID}`,
      JSON.stringify(result)
    );
  }

  function initializeShopDataForCards(cards) {
    const initialized = new Set();

    for (const cardName of cards) {
      const cardData = getCardData(cardName);
      if (!isObject(cardData) || !isObject(cardData.shops) || !cardData.ID) continue;

      const shopKey = String(cardData.ID);
      if (initialized.has(shopKey)) continue;

      initialized.add(shopKey);
      createShopData(cardName);
    }
  }

  function getCardImage(name) {
    const card = getCardData(name);
    return card && card.ID ? `images/adventure/${card.ID}.png` : "null.png";
  }
  function clearShopCards(){
  for(let i=1;i<=3;i++){
    const box=$(`#adventurenewcard${i}`);
    if(!box) continue;
    const newBox=box.cloneNode(false);
    newBox.innerHTML=""; newBox.hidden=true;
    newBox.removeAttribute("data-card");
    newBox.removeAttribute("data-pricetype");
    newBox.removeAttribute("data-shop-index");
    if(box.parentNode) box.parentNode.replaceChild(newBox, box);
  }
}

  function getShopPrice(cardName) {
    const card = window.cardDatabase && window.cardDatabase[cardName];
    if (!isObject(card)) return 10;

    const price = Number(card.price);
    return Number.isFinite(price) ? price : 10;
  }

  function getShopPriceType(shopData) {
    if (!isObject(shopData)) return "Gold";

    const priceType = String(shopData.pricetype || "Gold").trim();
    return priceType === "HP" || priceType === "MAXHP" ? priceType : "Gold";
  }

  function getShopMerchantData(cardData) {
    if (!isObject(cardData) || !isObject(cardData.shops)) return null;

    return cardData;
  }

  function getShopDataForCurrentCharacter(cardData) {
    const shopData = getShopMerchantData(cardData);
    if (!shopData) return null;

    const characterState = readCharacterState();
    const characterName = characterState && typeof characterState.name === "string"
      ? characterState.name
      : "";

    const result = {};
    const matched = [];

    for (const [characterRule, cards] of Object.entries(shopData.shops)) {
      if (!isObject(cards)) continue;

      if (characterRule === "all") {
        matched.push(cards);
        continue;
      }

      const names = characterRule.split(";");
      if (names.some((name) => name === characterName)) {
        matched.push(cards);
      }
    }

    for (const cards of matched) {
      for (const [cardName, weight] of Object.entries(cards)) {
        result[cardName] = (result[cardName] || 0) + Number(weight || 0);
      }
    }

    return {
      cards: result,
      pricetype: getShopPriceType(shopData)
    };
  }

  function addCardToAdventureDeck(cardName) {
    const name = String(cardName || "").trim();
    if (!name) return false;
    if (!window.playerDeck || typeof window.playerDeck.addDirect !== "function") return false;

    window.playerDeck.addDirect(name);
    return true;
  }

  function canPayShopPrice(priceType, price) {
    const value = Number(price);
    if (!Number.isFinite(value) || value < 0) return false;

    if (priceType === "HP") {
      return stats.HP >= value;
    }

    if (priceType === "MAXHP") {
      return stats.maxHP >= value;
    }

    return stats.Gold >= value;
  }

  function payShopPrice(priceType, price) {
    const value = Number(price);
    if (!Number.isFinite(value) || value < 0) return false;

    if (!canPayShopPrice(priceType, value)) return false;

    if (priceType === "HP") {
      stats.HP -= value;
    } else if (priceType === "MAXHP") {
      stats.maxHP -= value;
      if (stats.HP > stats.maxHP) {
        stats.HP = stats.maxHP;
      }
    } else {
      stats.Gold -= value;
    }

    syncStatsToDom(true);
    return true;
  }

    function shopbuycard(cardName, merchantData, shopIndex) {
    const priceType = getShopPriceType(merchantData);
    const price = getShopPrice(cardName);

    if (!canPayShopPrice(priceType, price)) {
      return false;
    }

    if (!payShopPrice(priceType, price)) {
      return false;
    }

    if (!addCardToAdventureDeck(cardName)) {
      return false;
    }

    if (merchantData.ID) {
      const key = `SHOP_DATA_${merchantData.ID}`;
      const saved = localStorage.getItem(key);

      if (saved) {
          const data = JSON.parse(saved);
          if (Array.isArray(data)) {
            data.splice(shopIndex, 1);
            localStorage.setItem(key, JSON.stringify(data));
          }
      }
    }

    return true;
  }

  function shopaddcard(cardData) {
    if (blockshop) return;
    clearShopCards();

    const shopData = getShopDataForCurrentCharacter(cardData);
    if (!shopData) return;

    let savedCards = null;

    if (cardData.ID) {
      const saved = localStorage.getItem(`SHOP_DATA_${cardData.ID}`);

      if (saved) {
        try {
          const data = JSON.parse(saved);
          if (Array.isArray(data)) {
            savedCards = data;
          }
        } catch (error) {
          console.warn("商店卡牌数据读取失败", error);
        }
      }
    }

    if (!savedCards) return;

    for (let i = 0; i < 3; i += 1) {
      const box = $(`#adventurenewcard${i + 1}`);
      if (!box) continue;

      const cardName = savedCards[i];
      if (!cardName) continue;

      const image = document.createElement("img");
      const productCard = window.cardDatabase && window.cardDatabase[cardName];
      image.src = productCard && productCard.image ? productCard.image : "null.png";
      image.alt = cardName;
      image.title = `${cardName} ${getShopPrice(cardName)}${shopData.pricetype}`;

      box.appendChild(image);
      image.addEventListener("mouseenter", function () {
        if (typeof window.showCardInfo === "function") {
          window.showCardInfo(cardName);
        }
      });
      box.hidden = false;

      box.dataset.card = cardName;
      box.dataset.pricetype = shopData.pricetype;
      box.dataset.shopIndex = String(i);

      box.addEventListener("click", function () {
        const targetName = box.dataset.card;
        if (!targetName) return;

        if (!shopbuycard(targetName, cardData, Number(box.dataset.shopIndex))) return;

        box.innerHTML = "";
        box.hidden = true;
        box.removeAttribute("data-card");
        box.removeAttribute("data-pricetype");
        box.removeAttribute("data-shop-index");
      }, { once: true });
    }
  }
  /* 升级 */
  function getCurrentLevelXPNeed() {
  const character = readCharacterState();

  if (!character) return 0;

  const pc = window.PCAPI
    ? window.PCAPI(character.name)
    : null;

  if (!pc || !Array.isArray(pc.levelup)) return 0;

  const level = Number(character.Level) || 1;

  return pc.levelup[level - 1] || 65536; // 65536=不可升级。
}
  function normalizeRemaining(value) {
    if (value === null || value === undefined) return null;
    if (value === "void") return null;
    const n = Number(value);
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : null;
  }

  function getDefaultRemaining(name) {
    const card = getCardData(name);
    if (!card) return null;
    if (card.action === "战斗") return null;

    if (isObject(card.action)) {
      const n = Number(card.action.actionnum);
      return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 1;
    }

    return null;
  }

  function cloneHandEntry(entry) {
    if (typeof entry === "string") {
      return { name: entry, remaining: getDefaultRemaining(entry) };
    }

    if (!isObject(entry)) return null;

    const name = String(entry.name || entry.card || "").trim();
    if (!name) return null;

    const remaining =
      entry.remaining === undefined
        ? getDefaultRemaining(name)
        : normalizeRemaining(entry.remaining);

    return {
      name,
      remaining: remaining === null ? getDefaultRemaining(name) : remaining
    };
  }

  function buildCardsFromGroup(groupData) {
    if (!isObject(groupData)) return [];

    const type = String(groupData.type || "always").trim();
    const result = [];

    if (type === "random") {
      const maxNumber = Math.max(0, toInt(groupData.maxnumber, 0));
      const pool = [];

      for (const [cardName, count] of Object.entries(groupData)) {
        if (cardName === "type" || cardName === "maxnumber") continue;
        const n = Math.max(0, toInt(count, 0));
        for (let i = 0; i < n; i += 1) pool.push(cardName);
      }

      shuffle(pool);
      result.push(...pool.slice(0, maxNumber));
      return result;
    }

    for (const [cardName, count] of Object.entries(groupData)) {
      if (cardName === "type" || cardName === "maxnumber") continue;
      const n = Math.max(0, toInt(count, 0));
      for (let i = 0; i < n; i += 1) result.push(cardName);
    }

    return result;
  }

  function buildDeckFromLevel(levelKey) {
    const level = adventureDB[levelKey];
    if (!isObject(level)) return [];

    let cards = [];
    for (const groupData of Object.values(level)) {
      cards = cards.concat(buildCardsFromGroup(groupData));
    }

    shuffle(cards);
    return cards;
  }
  
  function addGroupToBottom(levelKey) {
    const level = adventureDB[levelKey];
    if (!isObject(level)) return false;

    const cards = [];
    for (const groupData of Object.values(level)) {
      cards.push(...buildCardsFromGroup(groupData));
    }

    if (!cards.length) return false;

    initializeShopDataForCards(cards);
    deck.unshift(...cards);
    return true;
  }

  function saveState() {
    localStorage.setItem(
      STATE_KEY,
      JSON.stringify({
        levelKey: currentLevel,
        deck: deck.slice(),
        hand: hand.map((entry) => ({
          name: entry.name,
          remaining: entry.remaining
        }))
      })
    );

    window.adventurecardnum = deck.length;
  }

  function loadState() {
    const saved = localStorage.getItem(STATE_KEY);
    if (!saved) return false;

    try {
      const data = JSON.parse(saved);
      if (!isObject(data)) return false;

      if (typeof data.levelKey === "string" && adventureDB[data.levelKey]) {
        currentLevel = data.levelKey;
      }

      if (Array.isArray(data.deck)) {
        deck = data.deck.map((x) => String(x).trim()).filter(Boolean);
      }

      if (Array.isArray(data.hand)) {
        hand = data.hand
          .map(cloneHandEntry)
          .filter(Boolean)
          .filter((entry) => entry.remaining === null || entry.remaining > 0);

        if (hand.length > HAND_LIMIT) {
          hand = hand.slice(0, HAND_LIMIT);
        }
      }

      return true;
    } catch (error) {
      console.warn("冒险存档读取失败", error);
      return false;
    }
  }

  function updateCounter() {
    const counter = $("#adventurecardnum");
    const backCard = $("#adventurebackcard");
    if (counter) counter.textContent = String(deck.length);
    if (backCard) backCard.src = `images/adventure/card_${deck.length >= 4 ? 4 : deck.length}.png`;
    window.adventurecardnum = deck.length;
  }

  function clearInfo() {
    const content = $("#cardinfo-content");
    const actions = $("#cardinfo-button");
    const ui1 = $("#adventure-ui1");
    const selectedImage = $("#adventure-selected-image");

    if (content) content.innerHTML = "";
    if (actions) {
      actions.innerHTML = "";
      actions.hidden = true;
    }
    if (ui1) ui1.hidden = true;
    if (selectedImage) {
      selectedImage.hidden = true;
      selectedImage.removeAttribute("src");
      selectedImage.style.width = "";
      selectedImage.style.height = "";
    }

    activeIndex = -1;
    clearShopCards();
  }
    window.clearInfo = clearInfo;

  function getAvailableActions(cardState, cardData) {
    if (!cardData) return [];

    if (cardData.action === "战斗") {
      return [
        {
          name: "战斗",
          kind: "fight",
          cost: 0,
          detail: null,
          useCount: null
        }
      ];
    }

    if (!isObject(cardData.action)) return [];

    const actions = [];
    const totalRemaining = Number.isFinite(cardState.remaining) ? cardState.remaining : Infinity;

    for (const [name, detail] of Object.entries(cardData.action)) {
      if (name === "actionnum") continue;

      const cost = isObject(detail) && detail.actionnum !== undefined ? Math.max(0, Math.floor(Number(detail.actionnum) || 0))  : 1;

      const useCount = cost > 0 && Number.isFinite(totalRemaining) ? Math.floor(totalRemaining / cost) : null;

      if (cost === 0 || totalRemaining >= cost) {
        actions.push({
          name,
          kind: "normal",
          cost,
          detail,
          useCount
        });
      }
    }

    return actions;
  }
  function renderSelectedCardImages(cardData) {
    const ui1 = $("#adventure-ui1");
    const selectedImage = $("#adventure-selected-image");

    if (ui1) ui1.hidden = false;

    if (!selectedImage) return;

    selectedImage.hidden = true;
    selectedImage.removeAttribute("src");
    selectedImage.style.width = "";
    selectedImage.style.height = "";

    if (!cardData || cardData.action === "战斗" || !cardData.image) return;

    selectedImage.src = cardData.image;
    selectedImage.alt = "";

    const px = Number(cardData.px);
    if (Number.isFinite(px) && px > 0) {
      selectedImage.style.width = `${px}px`;
      selectedImage.style.height = "auto";
    }

    selectedImage.hidden = false;
  }
  function toCircledNumber(value) {
    const n = Math.floor(Number(value));
    if (!Number.isFinite(n) || n <= 1) return "";
    if (n <= 20) return String.fromCodePoint(0x2460 + n - 1);
    return String(n);
  }
  function renderActions(cardState, cardData) {
    const box = $("#cardinfo-button");
    if (!box) return;

    box.innerHTML = "";

    const actions = getAvailableActions(cardState, cardData);
    if (!actions.length) {
      box.hidden = true;
      return;
    }

    box.hidden = false;

    for (const action of actions) {
      const button = document.createElement("button");
      const image = document.createElement("img");
      const badge = document.createElement("span");
      button.type = "button";
      button.className = "cardinfo-action";
      button.setAttribute("aria-label",action.useCount && action.useCount > 1 ? `${action.name} ×${action.useCount}` : action.name);
      image.src = `images/adventure/${action.name}.png`;
      image.alt = "";
      badge.className = "cardinfo-action-badge";
      badge.textContent = toCircledNumber(action.useCount);
      button.appendChild(image);
      if (badge.textContent) button.appendChild(badge);

      button.addEventListener("click", async function () {
        await runAction(cardState, action);
      });

      box.appendChild(button);
    }
  }

  function showCardInfo(index) {
    const content = $("#cardinfo-content");
    const cardState = hand[index];

    activeIndex = index;

    if (!content || !cardState) {
      clearInfo();
      return;
    }

    const cardData = getCardData(cardState.name);
    renderSelectedCardImages(cardData);
//    shopaddcard(cardData);
    if (typeof window.setCardInfoActionVisible === "function") {
      window.setCardInfoActionVisible(true);
    }

    if (!cardData) {
      content.innerHTML = `<h3>${escapeHtml(cardState.name)}</h3>`;
      renderActions(cardState, null);
      return;
    }

    let html = `<h3>${escapeHtml(cardState.name)}</h3>`;

    if (cardData.info) {
      html += `<p>${escapeHtml(cardData.info)}</p>`;
    }

    if (cardData["描述"]) {
      html += `<p>${escapeHtml(cardData["描述"])}</p>`;
    }

    if (cardData["类型"]) {
      html += `<p>类型：${escapeHtml(cardData["类型"])}</p>`;
    }

    if (cardData["效果"] && cardData["效果"]["描述"]) {
      html += `<p>${escapeHtml(cardData["效果"]["描述"])}</p>`;
    }

    content.innerHTML = html;
    renderActions(cardState, cardData);
  }

  function bindHandSlots() {
    handSlots = Array.from($("#adventure-hand")?.querySelectorAll(".card-slot") || []);

    handSlots.forEach((button, index) => {
      const focusInfo = function () {
        if (button.classList.contains("is-empty")) return;
        showCardInfo(index);
        if (!blockshop) {
          shopaddcard(getCardData(hand[index].name));
        }
      };

      button.addEventListener("mouseenter", focusInfo);
      button.addEventListener("focus", focusInfo);
      button.addEventListener("click", focusInfo);
    });
  }

  function removeHandCardByIndex(index) {
    if (index < 0 || index >= hand.length) return false;

    hand.splice(index, 1);

    if (activeIndex === index) {
      clearInfo();
    } else if (activeIndex > index) {
      activeIndex -= 1;
    }

    return true;
  }

  function removeHandCardByName(name, preferredIndex) {
    if (
      Number.isInteger(preferredIndex) &&
      preferredIndex >= 0 &&
      preferredIndex < hand.length &&
      hand[preferredIndex] &&
      hand[preferredIndex].name === name
    ) {
      return removeHandCardByIndex(preferredIndex);
    }

    const index = hand.findIndex((entry) => entry.name === name);
    if (index === -1) return false;

    return removeHandCardByIndex(index);
  }

  function renderHand() {
    if (!handSlots.length) {
      bindHandSlots();
    }

    if (!handSlots.length) return;

    handSlots.forEach((button, index) => {
      const entry = hand[index];
      const img = button.querySelector("img");
      const cardName = button.querySelector(".adventure-card-name");

      button.dataset.index = String(index);

      if (entry) {
        button.classList.remove("is-empty");
        button.disabled = false;
        button.dataset.card = entry.name;
        button.setAttribute("aria-label", entry.name);
        const cardData = getCardData(entry.name);
        if (cardName) cardName.textContent = cardData && cardData.display ? cardData.display : entry.name;

        if (img) {
          img.src = getCardImage(entry.name);
          img.alt = entry.name;
        }
      } else {
        button.classList.add("is-empty");
        button.disabled = true;
        button.removeAttribute("data-card");
        button.setAttribute("aria-label", `空卡位${index + 1}`);
        if (cardName) cardName.textContent = "";

        if (img) {
          img.src = "null.png";
          img.alt = "empty card";
        }

        if (activeIndex === index) {
          clearInfo();
        }
      }
    });

    updateCounter();
  }

  function fillHandToFive() {
    let changed = false;

    while (hand.length < HAND_LIMIT && deck.length > 0) {
      const name = deck.pop();
      hand.push({
        name,
        remaining: getDefaultRemaining(name)
      });
      changed = true;
    }

    return changed;
  }

  function applyEffect(effect) {
    if (!isObject(effect)) return;

    for (const [key, value] of Object.entries(effect)) {
      const n = Number(value);
      if (!Number.isFinite(n)) continue;

      if (key === "HP") stats.HP += Math.floor(n);
      if (key === "MP") stats.MP += Math.floor(n);
      if (key === "XP") stats.XP += Math.floor(n);
      if (key === "Gold") stats.Gold += Math.floor(n);
    }

    syncStatsToDom(true);
  }

  function applyNormalAction(cardState, action) {
  if (!Number.isFinite(cardState.remaining)) return;
  if (action.cost > cardState.remaining) return;

  // 特殊处理：如果 action.detail 中指定 actionnum 为 "void"，则立即使 remaining 为 0
  if (isObject(action.detail) && action.detail.actionnum === "void") {
    cardState.remaining = 0;
  } else {
    if (isObject(action.detail) && action.detail.effect) {
      applyEffect(action.detail.effect);
    }
    cardState.remaining = Math.max(0, cardState.remaining - action.cost);
  }

  if (cardState.remaining === 0) {
    const index = hand.indexOf(cardState);
    if (index !== -1) {
      removeHandCardByIndex(index);
    }
  }
}

  function extractOutcomeKeys(result) {
    const keys = new Set();

    if (result === true) {
      keys.add("win");
      return Array.from(keys);
    }

    if (result === false) {
      keys.add("lost");
      return Array.from(keys);
    }

    if (result === null || result === undefined) {
      return [];
    }

    if (
      typeof result === "string" ||
      typeof result === "number" ||
      typeof result === "boolean"
    ) {
      keys.add(String(result));
      return Array.from(keys);
    }

    if (Array.isArray(result)) {
      for (const value of result) {
        if (value !== null && value !== undefined) {
          keys.add(String(value));
        }
      }
      return Array.from(keys);
    }

    if (isObject(result)) {
      for (const [key, value] of Object.entries(result)) {
        if (value === true) keys.add(key);
        if (
          typeof value === "string" ||
          typeof value === "number" ||
          typeof value === "boolean"
        ) {
          keys.add(String(value));
        }
      }
    }

    return Array.from(keys);
  }
function getLevelUpAdd(pc,key,fromLevel) { // pcname.levelupadd*
  const list = pc && Array.isArray(pc[key]) ? pc[key] : [];
  return toInt(list[fromLevel - 1],0);
}
function applyFightWinReturnStats() {
  const fightState = window.fight;
  const player = fightState && isObject(fightState.player)
    ? fightState.player
    : null;
  const remainingHP = player ? Number(player.HP) : NaN;
  if (Number.isFinite(remainingHP) && stats.HP > remainingHP) {
    stats.HP = Math.max(0,Math.floor(remainingHP));
  }
  stats.MP = stats.maxMP;
  syncStatsToDom(true);
}
async function PCLevelUP() {
  const character = readCharacterState();

  if (!character) return false;

  const pc = window.PCAPI ? window.PCAPI(character.name) : null;

  if (!pc || !Array.isArray(pc.levelup)) return false;

  const currentLevel = Number(character.Level) || 1;
  const needXP = pc.levelup[currentLevel - 1];
  if (!Number.isFinite(needXP)) return false;
  if (stats.XP < needXP) return false;

  stats.XP -= needXP;

  character.XP = stats.XP;
  character.Level = currentLevel + 1;
  stats.maxHP += getLevelUpAdd(pc,"levelupaddmaxHP",currentLevel);
  stats.maxMP += getLevelUpAdd(pc,"levelupaddmaxMP",currentLevel);
  window.maxHP = stats.maxHP;
  window.maxMP = stats.maxMP;
  character.maxHP = stats.maxHP;
  character.maxMP = stats.maxMP;
  character.MB = Math.max(0,toInt(character.MB,0) + getLevelUpAdd(pc,"levelupaddmaxMB",currentLevel));
  character.ME = Math.max(0,toInt(character.ME,0) + getLevelUpAdd(pc,"levelupaddmaxME",currentLevel));
  
  localStorage.setItem(CHARACTER_KEY,JSON.stringify(character));
  if (window.playerBag && typeof window.playerBag.setLimits === "function") {
    window.playerBag.setLimits(character.ME,character.MB);
  }
  stats.HP = stats.maxHP;
  stats.MP = stats.maxMP;
  syncStatsToDom(true);
  await showLevelUpChoice(character.name);
  return true;
  
}
function showLevelUpChoice(pcName) {
  const pc = window.PCAPI ? window.PCAPI(pcName) : null;

  if (!pc || !isObject(pc.level)) return Promise.resolve();
  const savedCharacter = readCharacterState();
  const level = savedCharacter ? Number(savedCharacter.Level) : 0;
  const choices = [];

  for (const [cardName,levelData] of Object.entries(pc.level)) {
    if (!isObject(levelData)) continue;
    const weight = Number(levelData[level]);

    if (!Number.isFinite(weight) || weight <= 0) continue;

    choices.push({name:cardName,weight:weight});
  }

  const result = [];

  while(result.length < 3 && choices.length){

    let total = 0;

    choices.forEach(function(item){
      total += item.weight;
    });


    let random = Math.random() * total;
    for (let index = 0;index < choices.length;index += 1) {
      random -= choices[index].weight;
      if (random <= 0) {
        result.push(choices[index].name);
        choices.splice(index,1);
        break;
      }
    }
  }
  if (result.length === 0) {
    return Promise.resolve();
  }
  blockshop = true;
  clearShopCards();

  return new Promise(function (resolve) {
    let resolved = false;

    function finishChoice() {
      if (resolved) return;
      resolved = true;
      blockshop = false;
      clearShopCards();
      syncStatsToDom(true);
      resolve();
    }
    result.forEach(function (cardName,index) {
      const box = $(`#adventurenewcard${index + 1}`);
      if (!box) return;
      box.hidden = false;
      box.innerHTML =
        `<button data-card="${escapeHtml(cardName)}">
          <img src="images/fight/${escapeHtml(cardName)}.png">
        </button>`;

      const button = box.querySelector("button");
      if (!button) return;
      button.addEventListener("click",function () {
        addCardToAdventureDeck(cardName);
        finishChoice();
      },{once:true});
    });
  });
}
async function handleReaction(cardState, cardData, result) {
  if (result !== "win") {
    return false;
  }
  applyFightWinReturnStats();

  if (!cardData || !isObject(cardData.reaction)) {
    return true;
  }

  const ops = cardData.reaction.win;

  if (!isObject(ops)) {
    return true;
  }

  let changed = true;
  let hasXPReward = false;

  if (ops.XP !== undefined) {
    const xp = Number(ops.XP);

    if (Number.isFinite(xp)) {
      stats.XP += Math.floor(xp);
      hasXPReward = true;
    }
  }

  if (ops.Gold !== undefined) {
    const gold = Number(ops.Gold);

    if (Number.isFinite(gold)) {
      stats.Gold += Math.floor(gold);
    }
  }
  syncStatsToDom(true);

  if (hasXPReward) {
    while (await PCLevelUP()) {
    }
  }

  if (ops.delete !== undefined) {
    const target = String(ops.delete);

    if (removeHandCardByName(target,hand.indexOf(cardState))) {
      changed = true;
    }
  }
  if (ops.addgroup !== undefined) {
    if (addGroupToBottom(String(ops.addgroup))) {
      changed = true;
    }
  }
  return changed;
}

  function syncAfterMutation(focusIndex) {
    fillHandToFive();
    saveState();
    renderHand();

    if (
      Number.isInteger(focusIndex) &&
      focusIndex >= 0 &&
      focusIndex < hand.length
    ) {
      showCardInfo(focusIndex);
      return;
    }

    if (activeIndex >= 0 && activeIndex < hand.length) {
      showCardInfo(activeIndex);
      return;
    }

    clearInfo();
  }

// adventure.js 里把 runAction 整段替换为下面这版
async function runAction(cardState, action) {
  const index = hand.indexOf(cardState);
  if (index === -1) return;

  const cardData = getCardData(cardState.name);
  if (!cardData) return;

  if (action.kind === "normal") {
    applyNormalAction(cardState, action);
    syncAfterMutation(index);
    return;
  }

  if (action.kind === "fight") {
    const fightFn =
      typeof window.fightAPI === "function"
        ? window.fightAPI
        : typeof window.fightstart === "function"
          ? window.fightstart
          : null;

    const adventure = document.getElementById("adventure");
    const battle = document.querySelector(".game-area");

    function setBattleScene(active) {
      if (adventure) {
        adventure.classList.toggle("is-active", !active);
        adventure.setAttribute("aria-hidden", active ? "true" : "false");
      }

      if (battle) {
        battle.classList.toggle("is-active", active);
        battle.setAttribute("aria-hidden", active ? "false" : "true");
      }
    }

    setBattleScene(true);

    let result = null;

    try {
      result = await Promise.resolve(fightFn(cardData.ID));
    } catch (error) {
      console.error("战斗执行失败", error);
    } finally {
      setBattleScene(false);
    }

    if (result !== "win") {
      return;
    }

    await handleReaction(cardState,cardData,result);
    syncAfterMutation(index);
  }
}

  function activateAdventureScene() {
    const adventure = $("#adventure");
    const characterSelect = $("#character-select");
    const gameArea = $(".game-area");

    if (characterSelect) {
      characterSelect.classList.add("is-hidden");
    }

    if (gameArea) {
      gameArea.classList.remove("is-active");
    }

    if (adventure) {
      adventure.classList.add("is-active");
    }

    activated = true;
  }
  let pendingNewGame = false;

  function clearShopData() {
    const keys = [];

    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && key.startsWith("SHOP_DATA_")) {
        keys.push(key);
      }
    }

    for (const key of keys) {
      localStorage.removeItem(key);
    }
  }

  document.addEventListener("th-card:start-new-game", function () {
    pendingNewGame = true;
    deck = [];
    hand = [];
    activeIndex = -1;
    handSlots = [];
    currentLevel = DEFAULT_LEVEL;
    localStorage.removeItem(STATE_KEY);
    clearShopData();
  });

  document.addEventListener("th-card:character-selected", function () {
    if (!pendingNewGame) return;

    pendingNewGame = false;
    resetAdventure();
  });
  function resetAdventure() {
    deck = buildDeckFromLevel(currentLevel);
    initializeShopDataForCards(deck);
    hand = [];
    fillHandToFive();
    saveState();
    renderHand();
    clearInfo();
  }

  function setLevel(levelKey) {
    if (!adventureDB[levelKey]) return false;
    currentLevel = levelKey;
    resetAdventure();
    return true;
  }

  async function boot() {
    try {
      const [cardsJson, adventureJson] = await Promise.all([
        fetchJson("adventurecards.json"),
        fetchJson("adventure.json")
      ]);

      cardDB = cardsJson;
      adventureDB = adventureJson;

      window.adventureCardsDatabase = cardDB;
      window.adventureDatabase = adventureDB;

      bindHandSlots();
      loadStatsFromCharacter();

      const restored = loadState();

      if (!restored) {
        currentLevel = DEFAULT_LEVEL;
        deck = buildDeckFromLevel(currentLevel);
        hand = [];
        fillHandToFive();
        saveState();
      } else {
        if (!adventureDB[currentLevel]) {
          currentLevel = DEFAULT_LEVEL;
        }

        if (deck.length === 0 && hand.length === 0) {
          deck = buildDeckFromLevel(currentLevel);
          fillHandToFive();
          saveState();
        } else {
          fillHandToFive();
          saveState();
        }
      }

      renderHand();
      clearInfo();

      window.adventureGame = {
        activate: activateAdventureScene,
        reset: resetAdventure,
        refresh: renderHand,
        draw: fillHandToFive,
        setLevel: setLevel,
        getState: function () {
          return {
            levelKey: currentLevel,
            deck: deck.slice(),
            hand: hand.map((entry) => ({
              name: entry.name,
              remaining: entry.remaining
            }))
          };
        }
      };
    } catch (error) {
      console.error("冒险系统初始化失败", error);
    }
  }

  document.addEventListener("DOMContentLoaded", boot);

document.addEventListener("th-card:character-selected", function () {
    loadStatsFromCharacter();

    if (pendingNewGame) {
      pendingNewGame = false;
      resetAdventure();
    }

    if (!activated) {
      activateAdventureScene();
    }
});

  window.adventurecardnum = 0;
})();