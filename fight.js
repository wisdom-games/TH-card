(function () {
  "use strict";

  function isObject(value) {
    return value !== null &&
      typeof value === "object" &&
      !Array.isArray(value);
  }
  window.isObject = isObject;
  
  function toInt(value, fallback) {
    const number = Number(value);

    return Number.isFinite(number) ? Math.floor(number) : fallback;
  }

function parseFightCard(cardEntry) {
    const text = String(cardEntry ?? "");
    const firstSeparatorIndex = text.indexOf(";");
    if (firstSeparatorIndex === -1) {
      return {
        name: text,
        sidetype: [],
        valuechange: {}
      };
    }

    const secondSeparatorIndex = text.indexOf(";",firstSeparatorIndex + 1);
    const name = text.slice(0,firstSeparatorIndex);
    const sidetypeText = secondSeparatorIndex === -1 ? text.slice(firstSeparatorIndex + 1) : text.slice(firstSeparatorIndex + 1,secondSeparatorIndex);
    const valuechangeText = secondSeparatorIndex === -1 ? "" : text.slice(secondSeparatorIndex + 1);
    let valuechange = {};

    if (valuechangeText) {
      try {
        const parsedValuechange = JSON.parse(valuechangeText);
        if (isObject(parsedValuechange)) {
          valuechange = parsedValuechange;
        }
      } catch (error) {
        valuechange = {};
      }
    }

    return {
      name: name,
      sidetype: sidetypeText === "" ? [] : sidetypeText.split("|").map(function (value) { return value.trim(); }).filter(Boolean),
      valuechange: valuechange
    };
  }

  function createFightCardEntry(cardName,sidetype,valuechange) {
    const name = String(cardName ?? "");
    const types = Array.isArray(sidetype) ? sidetype.filter(Boolean) : [];
    const values = isObject(valuechange) ? valuechange : {};
    const valuechangeText = Object.keys(values).length > 0 ? `;${JSON.stringify(values)}` : "";
    return types.length > 0 ? `${name};${types.join("|")}${valuechangeText}` : `${name}${valuechangeText}`;
  }
  function readvaluechange(cardname,valuechange,valuechangelist) {
    const result = {};
    const info = typeof window.cardinfoAPI === "function" ? window.cardinfoAPI(1,cardname) : null;
    const cardData = info && isObject(info.data) ? info.data : {};
    for (let index = 0;index < valuechangelist.length;index += 1) {
      const sourceKey = valuechangelist[index][0];
      const targetKey = valuechangelist[index][1];
      const originalValue = Number(cardData[sourceKey] ?? 0);
      const inputConfig = isObject(valuechange) && isObject(valuechange[targetKey]) ? valuechange[targetKey] : null;
      const inputValue = inputConfig ? inputConfig.value : null;
      let finalValue = Number.isFinite(originalValue) ? originalValue : 0;
      if (typeof inputValue === "string") {
        const match = inputValue.trim().match(/^([+\-=])\|(.+)$/);
        if (match) {
          const operator = match[1];
          const changeValue = Number(match[2]);
          if (Number.isFinite(changeValue)) {
            if (operator === "+") {
              finalValue += changeValue;
            } else if (operator === "-") {
              finalValue -= changeValue;
            } else if (operator === "=") {
              finalValue = changeValue;
            }
          }
        }
      } else if (inputValue !== undefined && inputValue !== null && Number.isFinite(Number(inputValue))) {
        finalValue = Number(inputValue);
      }
      result[targetKey] = finalValue;
    }
    return result;
  }
  function resolveCardSidetype(cardName,sidetypeText,cardData) {
    let data = isObject(cardData) ? cardData : null;
    if (!data && typeof window.cardinfoAPI === "function") {
      const info = window.cardinfoAPI(1,cardName);
      data = info && isObject(info.data) ? info.data : null;
    }
    const baseSidetype = String(isObject(data) ? (data.sidetype ?? "") : "").trim();
    let finalSidetype = baseSidetype === "" ? [] : baseSidetype.split(";").map(function (value) { return value.trim(); }).filter(Boolean);
    if (sidetypeText !== undefined && sidetypeText !== null && String(sidetypeText).trim() !== "") {
      finalSidetype = applySidetypeChange(finalSidetype,String(sidetypeText).trim());
    }
    return finalSidetype;
  }
  function addcardtohand(cardname,side,sidetype,valuechange) {
    const valuechangelist = [["MP","MP"]];
    const name = String(cardname ?? "").trim();
    if (!name) return false;
    const info = typeof window.cardinfoAPI === "function" ? window.cardinfoAPI(1,name) : null;
    const cardData = info && isObject(info.data) ? info.data : null;
    if (!cardData) return false;
    const finalSidetype = resolveCardSidetype(name,sidetype,cardData);
    const finalValuechange = readvaluechange(name,valuechange,valuechangelist);
    const targetSides = String(side ?? "").trim().toLowerCase() === "all" ? [0,1] : [Number(side)];
    let added = false;
    for (let index = 0;index < targetSides.length;index += 1) {
      const targetSide = targetSides[index];
      if (targetSide !== 0 && targetSide !== 1) continue;
      const targetHand = targetSide === 1 ? fight.playerhand : fight.enemyhand;
      if (!Array.isArray(targetHand) || targetHand.length >= 8) continue;
      // giveothercardondraw
      const targetState = targetSide === 1 ? fight.player : fight.enemy;
      const otherHand = targetSide === 1 ? fight.enemyhand : fight.playerhand;
      if (isObject(targetState) && Number(targetState.giveothercardondraw) > 0 && Array.isArray(otherHand) && otherHand.length < 8) {
        targetState.giveothercardondraw = Number(targetState.giveothercardondraw) - 1;
        otherHand.push(createFightCardEntry(name,finalSidetype,finalValuechange));
        added = true;
        continue;
      }
      targetHand.push(createFightCardEntry(name,finalSidetype,finalValuechange));
      added = true;
    }
    if (added) {
      window.fightplayerhand = fight.playerhand;
      window.fightenemyhand = fight.enemyhand;
    }
    return added;
  }
  function fightCardHasSideType(cardEntry,sidetype) {
    return parseFightCard(cardEntry).sidetype.includes(String(sidetype ?? ""));
  }

  function shuffle(list) {
    for (
      let index = list.length - 1;
      index > 0;
      index -= 1
    ) {
      const swapIndex = Math.floor(
        Math.random() * (index + 1)
      );

      [
        list[index],
        list[swapIndex]
      ] = [
        list[swapIndex],
        list[index]
      ];
    }

    return list;
  }

  function getAdventureCardById(cardId) {
    const database = window.adventureCardsDatabase;

    if (!isObject(database)) {
      return null;
    }

    const targetId =
      String(cardId ?? "");

    for (
      const [name, card]
      of Object.entries(database)
    ) {
      if (
        card &&
        String(card.ID ?? "") === targetId
      ) {
        return {
          name: name,
          card: card
        };
      }
    }

    return null;
  }

  function getAdventureStats() {
    const stats =
      isObject(window.adventureStats)
        ? window.adventureStats
        : {};

    const savedText =
      localStorage.getItem(
        "TH_CARD_CHARACTER"
      );

    let saved = null;

    if (savedText) {
      try {
        const data =
          JSON.parse(savedText);

        if (isObject(data)) {
          saved = data;
        }
      } catch (error) {
        console.warn(
          "角色战斗状态读取失败",
          error
        );
      }
    }

    const hpSource = saved ? (saved.adventurehp ?? saved.HP) : (stats.HP ?? window.adventurehp ?? window.HP);
    const mpSource = saved ? (saved.adventuremp ?? saved.MP) : (stats.MP ?? window.adventuremp ?? window.MP);

    const hp = Number.isFinite(Number(hpSource)) ? Math.floor(Number(hpSource)) : 0;
    const maxHPSource = saved ? (saved.maxHP ?? hp) : (stats.maxHP ?? window.maxHP ?? hp);
    const maxMPSource = saved ? (saved.maxMP ?? mpSource) : (stats.maxMP ?? window.maxMP ?? mpSource);
    const maxHP = Number.isFinite(Number(maxHPSource)) &&  Number(maxHPSource) > 0 ? Math.floor(Number(maxHPSource)) : hp;
    const mp = Number.isFinite(Number(mpSource)) ? Math.floor(Number(mpSource)) : 0;
    const maxMP = Number.isFinite(Number(maxMPSource)) && Number(maxMPSource) > 0 ? Math.floor(Number(maxMPSource)) : mp;

    return {HP: hp,MAXHP: maxHP,MP: mp,MAXMP: maxMP};
  }

  function renderSlots(slotSelector,cards,labelPrefix) {
    const slots = Array.from(document.querySelectorAll(slotSelector));

    slots.forEach(
      function (button, index) {
        const cardEntry = cards[index];
        const cardName = parseFightCard(cardEntry).name;

        const img = button.querySelector("img");

        button.dataset.index = String(index);

        if (cardName) {
          button.classList.remove("is-empty");

          button.disabled = false;

          button.dataset.card = cardName;
          bindFightCardInfo(button,1,cardName);
          button.setAttribute("aria-label",cardName);

          if (img) {
            img.src = window.fightcardImage(cardName);
            img.alt = cardName;
          }
        } else {
          button.classList.add("is-empty");

          button.disabled = true;

          button.removeAttribute("data-card");

          button.setAttribute("aria-label",`${labelPrefix}空卡位${index + 1}`);

            img.src = "null.png";
            img.alt = "empty card";
        }
      }
    );
  }

  function updateBattleBars() {
    if (
      typeof window.thCardSyncBattleBars === "function"
    ) {
      window.thCardSyncBattleBars();
    }
  }

  /*
    更新战斗全局变量以及
    牌库/坟场数量。
  */
  function exposeBattleGlobals(fight) {
    window.fight = fight;
    window.fightenemy = fight.enemy;
    window.fightplayer = fight.player;

    window.fightenemycards = fight.enemycards;
    window.fightenemyhand = fight.enemyhand;
    window.fightplayercards = fight.playercards;
    window.fightplayerhand = fight.playerhand;
    window.fightsitecards = fight.fightsitecards;
    window.fightsitecardsow = fight.fightsitecardsow;
    window.fightplayergrave = fight.fightplayergrave;
    window.fightenemygrave = fight.fightenemygrave;
    window.fightplayerequip = fight.fightplayerequip;
    window.fightenemyequip = fight.fightenemyequip;

    window.fightplayerfighttags = fight.playerfighttags;
    window.fightenemyfighttags = fight.enemyfighttags;
    
    window.fightplayerfighttraits = fight.playerfighttraits;
    window.fightenemyfighttraits = fight.enemyfighttraits;

    window.enemyhp = fight.enemy.HP;
    window.maxenemyhp = fight.enemy.MAXHP;
    window.enemymp = fight.enemy.MP;
    window.maxenemymp = fight.enemy.MAXMP;

    window.playerhp = fight.player.HP;
    window.maxplayerhp = fight.player.MAXHP;
    window.playermp = fight.player.MP;
    window.maxplayermp = fight.player.MAXMP;
    
window.fightplayerability = fight.playerability;
window.fightenemyability = fight.enemyability;

    updateFightPileCounts(fight);
    renderFightEquip(fight, 1);
    renderFightEquip(fight, 0);
    // render tags UI
    renderFightTags(fight);
    updateBattleBars();
  }

  /* 更新卡组和坟场数量 */
  function updateFightPileCounts(fight) {
    const playerDeck = document.getElementById("fightplayerdecknum");
    const playerGrave = document.getElementById("fightplayergravenum");
    const enemyDeck = document.getElementById("fightenemydecknum");
    const enemyGrave = document.getElementById("fightenemygravenum");

    if (playerDeck) {
      playerDeck.textContent = String(fight.playercards.length);
    }

    if (playerGrave) {
      playerGrave.textContent = String(fight.fightplayergrave.length);
    }

    if (enemyDeck) {
      enemyDeck.textContent = String(fight.enemycards.length);
    }

    if (enemyGrave) {
      enemyGrave.textContent = String(fight.fightenemygrave.length);
    }
  }

  /* 创建战斗场地上的卡牌 */
function renderFightSite(fight) {
    const site = document.getElementById("fightsite");

    if (!site) {
      return;
    }

    site.innerHTML = "";

    const cardCount = fight.fightsitecards.length;
    const cardWidth = 80;
    const normalGap = 8;
    const sitePadding = 3;
    const availableWidth = 442 - 4 - sitePadding * 2;
    const step = cardCount <= 5 ? cardWidth + normalGap : (availableWidth - cardWidth) / (cardCount - 1);

    fight.fightsitecards.forEach(
      function (cardEntry, index) {
        const cardName = parseFightCard(cardEntry).name;

        const button = document.createElement("button");

        const img = document.createElement("img");

        button.type = "button";
        button.className = "fightsite-card";

        button.tabIndex = -1;
        button.style.left = `${sitePadding + index * step}px`;
        button.style.zIndex = String(index + 1);

        button.setAttribute("aria-label",cardName);
        bindFightCardInfo(button,1,cardName);
        img.src = window.fightcardImage(cardName);

        img.alt = cardName;

        button.appendChild(img);
        site.appendChild(button);
      }
    );

    updateFightPileCounts(fight);
  }
function renderFightEquip(fight,owner) {
    const box = document.getElementById(owner === 1 ? "fightplayerequip" : "fightenemyequip");

    if (!box) {
      return;
    }

    const cards = owner === 1 ? fight.fightplayerequip : fight.fightenemyequip;

    box.innerHTML = "";

    cards.forEach(
      function (cardEntry) {
        const cardName = parseFightCard(cardEntry).name;

        const slot = document.createElement("div");

        const img = document.createElement("img");

        slot.className = "bag-slot";

        slot.setAttribute("aria-label",cardName);
        bindFightCardInfo(slot,1,cardName);
        img.src = window.fightcardImage(cardName);
        img.alt = cardName;

        slot.appendChild(img);
        box.appendChild(slot);
      }
    );
  }

  // ---------- tags 数据缓存与读取 ----------
  let tagsDatabase = null;
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

  async function loadTagsDatabase() {
    if (tagsDatabase !== null) return tagsDatabase;
    try {
      const resp = await fetch("tags.json", { cache: "no-store" });
      if (!resp.ok) {
        console.error("tags.json加载失败:", resp.status, resp.statusText, resp.url);
        return {};
      }
      const text = await resp.text();
      tagsDatabase = JSON.parse(stripJsonComments(text));
    } catch (e) {
      console.error("tags.json读取失败:", e);
      return {};
    }
    return tagsDatabase;
  }
  // ---------- end tags loader ----------
    // Global variable to track picked cards during effect execution
  let cardpick = null;

  function parseCardSelection(config) {
    if (!isObject(config)) return null;
    return {
      mode: String(config.mode || 'get').trim(),
      pick: String(config.pick || 'random').trim(),
      hasFiller: Object.prototype.hasOwnProperty.call(config, 'filler_js'),
      filler_js: String(config.filler_js ?? '').trim(),
      input: String(config.input ?? ''),
      value: toInt(config.value, 1),
      side: String(config.side || 'other').trim(),
      sidetypechange: String(config.sidetypechange || '').trim(),
      newcardside: String(config.newcardside || 'self').trim().toLowerCase(),
      source: String(config.source || 'hand').trim().toLowerCase()
    };
  }

  function applySidetypeChange(sidetype, changeStr) {
    if (!changeStr || changeStr === '') return sidetype;
    
    const changes = changeStr.split(';').map(s => s.trim()).filter(Boolean);
    let result = Array.isArray(sidetype) ? [...sidetype] : [];
    
    for (const change of changes) {
      const match = change.match(/^([+\-])\|(.+)$/);
      if (!match) continue;
      
      const operator = match[1];
      const typeToChange = match[2];
      
      if (operator === '+') {
        if (!result.includes(typeToChange)) {
          result.push(typeToChange);
        }
      } else if (operator === '-') {
        const idx = result.indexOf(typeToChange);
        if (idx !== -1) {
          result.splice(idx, 1);
        }
      }
    }
    
    return result;
  }

  function randomSelectCard(fight, side) {
    const hand = side === 1 ? fight.playerhand : fight.enemyhand;
    if (!hand || hand.length === 0) return null;
    
    const randomIdx = Math.floor(Math.random() * hand.length);
    return [side, randomIdx];
  }

  function setupManualCardSelection(fight, side, callback) {
    const isPlayer = side === 1;
    const selector = isPlayer 
      ? ".game-area .player.bottom .slots .card-slot"
      : ".game-area .player.top .slots .card-slot";
    
    const slots = Array.from(document.querySelectorAll(selector));
    
    const originalBorders = [];
    slots.forEach((button, idx) => {
      originalBorders[idx] = button.style.border;
      const cardEntry = (isPlayer ? fight.playerhand : fight.enemyhand)[idx];
      const cardName = parseFightCard(cardEntry).name;
      
      if (cardName && !button.classList.contains('is-empty')) {
        button.style.border = '4px solid orange';
        button.style.cursor = 'pointer';
        
        const handleClick = function(e) {
          e.stopPropagation();
          cleanupSelection();
          callback([side, idx]);
        };
        
        button.addEventListener('click', handleClick, { once: true });
        button.dataset.selectable = 'true';
      }
    });
    
    const cleanupSelection = function() {
      slots.forEach((button, idx) => {
        button.style.border = originalBorders[idx] || '';
        button.style.cursor = '';
        delete button.dataset.selectable;
      });
    };
  }

  /* 将卡牌移动到场上 1 = 玩家 0 = 敌人 */
  function movetosite(fight,cardName,owner,sidetype,loops,valuechange = {}) {
    if(loops != 1) return false; // 防lopp多次移动
    if (!fight || !cardName) {
      return false;
    }
  if (sidetype.includes("ability")) {
    return false;
  }
  if (sidetype.includes("selfdeleteonsite")) {
    return true;
  }
    owner = Number(owner) === 1 ? 1 : 0;

    /* 卡牌加入场上数组末尾。 */
    fight.fightsitecards.push(createFightCardEntry(cardName,sidetype,valuechange));

    /* 相同位置保存所有者。 */
    fight.fightsitecardsow.push(owner);

    renderFightSite(fight);

    return true;
  }
  /* 将卡牌移动到装备区 1 = 玩家 0 = 敌人 */
  function movetoequip(fight,cardName,owner,sidetype,valuechange = {}) {
    if (!fight || !cardName) {
      return false;
    }
    owner = Number(owner) === 1 ? 1 : 0;
    const equip = owner === 1 ? fight.fightplayerequip : fight.fightenemyequip;
    equip.push(createFightCardEntry(cardName,sidetype,valuechange));
    renderFightEquip(fight,owner);
    return true;
  }
    /* 将卡牌移动到坟场 */
  async function movetograve(cardName,side) {
    const name = String(cardName ?? "").trim();
    if (!name) {
      return false;
    }
    const battle = window.fight;
    if (!battle) {
      return false;
    }
    const targetSide = Number(side) === 1 ? 1 : 0;
    const grave = targetSide === 1 ? battle.fightplayergrave : battle.fightenemygrave;
    if (!Array.isArray(grave)) {
      return false;
    }
    await carduse(targetSide,"event","event.movetograve:card","movetograve","movetograve",battle,["movetograve"]);
    if (battle.deleteonmovetograve > 0) {
      battle.deleteonmovetograve -= 1;
    } else {
      grave.push(name);
    }
    exposeBattleGlobals(battle);
    return true;
  }
  /* 将卡牌洗入卡组 */
  function movetofightcards(cardName,side) {
    const name = String(cardName ?? "").trim();
    if (!name) {
      return false;
    }
    const battle = window.fight;
    if (!battle) {
      return false;
    }
    const targetSide = Number(side) === 1 ? 1 : 0;
    const deck = targetSide === 1 ? battle.playercards : battle.enemycards;
    if (!Array.isArray(deck)) {
      return false;
    }
    deck.push(name);
    shuffle(deck);
    exposeBattleGlobals(battle);
    return true;
  }
  /* 将场上所有卡牌移动到原持有者的坟场 */
  async function moveSiteCardsToGrave(fight) {
    /* 每次循环都处理场地数组第1张卡：先实时删除，再确认是否移动到坟场 */
    while (Array.isArray(fight.fightsitecards) && fight.fightsitecards.length > 0) {
      const cardEntry = fight.fightsitecards[0];

      const owner = Array.isArray(fight.fightsitecardsow) ? fight.fightsitecardsow[0] : 0;
      /* 实时删除场地数组与所有者数组的第1个 */
      fight.fightsitecards.shift();
      if (Array.isArray(fight.fightsitecardsow)) {
        fight.fightsitecardsow.shift();
      }

      /* 临时卡牌不入坟场 */
      if (fightCardHasSideType(cardEntry,"temp")) {
        continue;
      }
      const moveToOtherGrave = fightCardHasSideType(cardEntry,"other");
      const graveSide = owner === 0
        ? (moveToOtherGrave ? 1 : 0)
        : (moveToOtherGrave ? 0 : 1);
      await movetograve(parseFightCard(cardEntry).name,graveSide);
    }

    renderFightSite(fight);
  }

  /* 把对应坟场全部加入牌组 */
  function ensureDeckHasCards(fight,owner) {
    const deck = owner === 1 ? fight.playercards : fight.enemycards;

    const grave = owner === 1 ? fight.fightplayergrave : fight.fightenemygrave;

    /* 牌组本来就有牌，无需回收 */
    if (Array.isArray(deck) && deck.length !== 0) {
      return true;
    }

    /* 牌组为空且坟场也为空：无牌可抽 */
    if (!Array.isArray(deck) || !Array.isArray(grave) || grave.length === 0) {
      return false;
    }

    deck.push(...grave);

    grave.length = 0;

    /* 全部坟场洗入牌组后打乱，避免回收顺序可预测 */
    shuffle(deck);

    updateFightPileCounts(fight);

    return true;
  }

  /*
    玩家牌库 / 敌人牌库
    都在回合结束时检查：牌组为空则用坟场补充。
  */
  function recycleGraves(fight) {
    ensureDeckHasCards(fight,1);

    ensureDeckHasCards(fight,0);

    updateFightPileCounts(fight);
  }

  function buildCardPool(source) {
    const pool = [];

    if (Array.isArray(source)) {
      source.forEach(
        function (cardName) {
          const name =
            String(cardName).trim();

          if (name) {
            pool.push(name);
          }
        }
      );
    } else if (
      isObject(source)
    ) {
      for (const [cardName,count] of Object.entries(source)) {
        if (cardName === "type" || cardName === "maxnumber") {
          continue;
        }

        const amount =Math.max(0,toInt(count, 0));

        for (let index = 0;index < amount;index += 1) {
          pool.push(cardName);
        }
      }
    }

    return shuffle(pool);
  }
  function createInitialFightMarks(config) {
    const result = {tags:[],traits:[]};
    if (!isObject(config)) return result;

    for (const [name,value] of Object.entries(config)) {
      const number = Number(value);
      if (!Number.isFinite(number) || number <= 0) continue;

      const trait = isTrait(name);
      const count = trait ? 1 : Math.floor(number);
      if (count <= 0) continue;

      (trait ? result.traits : result.tags).push([name,count]);
    }

    return result;
  }

  function createBattleState(enemyId) {
    const enemyRecord = getAdventureCardById(enemyId);
    const enemyCard = enemyRecord ? enemyRecord.card : {};
    const adventureStats =  getAdventureStats();

    const enemyHP = Math.max(0,toInt(enemyCard.HP, 0));
    const enemyMP = Math.max(0,toInt(enemyCard.MP, 0));

    const pc = typeof window.PCAPI === "function" && window.selectedCharacter ? window.PCAPI(window.selectedCharacter) : (window.playerCharacterData || {});

    const playerMarks = createInitialFightMarks(pc.tags);
    const enemyMarks = createInitialFightMarks(enemyCard.tags);
    const playerDeck = window.playerDeck && typeof window.playerDeck.getCards === "function" ? window.playerDeck.getCards().slice() : [];

    return {
      turn: 1,

        enemy: {
        name:enemyRecord ? enemyRecord.name : String(enemyId || "敌人"),

        ID: String(enemyCard.ID || enemyId || ""),

        HP: enemyHP,
        MAXHP: enemyHP,

        MP: enemyMP,
        MAXMP: enemyMP,
        cardmpchange: 0,
        giveothercardondraw: 0
      },

      playerability: pc && pc.ability ? [[String(pc.ability.name || ""), toInt(pc.ability.turn, 0), 0]] : [],
      enemyability: enemyCard.ability ? [[String(enemyCard.ability.name || ""), toInt(enemyCard.ability.turn, 0), 0]] : [],

      player: {
        name: String(window.selectedCharacter || "玩家"),

        HP:adventureStats.HP,
        MAXHP:adventureStats.MAXHP,
        MP:adventureStats.MAXMP,
        MAXMP:adventureStats.MAXMP,
        cardmpchange: 0,
        giveothercardondraw: 0
      },

      /* 玩家牌组 */
      playercards:shuffle(playerDeck),
      /* 敌人牌组 */
      enemycards:buildCardPool(enemyCard.cards),
      /* 手牌 */
      playerhand: [],
      enemyhand: [],
      /*  战斗场地卡牌。两个数组下标一一对应。  */
      fightsitecards: [],
      fightsitecardsow: [],

      /* 玩家坟场 */
      fightplayergrave: [],
      /* 敌人坟场 */    
      fightenemygrave: [],

      /* 玩家装备 */
      fightplayerequip: [],
      /* 敌人装备 */
      fightenemyequip: [],
      /* 新增：玩家与敌人的标签数组，二维格式 [ [name,count], ... ] */
      playerfighttags: [],
      enemyfighttags: [],
      resolve: null,
      ended: false,
      carduseLocked: false,
      /* carduse 嵌套深度：0 表示当前没有正在解析的效果链 */
      carduseDepth: 0,
      judgeLocks: [],
      judgeRemoveLog: [],
      deleteonmovetograve: 0,
      playerfighttags: playerMarks.tags,
      enemyfighttags: enemyMarks.tags,
      playerfighttraits: playerMarks.traits,
      enemyfighttraits: enemyMarks.traits,
    };
  }

  function renderEnemyHand(fight) {
    const cards = fight.enemyhand;
    renderSlots(".game-area .player.top .slots .card-slot",cards,"敌人");
  }

async function drawPlayerCards(DCnumber) {
  const drawCount = DCnumber;
  let drewAll = true;
  for (let index = 0;index < drawCount;index += 1) {
    /* 手牌已满则跳过本轮剩余抽牌，并且不消耗牌堆 */
    if (!Array.isArray(fight.playerhand) || fight.playerhand.length >= 8) break;
    if (!ensureDeckHasCards(fight,1)) {
      drewAll = false;
      break;
    }
    await carduse(1,"event",{"event":{"drawcard":{"value":1}}},"drawcard",null,fight,["drawcard"]);
    if (fight.ended) break;
    if (!Array.isArray(fight.playerhand) || fight.playerhand.length >= 8) break;
    const cardEntry = fight.playercards.pop();
    if (!cardEntry) {
      drewAll = false;
      break;
    }
    const cardName = String(cardEntry).trim();
    addcardtohand(cardName,1);
  }
  window.fightplayerhand = fight.playerhand;
  updateFightPileCounts(fight);
  return drewAll;
}
async function drawEnemyCards(DCnumber) {
  const drawCount = DCnumber;
  let drewAll = true;
  for (let index = 0;index < drawCount;index += 1) {
    if (!Array.isArray(fight.enemyhand) || fight.enemyhand.length >= 8) break;
    if (!ensureDeckHasCards(fight,0)) {
      drewAll = false;
      break;
    }
    await carduse(0,"event",{"event":{"drawcard":{"value":1}}},"drawcard",null,fight,["drawcard"]);
    if (fight.ended) break;
    if (!Array.isArray(fight.enemyhand) || fight.enemyhand.length >= 8) break;
    const cardEntry = fight.enemycards.pop();
    if (!cardEntry) {
      drewAll = false;
      break;
    }
    const cardName = String(cardEntry).trim();
    addcardtohand(cardName,0);
  }
  window.fightenemyhand = fight.enemyhand;
  updateFightPileCounts(fight);
  return drewAll;
}
  function renderPlayerHand(fight) {
    renderSlots(".game-area .player.bottom .slots .card-slot",fight.playerhand,"玩家");
  }
  function positionFightAbility(fight,owner) {
  const containerId = owner === 1 ? "fightplayerability" : "fightenemyability";
  const container = document.getElementById(containerId);
  if (!container) return;
  const player = container.closest(".player");
  const hand = player ? player.querySelector(".hand.large-hand") : null;
  if (!player || !hand) return;
  const playerRect = player.getBoundingClientRect();
  const handRect = hand.getBoundingClientRect();
  container.style.right = `${playerRect.right - handRect.right}px`;
  container.style.left = "auto";
  if (owner === 1) {
    container.style.bottom = `${playerRect.bottom - handRect.top + 5}px`;
    container.style.top = "auto";
  } else {
    container.style.top = `${handRect.bottom - playerRect.top + 5}px`;
    container.style.bottom = "auto";
  }
}
function renderAbilityButton(fight, owner) {
  const abilities = owner === 1 ? fight.playerability : fight.enemyability;
  const containerId = owner === 1 ? "fightplayerability" : "fightenemyability";
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = "";
  if (!Array.isArray(abilities) || abilities.length === 0) {
    return;
  }

  abilities.forEach(function (entry, idx) {
    const cardName = String(entry[0] ?? "").trim();
    const total = Number(entry[1] ?? 0);
    const remaining = Number(entry[2] ?? 0);
    if (!cardName) return;
    const card = getFightCardData(cardName);
    if (!card) return;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "fight-ability-button";
    btn.dataset.ability = "true";
    btn.dataset.owner = String(owner);
    btn.dataset.abilityIndex = String(idx);
    btn.setAttribute("aria-label", cardName + (remaining > 0 ? `（冷却${remaining}回合）` : ""));

    const img = document.createElement("img");
    img.src = window.fightcardImage(cardName);
    img.alt = cardName;
    btn.appendChild(img);

    if (remaining > 0) {
      const badge = document.createElement("div");
      badge.className = "ability-cooldown";
      badge.textContent = String(remaining);
      btn.appendChild(badge);
    }

    container.appendChild(btn);

    if (owner !== 1) {
      btn.disabled = true;
      return;
    }
    const effect = card["效果"];
    const mpCost = card ? Number(card["MP"] ?? 0) : 0;
    // 检查玩家是否有 "noability" 标记
    const hasNoAbilityTag = getTagCount(fight, 1, "noability") > 0;
    // check can use
    btn.disabled = fight.carduseLocked || remaining > 0 || !effect || !checkCardCanUse(createFightCardEntry(cardName, [], {}), fight.player) || hasNoAbilityTag;

    btn.onclick = async function () {
      // re-read entry by index in case abilities array mutated
      const abilityEntry = (Array.isArray(fight.playerability) && fight.playerability[idx]) ? fight.playerability[idx] : entry;
      const abilityRemaining = Number(abilityEntry[2] ?? 0);
      if (!window.fight || window.fight !== fight || fight.ended || fight.carduseLocked || fight.sideturn === "enemy" || abilityRemaining > 0) return;
      if (Number.isFinite(mpCost) && mpCost > 0 && fight.player.MP < mpCost) return;

      fight.carduseLocked = true;

      if (Number.isFinite(mpCost) && mpCost > 0) {
        fight.player.MP -= mpCost;
      }

      try {
        const type = card["类型"] ?? "技能卡";
        const tagValue = String(card["tag"] ?? "").trim();

        await carduse(1,type,card,tagValue,cardName,fight,["ability"]);

        // set remaining cooldown to total
        const totalVal = toInt(abilityEntry[1], 0);
        abilityEntry[2] = Math.max(0, totalVal);

        const outcome = getFightOutcome(fight);
        if (outcome === "win" || outcome === "lost") {
          finishFight(fight,outcome);
          return;
        }
      } finally {
        fight.carduseLocked = false;
        exposeBattleGlobals(fight);
        renderAbilityButton(fight,1);
        renderAbilityButton(fight,0);
        updatePlayerHandUI(fight);
        bindPlayerHandActions(fight);
      }
    };
  });
  positionFightAbility(fight,owner);
}
    function getFightCardData(cardName) {
    const database = window.cardDatabase;

    if (!isObject(database)) {
      return null;
    }
    return database[cardName] || null;
  }
    function displayfightcardinfo(type,name) {
    const title = document.getElementById("fightcardinfo-title");
    const content = document.getElementById("fightcardinfo-content");

    if (!title || !content) {
      return;
    }

    const targetType = Number(type);
    const targetName = String(name ?? "").trim();

    if (!targetName || typeof window.cardinfoAPI !== "function") {
//      title.textContent = "";
//      content.innerHTML = "";
      return;
    }

    const info = window.cardinfoAPI(targetType,targetName);

    if (!info) {
//      title.textContent = "";
//      content.innerHTML = "";
      return;
    }

//    title.textContent = info.name;
    if(Number(window.debugmode) === 1){
      content.innerHTML = `${info.name}\n ${JSON.stringify(info.data, null, 2)} ${info.description}`;
      }else{
    content.innerHTML = `${info.name}\n${info.description}`;
  }
  }

  window.displayfightcardinfo = displayfightcardinfo;

  function bindFightCardInfo(element, type, name) {
  if (!element) {
    return;
  }

  element.addEventListener("mouseenter", function () {
    displayfightcardinfo(type, name);
  });
}

const valuetypes = ["value_js","value_read"]; // 动态取值关键字,无value时按此顺序查找并调用advvalue 
  /* 规则元数据关键字：只用于规则匹配，不属于效果本身 */
  const ruleMetaKeys = ["rule","siderule","rule_js","valuerule"];
function parseValueRead(expression, fight, side) {
  if (typeof expression !== "string") return Number(expression);
  let result = String(expression).trim();
  const tagPattern = /<(self|other)\.tags\.([^>]+)>/g;
  result = result.replace(tagPattern, function (match, owner, tagName) {
    const targetSide = owner === "self" ? side : (1 - side);
    const count = getTagCount(fight, targetSide, tagName);
    return String(count);
  });
  const valuePattern = /<(self|other)\.(HP|maxHP|MP|maxMP|handcard)>/g;
  result = result.replace(valuePattern,function (match,owner,key) {
    const targetSide = owner === "self" ? Number(side) : 1 - Number(side);
    const player = targetSide === 1 ? fight.player : fight.enemy;
    if (!player) return "0";
    if (key === "HP") return String(Number(player.HP ?? 0));
    if (key === "maxHP") return String(Number(player.MAXHP ?? player.maxHP ?? 0));
    if (key === "MP") return String(Number(player.MP ?? 0));
    if (key === "maxMP") return String(Number(player.MAXMP ?? player.maxMP ?? 0));
    if (key === "handcard") {
      const hand = targetSide === 1 ? fight.playerhand : fight.enemyhand;
      return String(Array.isArray(hand) ? hand.length : 0);
    }
    return "0";
  });
  try {
    const calculated = Function('"use strict"; return (' + result + ')')();
    return Number.isFinite(calculated) ? calculated : Number(expression);
  } catch (e) {
    return Number(expression);
  }
}

    function prepareJudgementEffect(effect) {
    if (effect === null || effect === undefined) {
      return null;
    }

    if (!isObject(effect)) {
      return effect;
    }

    const nextEffect = {...effect};

    if (Object.prototype.hasOwnProperty.call(nextEffect,"伤害")) {
      const damage = nextEffect["伤害"];
      if (!isObject(damage) || (damage.value === null || damage.value === undefined) && !valuetypes.some(function (valueType) { return Object.prototype.hasOwnProperty.call(damage,valueType); }) || Object.prototype.hasOwnProperty.call(damage,"value") && !Number.isFinite(Number(damage.value)) || Object.prototype.hasOwnProperty.call(damage,"value") && Number(damage.value) <= 0) {
        delete nextEffect["伤害"];
      }
    }

    return Object.keys(nextEffect).length > 0 ? nextEffect : null;
  }

    async function runJudgementStep(step,result,fight,register,stepIndex) {
      const effect = prepareJudgementEffect(result.effect);
      if (effect === null) {
        const ret = {side:result.side,type:result.type,effect:effect,tag:result.tag,sidetype:result.sidetype,cardName:result.cardName,valuechange:result.valuechange,register:-1};
        return ret;
      }
      const stepResult = await step(result.side,result.type,effect,result.tag,result.sidetype,fight,typeof register === "number" ? register : -1,typeof stepIndex === "number" ? stepIndex:0,result.cardName,result.valuechange);
      if (stepResult && typeof stepResult === "object") {
        stepResult.cardName = result.cardName;
        stepResult.valuechange = result.valuechange;
        stepResult.register = -1;
      }
      return stepResult;
    }

  function equipRuleMatch(rule,tag) {
    const rules = String(rule ?? "").split(";").map(function (value) { return value.trim(); }).filter(Boolean);
    const tags = String(tag ?? "").split(";").map(function (value) { return value.trim(); }).filter(Boolean);
    return rules.some(function (value) { return tags.includes(value); });
  }
  function valueruleMatches(rules,inputeffect) {
  if (!isObject(rules)) return false;
  for (const [reference,expression] of Object.entries(rules)) {
    const match = reference.trim().match(/^<inputeffect\.([^<>]+)>$/);
    if (!match || typeof expression !== "string" || expression.trim() === "") return false;
    let data = inputeffect;
    for (const key of match[1].split(".")) {
      if (!key || data === null || data === undefined || !Object.prototype.hasOwnProperty.call(data,key)) {
        return false;
      }
      data = data[key];
    }
    if (data === null || data === undefined) return false;
    try {
      const literal = typeof data === "number" ? String(data) : typeof data === "bigint" ? `${data}n` : JSON.stringify(data);
      if (literal === undefined) return false;
      const condition = expression.replace(/\$\{data\}/g,function () { return `(${literal})`; });
      // if
      if (!Function('"use strict"; if (' + condition + ') { return true; } return false;')()) {
        return false;
      }
    } catch (error) {
      return false;
    }
  }
  return true;
}
async function effectruleAPI(side,type,effect,tag,sidetype,fight,register,stepIndex,sourceData,ownerSide,sourceCount,cardName,valuechange,sourceCardName) {
  const newEffectTypes = ["获取卡","抽卡","伤害","标记","卡牌选择","valuechange"];
  const source = isObject(sourceData) ? sourceData : {};
  let nextEffect = effect === "event.movetograve:card" ? {event:{movetograve:{card:true}}} : effect;
  let effectIndex = 1;
  let anyRulePassed = false;
  let chainCardUsed = false;
  const sourceName = String(cardName ?? "");
  const sourceValuechange = isObject(valuechange) ? valuechange : {};
  const sourceTag = String(source["tag"] ?? "").trim();
  const sourceIgnore = String(source["ignore"] ?? "").trim();
  if (nextEffect === null) {
    return {side:side,type:type,effect:nextEffect,tag:tag,sidetype:sidetype,register:-1,newEffectChain:false,rulePassed:false};
  }
  while (true) {
    const effectKey = effectIndex === 1 ? "效果" : `效果_${effectIndex}`;
    if (!Object.prototype.hasOwnProperty.call(source,effectKey)) {
      break;
    }

    const sourceEffect = source[effectKey];
    if (isObject(sourceEffect)) {
      // 效果内规则，如无则使用外层，否则跳过
      const ruleSource = {...source,...sourceEffect};
      let rulePassed = true;

      if (Object.prototype.hasOwnProperty.call(ruleSource,"rule")) {
        const rules = String(ruleSource.rule ?? "").split(";").map(function (value) {
          return value.trim();
        }).filter(Boolean);
        const tags = String(tag ?? "").split(";").map(function (value) {
          return value.trim();
        }).filter(Boolean);
        rulePassed = rules.some(function (value) {
          return tags.includes(value);
        });
      }

      if (rulePassed && Object.prototype.hasOwnProperty.call(ruleSource,"siderule")) {
        const sideRule = String(ruleSource.siderule ?? "").trim();
        if (sideRule === "self") {
          rulePassed = Number(side) === Number(ownerSide);
        } else if (sideRule === "other") {
          rulePassed = Number(side) !== Number(ownerSide);
        }
      }

      if (rulePassed && Object.prototype.hasOwnProperty.call(ruleSource,"valuerule")) {
        const valueRules = ruleSource.valuerule;
        if (!isObject(valueRules)) {
          rulePassed = false;
        } else {
          for (const [reference,expression] of Object.entries(valueRules)) {
            const match = reference.trim().match(/^<inputeffect\.([^<>]+)>$/);
            if (!match || typeof expression !== "string" || expression.trim() === "") {
              rulePassed = false;
              break;
            }

            let data = effect;
            for (const key of match[1].split(".")) {
              if (!key || data === null || data === undefined || !Object.prototype.hasOwnProperty.call(data,key)) {
                rulePassed = false;
                break;
              }
              data = data[key];
            }

            if (!rulePassed) break;
            if (data === null || data === undefined) {
              rulePassed = false;
              break;
            }

            try {
              const literal = typeof data === "number"
                ? String(data)
                : typeof data === "bigint"
                  ? `${data}n`
                  : JSON.stringify(data);

              if (literal === undefined) {
                rulePassed = false;
                break;
              }

              const condition = expression.replace(/\$\{data\}/g,function () {
                return `(${literal})`;
              });
              // if 
              if (!Function('"use strict"; if (' + condition + ') { return true; } return false;')()) {
                rulePassed = false;
                break;
              }
            } catch (error) {
              rulePassed = false;
              break;
            }
          }
        }
      }

      if (rulePassed && Object.prototype.hasOwnProperty.call(ruleSource,"rule_js")) {
        rulePassed = false;
        const funcName = String(ruleSource.rule_js ?? "").trim();
        const inputText = String(ruleSource.input ?? "").trim();
        const params = inputText === "" ? [] : inputText.split(";").map(function (value) {
          return value.trim();
        });

        if (funcName && typeof window[funcName] === "function") {
          try {
            rulePassed = !!(await window[funcName](
              ...params,sourceName,sourceValuechange,sidetype,fight,side,type,effect
            ));
          } catch (error) {
            console.error(`Error calling ${funcName}:`,error);
            rulePassed = false;
          }
        }
      }

      if (rulePassed) {
        anyRulePassed = true;
        let filteredSource = sourceEffect;

        for (const [effectName,effectConfig] of Object.entries(sourceEffect)) {
          // random,if not carduse
          if (newEffectTypes.includes(effectName)) {
            continue;
          }
          if (!isObject(effectConfig) || !Object.prototype.hasOwnProperty.call(effectConfig,"random")) {
            continue;
          }

          const random = Number(effectConfig.random);
          if (filteredSource === sourceEffect) {
            filteredSource = {...sourceEffect};
          }

          if (Number.isFinite(random) && Math.random() >= random) {
            delete filteredSource[effectName];
          } else {
            const keptConfig = {...effectConfig};
            delete keptConfig.random;
            filteredSource[effectName] = keptConfig;
          }
        }

        const triggerPart = {};
        const mergePart = {};
        for (const [effectName,effectConfig] of Object.entries(filteredSource)) {
          if (newEffectTypes.includes(effectName) || effectName === "loop") {
            triggerPart[effectName] = effectConfig;
          } else {
            mergePart[effectName] = effectConfig;
          }
        }

        const hasTrigger = Object.keys(triggerPart).length > 0;
        const mergeResult = nextEffect === null ? null : await effectAPI(side,type,nextEffect,tag,sidetype,fight,register,stepIndex,hasTrigger ? mergePart : filteredSource,ownerSide,sourceCount,sourceName,sourceValuechange);

        if (mergeResult && Object.prototype.hasOwnProperty.call(mergeResult,"effect")) {
          nextEffect = mergeResult.effect;
        }

        if (hasTrigger && !fight.ended) {
          const triggerResult = await effectAPI(ownerSide,type,null,tag,sidetype,fight,register,stepIndex,triggerPart,ownerSide,sourceCount,sourceName,sourceValuechange);
          const triggerEffect = triggerResult && isObject(triggerResult.effect) ? prepareJudgementEffect(triggerResult.effect) : null;

          if (triggerEffect !== null && !fight.ended) {
            const chainTag = String(sourceTag ?? "").trim();
            const chainCardName = !chainCardUsed && String(sourceCardName ?? "").trim() !== "" ? String(sourceCardName).trim() : null;
            chainCardUsed = chainCardUsed || chainCardName !== null;
            // 深度恢复
            const resumeStep = stepIndex + 1;
            await carduse(ownerSide,type,triggerEffect,chainTag,chainCardName,fight,[],-1,Number.isFinite(resumeStep) ? resumeStep : 0,sourceValuechange,null,true,null,sourceIgnore);
          }
        }
      }
    }

    effectIndex += 1;
    if (fight.ended) {
      break;
    }
  }
  // 反制卡
  if (anyRulePassed && !chainCardUsed && !fight.ended && String(sourceCardName ?? "").trim() !== "") {
    chainCardUsed = true;
    // 深度恢复
    const resumeStep = stepIndex + 1;
    await carduse(ownerSide,type,{"效果":{"move":"site"}},sourceTag,String(sourceCardName).trim(),fight,[],-1,Number.isFinite(resumeStep) ? resumeStep : 0,sourceValuechange,null,true,null,sourceIgnore);
  }
  return {side:side,type:type,effect:nextEffect,tag:tag,sidetype:sidetype,register:-1,newEffectChain:false,rulePassed:anyRulePassed};
}
  function sideruleMatches(siderule,incomingSide,equipOwnerSide) {
    const rule = String(siderule ?? "").trim();
    if (!rule || rule === "" || rule === "all") return true;
    if (rule === "self") {
      return Number(incomingSide) === Number(equipOwnerSide);
    }
    if (rule === "other") {
      return Number(incomingSide) !== Number(equipOwnerSide);
    }
    // default: no restriction
    return true;
  }

  // ---------- 新增：标签数组操作 & 渲染工具 ----------
  function getTagListForSide(fight, side, name) {
    if (isTrait(name)) {
      return side === 1 ? fight.playerfighttraits : fight.enemyfighttraits;
    }
    return side === 1 ? fight.playerfighttags : fight.enemyfighttags;
  }

  function findTagIndex(list, name) {
    for (let i = 0; i < list.length; i += 1) {
      if (String(list[i][0]) === String(name)) return i;
    }
    return -1;
  }

  function isTrait(name) {
    return tagsDatabase?.[name]?.type === "trait";
  }

  function setTagCount(fight,side,name,value) {
    const list = getTagListForSide(fight,side,name);
    const index = findTagIndex(list,name);
    const number = Number(value);
    const count = !Number.isFinite(number) || number <= 0 ? 0
      : isTrait(name) ? 1 : Math.floor(number);
    if (count === 0) {
      if (index !== -1) list.splice(index,1);
    } else if (index === -1) {
      list.push([String(name),count]);
    } else {
      list[index][1] = count;
    }
    renderFightTags(fight);
  }

  function modifyTagCount(fight, side, name, delta) {
    if (!fight) return;
    setTagCount(fight,side,name,getTagCount(fight,side,name) + Number(delta));
  }

  function getTagCount(fight, side, name) {
    const list = getTagListForSide(fight, side, name);
    const idx = findTagIndex(list, name);
    return idx === -1 ? 0 : Number(list[idx][1]);
  }

  // 渲染标签到 DOM：player bottom 显示 playerfighttags，player top 显示 enemyfighttags
  function renderFightTags(fight) {
  if (!fight) return;
  const playBox = document.getElementById("playertags");
  const enemyBox = document.getElementById("enemytags");
  if (playBox) {
    playBox.innerHTML = "";
    [...(fight.playerfighttraits || []),...(fight.playerfighttags || [])].forEach(function (entry) {
      const name = String(entry[0] ?? "");
      const count = Number(entry[1] ?? 0);
      if (!name) return;
      const tagDef = tagsDatabase && isObject(tagsDatabase[name]) ? tagsDatabase[name] : null;
      const hidden = tagDef && (tagDef.hide === true || String(tagDef.hide ?? "").trim().toLowerCase() === "true");
      if (hidden) return;
      // 每种标记只渲染一个图标，并在右下角显示数值徽章
      const wrapper = document.createElement("span");
      wrapper.className = "tag-wrapper";
      wrapper.setAttribute("role", "img");
      wrapper.setAttribute("aria-label", isTrait(name) ? name : `${name} ×${count}`);
      const img = document.createElement("img");
      img.src = `images/tags/${name}.png`;
      img.alt = name;
      wrapper.appendChild(img);
      const badge = document.createElement("span");
      badge.className = "tag-badge";
      badge.textContent = isTrait(name) ? "" : String(Math.max(0, count));
      wrapper.appendChild(badge);
      playBox.appendChild(wrapper);
    });
  }
  if (enemyBox) {
    enemyBox.innerHTML = "";
    [...(fight.enemyfighttraits || []),...(fight.enemyfighttags || [])].forEach(function (entry) {
      const name = String(entry[0] ?? "");
      const count = Number(entry[1] ?? 0);
      if (!name) return;
      const tagDef = tagsDatabase && isObject(tagsDatabase[name]) ? tagsDatabase[name] : null;
      const hidden = tagDef && (tagDef.hide === true || String(tagDef.hide ?? "").trim().toLowerCase() === "true");
      if (hidden) return;
      const wrapper = document.createElement("span");
      wrapper.className = "tag-wrapper";
      wrapper.setAttribute("role", "img");
      wrapper.setAttribute("aria-label", isTrait(name) ? name : `${name} ×${count}`);
      const img = document.createElement("img");
      img.src = `images/tags/${name}.png`;
      img.alt = name;
      wrapper.appendChild(img);
      const badge = document.createElement("span");
      badge.className = "tag-badge";
      badge.textContent = isTrait(name) ? "" : String(Math.max(0, count));
      wrapper.appendChild(badge);
      enemyBox.appendChild(wrapper);
    });
  }
}
   function findMorereturnTag(fight, side) {
     const list = getTagListForSide(fight, side);
     if (!Array.isArray(list)) return -1;
     for (let i = 0; i < list.length; i += 1) {
       const entry = list[i];
       const tagName = String(entry[0] ?? "");
       if (tagName) {
         const tagDef = tagsDatabase && isObject(tagsDatabase[tagName]) ? tagsDatabase[tagName] : null;
         if (tagName === "额外回合" || (tagDef && String(tagDef.ID ?? "") === "moreturn")) return i;
       }
     }
     return -1;
   }
  // ---------- end 标签工具 ----------
  
// 渲染战斗界面背包与装备（简单渲染，复用 .bag-slot 结构）
function renderFightBags() {
  const fight = window.fight;
  
  // 玩家背包（道具）
  const playerBagEl = document.getElementById("fightplayerbag");
  if (playerBagEl) {
    playerBagEl.innerHTML = "";
    (window.fightplayerbag || []).forEach(function (cardName, bagIndex) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "bag-slot";
      btn.dataset.card = cardName;
      btn.setAttribute("aria-label", cardName);
      btn.disabled = !playerCardCanUse(fight, null, true);
      const img = document.createElement("img");
      img.src = window.fightcardImage(cardName);
      img.alt = cardName;
      btn.appendChild(img);
      btn.addEventListener("mouseenter", function () {
        displayfightcardinfo(1,cardName);
      });
      btn.onclick = async function () {
        if (!fight || fight.ended || fight.carduseLocked || fight.sideturn === "enemy") {
          return;
        }
        const card = getFightCardData(cardName);
        if (!card) return;
        
        const type = card ? card["类型"] : null;
        const effect = card ? card["效果"] : null;
        const tagValue = card ? String(card["tag"] ?? "").trim() : "";
        const tag = tagValue;
//        const mpCost = card ? Number(card["MP"] ?? 0) : 0;
        const mpCost = 0; // 背包内卡牌不消耗MP
        if (Number.isFinite(mpCost) && mpCost > 0 && fight.player.MP < mpCost) {
          return;
        }
        
        // 从背包移除
        window.fightplayerbag.splice(bagIndex, 1);
        renderFightBags();
        
        if (Number.isFinite(mpCost) && mpCost > 0) {
          fight.player.MP -= mpCost;
        }
        
        await carduse(1,type,card,tag,cardName,fight,[],-1,0,{});
        const outcome = getFightOutcome(fight);
        if (outcome === "win" || outcome === "lost") {
          finishFight(fight, outcome);
        }
        
        updatePlayerHandUI(fight);
        renderAbilityButton(fight, 1);
        renderAbilityButton(fight, 0);
        bindPlayerHandActions(fight);
      };
      playerBagEl.appendChild(btn);
    });
  }

  // 玩家装备（战斗专用 equip 区）
  const playerEquipEl = document.getElementById("fightplayerequip");
  if (playerEquipEl) {
    playerEquipEl.innerHTML = "";
    (window.fightplayerequip || []).forEach(function (cardName) {
      const card = isObject(window.cardDatabase) ? window.cardDatabase[cardName] : null;
      if (!card) return;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "bag-slot";
      btn.dataset.card = cardName;
      btn.setAttribute("aria-label", cardName);
      const img = document.createElement("img");
      img.src = window.fightcardImage(cardName);
      img.alt = cardName;
      btn.appendChild(img);
      btn.addEventListener("mouseenter", function () {
        displayfightcardinfo(1, cardName);
      });
      playerEquipEl.appendChild(btn);
    });
  }

  // 敌人背包
  const enemyBagEl = document.getElementById("fightenemybag");
  if (enemyBagEl) {
    enemyBagEl.innerHTML = "";
    (window.fightenemybag || []).forEach(function (cardName) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "bag-slot";
      btn.dataset.card = cardName;
      btn.setAttribute("aria-label", cardName);
      const img = document.createElement("img");
      img.src = window.fightcardImage(cardName);
      img.alt = cardName;
      bindFightCardInfo(btn,1,cardName);
      btn.appendChild(img);
      enemyBagEl.appendChild(btn);
    });
  }

  // 敌人装备
  const enemyEquipEl = document.getElementById("fightenemyequip");
  if (enemyEquipEl) {
    enemyEquipEl.innerHTML = "";
    (window.fightenemyequip || []).forEach(function (cardName) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "bag-slot";
      btn.dataset.card = cardName;
      btn.setAttribute("aria-label", cardName);
      const img = document.createElement("img");
      img.src = window.fightcardImage(cardName);
      img.alt = cardName;
      bindFightCardInfo(btn,1,cardName);
      btn.appendChild(img);
      enemyEquipEl.appendChild(btn);
    });
  }
}
  async function startsidecounter(side,type,effect,tag,sidetype,fight,register,stepIndex,cardName,valuechange) {
    const counterSide = side === 1 ? 1 : 0;
    const hand = counterSide === 1 ? fight.playerhand : fight.enemyhand;
    if (!Array.isArray(hand) || hand.length === 0) return {side:side,type:type,effect:effect,tag:tag,sidetype:sidetype,register:-1};
    if (!Array.isArray(fight.judgeLocks)) fight.judgeLocks = [];
    if (!Array.isArray(fight.judgeRemoveLog)) fight.judgeRemoveLog = [];
    const locks = fight.judgeLocks;
    const removeLog = fight.judgeRemoveLog;
    for (const lock of locks) {
      for (;lock.logPos < removeLog.length;lock.logPos += 1) {
        const record = removeLog[lock.logPos];
        if (record.list !== lock.list) continue;
        for (const slot of lock.slots) {
          if (!slot.alive) continue;
          if (slot.index === record.index) {
            slot.alive = false;
          } else if (slot.index > record.index) {
            slot.index -= 1;
          }
        }
      }
    }
    let startIndex = 0;
    if (typeof register === "number" && register >= 0) {
      startIndex = register + 1;
      for (let lockIndex = locks.length - 1;lockIndex >= 0;lockIndex -= 1) {
        const current = locks[lockIndex].list === hand ? locks[lockIndex].current : null;
        if (!current) continue;
        startIndex = current.alive ? current.index + 1 : current.index;
        break;
      }
    }
    // lock hand
    const lock = {list:hand,slots:[],current:null,logPos:removeLog.length};
    for (let index = startIndex;index < hand.length;index += 1) {
      lock.slots.push({entry:hand[index],index:index,alive:true});
    }
    locks.push(lock);
    try {
      for (const slot of lock.slots) {
        for (;lock.logPos < removeLog.length;lock.logPos += 1) {
          const record = removeLog[lock.logPos];
          if (record.list !== hand) continue;
          for (const other of lock.slots) {
            if (!other.alive) continue;
            if (other.index === record.index) {
              other.alive = false;
            } else if (other.index > record.index) {
              other.index -= 1;
            }
          }
        }
        if (!slot.alive) continue;
        if (hand[slot.index] !== slot.entry) {
          const foundIndex = hand.indexOf(slot.entry);
          if (foundIndex === -1) continue;
          slot.index = foundIndex;
        }
        const index = slot.index;
        lock.current = slot;
        const sourceCardName = parseFightCard(hand[index]).name;
        const sourceCard = getFightCardData(sourceCardName);
        const sourceType = sourceCard ? String(sourceCard["类型"] ?? "").trim() : "";
        if (!sourceCardName || sourceType !== "反制卡" || !isObject(sourceCard)) continue;
        const result = await effectruleAPI(side,type,effect,tag,sidetype,fight,index,stepIndex,sourceCard,counterSide,1,cardName,valuechange,sourceCardName);
        effect = result.effect;
        if (fight.ended) break;
      }
    } finally {
      lock.current = null;
      const lockIndex = locks.indexOf(lock);
      if (lockIndex !== -1) locks.splice(lockIndex,1);
      if (locks.length === 0) removeLog.length = 0;
    }
    return {side:side,type:type,effect:effect,tag:tag,sidetype:sidetype,register:-1};
  }

  async function startsideequip(side,type,effect,tag,sidetype,fight,register,stepIndex,cardName,valuechange) {
    const ownerSide = side === 1 ? 1 : 0;
    const equips = side === 1 ? fight.fightplayerequip : fight.fightenemyequip;
    if (!Array.isArray(equips) || equips.length === 0) return {side:side,type:type,effect:effect,tag:tag,sidetype:sidetype,register:-1};
    if (!Array.isArray(fight.judgeLocks)) fight.judgeLocks = [];
    if (!Array.isArray(fight.judgeRemoveLog)) fight.judgeRemoveLog = [];
    const locks = fight.judgeLocks;
    const removeLog = fight.judgeRemoveLog;
    for (const lock of locks) {
      for (;lock.logPos < removeLog.length;lock.logPos += 1) {
        const record = removeLog[lock.logPos];
        if (record.list !== lock.list) continue;
        for (const slot of lock.slots) {
          if (!slot.alive) continue;
          if (slot.index === record.index) {
            slot.alive = false;
          } else if (slot.index > record.index) {
            slot.index -= 1;
          }
        }
      }
    }
    let startIndex = 0;
    if (typeof register === "number" && register >= 0) {
      startIndex = register + 1;
      for (let lockIndex = locks.length - 1;lockIndex >= 0;lockIndex -= 1) {
        const current = locks[lockIndex].list === equips ? locks[lockIndex].current : null;
        if (!current) continue;
        startIndex = current.alive ? current.index + 1 : current.index;
        break;
      }
    }
    // lock equips
    const lock = {list:equips,slots:[],current:null,logPos:removeLog.length};
    for (let index = startIndex;index < equips.length;index += 1) {
      lock.slots.push({entry:equips[index],index:index,alive:true});
    }
    locks.push(lock);
    try {
      for (const slot of lock.slots) {
        for (;lock.logPos < removeLog.length;lock.logPos += 1) {
          const record = removeLog[lock.logPos];
          if (record.list !== equips) continue;
          for (const other of lock.slots) {
            if (!other.alive) continue;
            if (other.index === record.index) {
              other.alive = false;
            } else if (other.index > record.index) {
              other.index -= 1;
            }
          }
        }
        if (!slot.alive) continue;
        if (equips[slot.index] !== slot.entry) {
          const foundIndex = equips.indexOf(slot.entry);
          if (foundIndex === -1) continue;
          slot.index = foundIndex;
        }
        const index = slot.index;
        lock.current = slot;
        const sourceCardName = parseFightCard(equips[index]).name;
        const sourceCard = getFightCardData(sourceCardName);
        if (!isObject(sourceCard)) continue;
        const result = await effectruleAPI(side,type,effect,tag,sidetype,fight,index,stepIndex,sourceCard,ownerSide,1,cardName,valuechange);
        effect = result.effect;
        if (fight.ended) break;
      }
    } finally {
      lock.current = null;
      const lockIndex = locks.indexOf(lock);
      if (lockIndex !== -1) locks.splice(lockIndex,1);
      if (locks.length === 0) removeLog.length = 0;
    }
    return {side:side,type:type,effect:effect,tag:tag,sidetype:sidetype,register:-1};
  }

  async function startsidetrait(side,type,effect,tag,sidetype,fight,register,stepIndex,cardName,valuechange) {
    return judgeSideMarks(side,type,effect,tag,sidetype,fight,register,stepIndex,cardName,valuechange,side === 1 ? 1 : 0,"trait");
  }

  async function startsidetag(side,type,effect,tag,sidetype,fight,register,stepIndex,cardName,valuechange) {
    return judgeSideMarks(side,type,effect,tag,sidetype,fight,register,stepIndex,cardName,valuechange,side === 1 ? 1 : 0,"tag");
  }

  async function nsidetag(side,type,effect,tag,sidetype,fight,register,stepIndex,cardName,valuechange) {
    return judgeSideMarks(side,type,effect,tag,sidetype,fight,register,stepIndex,cardName,valuechange,side === 1 ? 0 : 1,"tag");
  }

  async function nsidetrait(side,type,effect,tag,sidetype,fight,register,stepIndex,cardName,valuechange) {
    return judgeSideMarks(side,type,effect,tag,sidetype,fight,register,stepIndex,cardName,valuechange,side === 1 ? 0 : 1,"trait");
  }

  async function judgeSideMarks(side,type,effect,tag,sidetype,fight,register,stepIndex,cardName,valuechange,ownerSide,markType) {
    const tagList = markType === "trait" ? (ownerSide === 1 ? fight.playerfighttraits : fight.enemyfighttraits) : getTagListForSide(fight,ownerSide);
    if (!tagList || tagList.length === 0) return {side:side,type:type,effect:effect,tag:tag,sidetype:sidetype,register:-1};
    const tagDefs = await loadTagsDatabase();
    const startIndex = (typeof register === "number" && register >= 0) ? register + 1 : 0;
    // lock tags
    for (const entry of tagList.slice(startIndex)) {
      const index = tagList.indexOf(entry);
      if (index === -1) continue;
      const tagName = String(entry[0] ?? "");
      const tagCount = Number(entry[1] ?? 0);
      if (!tagName || tagCount <= 0) continue;
      const sourceData = tagDefs[tagName];
      if (!isObject(sourceData) || (sourceData.type === "trait" ? "trait" : "tag") !== markType) continue;
      const result = await effectruleAPI(side,type,effect,tag,sidetype,fight,index,stepIndex,sourceData,ownerSide,tagCount,cardName,valuechange);
      effect = result.effect;
      if (fight.ended) break;
    }
    return {side:side,type:type,effect:effect,tag:tag,sidetype:sidetype,register:-1};
  }

  async function nsideequip(side,type,effect,tag,sidetype,fight,register,stepIndex,cardName,valuechange) {
    const ownerSide = side === 1 ? 0 : 1;
    const equips = side === 1 ? fight.fightenemyequip : fight.fightplayerequip;
    if (!Array.isArray(equips) || equips.length === 0) return {side:side,type:type,effect:effect,tag:tag,sidetype:sidetype,register:-1};
    if (!Array.isArray(fight.judgeLocks)) fight.judgeLocks = [];
    if (!Array.isArray(fight.judgeRemoveLog)) fight.judgeRemoveLog = [];
    const locks = fight.judgeLocks;
    const removeLog = fight.judgeRemoveLog;
    for (const lock of locks) {
      for (;lock.logPos < removeLog.length;lock.logPos += 1) {
        const record = removeLog[lock.logPos];
        if (record.list !== lock.list) continue;
        for (const slot of lock.slots) {
          if (!slot.alive) continue;
          if (slot.index === record.index) {
            slot.alive = false;
          } else if (slot.index > record.index) {
            slot.index -= 1;
          }
        }
      }
    }
    let startIndex = 0;
    if (typeof register === "number" && register >= 0) {
      startIndex = register + 1;
      for (let lockIndex = locks.length - 1;lockIndex >= 0;lockIndex -= 1) {
        const current = locks[lockIndex].list === equips ? locks[lockIndex].current : null;
        if (!current) continue;
        startIndex = current.alive ? current.index + 1 : current.index;
        break;
      }
    }
    // lock equips
    const lock = {list:equips,slots:[],current:null,logPos:removeLog.length};
    for (let index = startIndex;index < equips.length;index += 1) {
      lock.slots.push({entry:equips[index],index:index,alive:true});
    }
    locks.push(lock);
    try {
      for (const slot of lock.slots) {
        for (;lock.logPos < removeLog.length;lock.logPos += 1) {
          const record = removeLog[lock.logPos];
          if (record.list !== equips) continue;
          for (const other of lock.slots) {
            if (!other.alive) continue;
            if (other.index === record.index) {
              other.alive = false;
            } else if (other.index > record.index) {
              other.index -= 1;
            }
          }
        }
        if (!slot.alive) continue;
        if (equips[slot.index] !== slot.entry) {
          const foundIndex = equips.indexOf(slot.entry);
          if (foundIndex === -1) continue;
          slot.index = foundIndex;
        }
        const index = slot.index;
        lock.current = slot;
        const sourceCardName = parseFightCard(equips[index]).name;
        const sourceCard = getFightCardData(sourceCardName);
        if (!isObject(sourceCard)) continue;
        const result = await effectruleAPI(side,type,effect,tag,sidetype,fight,index,stepIndex,sourceCard,ownerSide,1,cardName,valuechange);
        effect = result.effect;
        if (fight.ended) break;
      }
    } finally {
      lock.current = null;
      const lockIndex = locks.indexOf(lock);
      if (lockIndex !== -1) locks.splice(lockIndex,1);
      if (locks.length === 0) removeLog.length = 0;
    }
    return {side:side,type:type,effect:effect,tag:tag,sidetype:sidetype,register:-1};
  }

  async function nsidecounter(side,type,effect,tag,sidetype,fight,register,stepIndex,cardName,valuechange) {
    const counterSide = side === 1 ? 0 : 1;
    const hand = counterSide === 1 ? fight.playerhand : fight.enemyhand;
    if (!Array.isArray(hand) || hand.length === 0) return {side:side,type:type,effect:effect,tag:tag,sidetype:sidetype,register:-1};
    if (!Array.isArray(fight.judgeLocks)) fight.judgeLocks = [];
    if (!Array.isArray(fight.judgeRemoveLog)) fight.judgeRemoveLog = [];
    const locks = fight.judgeLocks;
    const removeLog = fight.judgeRemoveLog;
    for (const lock of locks) {
      for (;lock.logPos < removeLog.length;lock.logPos += 1) {
        const record = removeLog[lock.logPos];
        if (record.list !== lock.list) continue;
        for (const slot of lock.slots) {
          if (!slot.alive) continue;
          if (slot.index === record.index) {
            slot.alive = false;
          } else if (slot.index > record.index) {
            slot.index -= 1;
          }
        }
      }
    }
    let startIndex = 0;
    if (typeof register === "number" && register >= 0) {
      startIndex = register + 1;
      for (let lockIndex = locks.length - 1;lockIndex >= 0;lockIndex -= 1) {
        const current = locks[lockIndex].list === hand ? locks[lockIndex].current : null;
        if (!current) continue;
        startIndex = current.alive ? current.index + 1 : current.index;
        break;
      }
    }
    // lock hand
    const lock = {list:hand,slots:[],current:null,logPos:removeLog.length};
    for (let index = startIndex;index < hand.length;index += 1) {
      lock.slots.push({entry:hand[index],index:index,alive:true});
    }
    locks.push(lock);
    try {
      for (const slot of lock.slots) {
        for (;lock.logPos < removeLog.length;lock.logPos += 1) {
          const record = removeLog[lock.logPos];
          if (record.list !== hand) continue;
          for (const other of lock.slots) {
            if (!other.alive) continue;
            if (other.index === record.index) {
              other.alive = false;
            } else if (other.index > record.index) {
              other.index -= 1;
            }
          }
        }
        if (!slot.alive) continue;
        if (hand[slot.index] !== slot.entry) {
          const foundIndex = hand.indexOf(slot.entry);
          if (foundIndex === -1) continue;
          slot.index = foundIndex;
        }
        const index = slot.index;
        lock.current = slot;
        const sourceCardName = parseFightCard(hand[index]).name;
        const sourceCard = getFightCardData(sourceCardName);
        const sourceType = sourceCard ? String(sourceCard["类型"] ?? "").trim() : "";
        if (!sourceCardName || sourceType !== "反制卡" || !isObject(sourceCard)) continue;
        const result = await effectruleAPI(side,type,effect,tag,sidetype,fight,index,stepIndex,sourceCard,counterSide,1,cardName,valuechange,sourceCardName);
        effect = result.effect;
        if (fight.ended) break;
      }
    } finally {
      lock.current = null;
      const lockIndex = locks.indexOf(lock);
      if (lockIndex !== -1) locks.splice(lockIndex,1);
      if (locks.length === 0) removeLog.length = 0;
    }
    return {side:side,type:type,effect:effect,tag:tag,sidetype:sidetype,register:-1};
  }
// 卡牌可用性检查
function checkCardCanUse(cardEntry,player,isHandCard = false) {
  const parsedCard = parseFightCard(cardEntry);
  const cardName = parsedCard.name;
  const card = getFightCardData(cardName);
  
  if (!card) return false;
  
  // 反制卡不可用
  const type = String(card["类型"] ?? "").trim();
  if (type === "反制卡") {
    return false;
  }
  
  // 检查MP不足
  const baseCost = Number(parsedCard.valuechange.MP ?? card.MP ?? 0);
  const costChange = isHandCard && isObject(player) ? Number(player.cardmpchange ?? 0) : 0;
  const mpCost = Math.max(0,(Number.isFinite(baseCost) ? baseCost : 0) + (Number.isFinite(costChange) ? costChange : 0));
  if (Number.isFinite(mpCost) && mpCost > 0) {
    const playerMP = isObject(player) ? Number(player.MP) : 0;
    if (playerMP < mpCost) {
      return false;
    }
  }
  
  return true;
}

function playerCardCanUse(fight, cardEntry, isBackpack) {
  // 背包卡牌逻辑
  if (isBackpack) {
    // 非玩家回合：禁用
    if (fight.sideturn === "enemy") {
      return false;
    }
    // 玩家回合：可用
    return true;
  }
  
  // 手牌逻辑
  // 非玩家回合：禁用
  if (fight.sideturn === "enemy") {
    return false;
  }
  
  // 检查卡牌是否可用
  if (!checkCardCanUse(cardEntry,fight.player,true)) {
    return false;
  }
  
  // 手牌可用
  return true;
}
function updatePlayerHandUI(fight) {
  const slots = Array.from(document.querySelectorAll(".game-area .player.bottom .slots .card-slot"));

  slots.forEach(
    function (button, index) {
      const cardEntry = fight.playerhand[index];
      const cardName = parseFightCard(cardEntry).name;

      if (!cardName || button.classList.contains("is-empty")) {
        button.disabled = true;
        return;
      }

      // 使用新的卡牌可用性检查
      button.disabled = !playerCardCanUse(fight, cardEntry, false);
    }
  );
}
  function getFightOutcome(fight) {
  if (fight.player.HP > 0 && fight.enemy.HP <= 0) {
    return "win";
  }

  if (fight.player.HP <= 0) {
    return "lost";
  }

  return null;
}

function finishFight(fight, outcome) {
  if (!fight || fight.ended) {
    return outcome;
  }

  fight.ended = true;

  const endTurnButton = document.querySelector(
    ".game-area .end-turn"
  );

  if (endTurnButton) {
    endTurnButton.disabled = true;
    endTurnButton.onclick = null;
  }

  const resolve = fight.resolve;
  fight.resolve = null;

  if (typeof resolve === "function") {
    resolve(outcome);
  }

  return outcome;
}
async function advvalue(config,side,fight,cardName,valuechange,sidetype,type,effect) {
  if (!isObject(config)) return 0;
   for (let valueTypeIndex = 0;valueTypeIndex < valuetypes.length;valueTypeIndex += 1) {
    const valueType = valuetypes[valueTypeIndex];
    if (!Object.prototype.hasOwnProperty.call(config,valueType)) {
      continue;
    }
    if (valueType === "value_read") {
      const value = parseValueRead(config.value_read,fight,side);
      return Number.isFinite(value) ? value : 0;
    }
    if (valueType === "value_js") {
      const funcName = String(config.value_js ?? "").trim();
      const inputText = String(config.input ?? "").trim();
      const params = inputText === "" ? [] : inputText.split(";").map(function (value) { return value.trim(); });
      if (!funcName || typeof window[funcName] !== "function") return 0;
      try {
        const value = await window[funcName](...params,cardName ?? "",isObject(valuechange) ? valuechange : (isObject(fight.currentCardValuechange) ? fight.currentCardValuechange : {}),sidetype,fight,side,type,effect);
        return Number.isFinite(Number(value)) ? Number(value) : 0;
      } catch (error) {
        console.error(`Error calling ${funcName}:`,error);
        return 0;
      }
    }
  }
  const value = Number(config.value);
  return Number.isFinite(value) ? value : 0;
}
async function effectAPI(side,type,effect,tag,sidetype,fight,register,stepIndex,sourceEffect,ownerSide,sourceCount,cardName,valuechange) {
//  console.log(side,type,effect,tag,sidetype,fight,register,stepIndex,sourceEffect,ownerSide,sourceCount);
  await loadTagsDatabase();
  const deleteOnMove = effect?.event?.movetograve?.delete;
  if (deleteOnMove === "true" || deleteOnMove === true) {
    fight.deleteonmovetograve += 1;
  }
  let source = isObject(sourceEffect) ? {...sourceEffect} : {};
  const isFallbackSource = !isObject(effect);
  let nextEffect = effect;
    if (!isObject(nextEffect) && typeof nextEffect !== "string" && isObject(sourceEffect)) {
    nextEffect = {...sourceEffect};
    for (let metaIndex = 0;metaIndex < ruleMetaKeys.length;metaIndex += 1) {
      delete nextEffect[ruleMetaKeys[metaIndex]];
    } 
  }
  const effectChange = source["effectchange"];
  if (isObject(effectChange) && (Object.prototype.hasOwnProperty.call(effectChange,"delete") || Object.prototype.hasOwnProperty.call(effectChange,"add"))) {
    const deleteConfig = effectChange["delete"];
    const deletePaths = (Array.isArray(deleteConfig) ? deleteConfig : typeof deleteConfig === "string" ? [deleteConfig] : []).map(function (value) { return String(value).trim(); }).filter(Boolean);
    const addConfig = isObject(effectChange["add"]) ? effectChange["add"] : {};
    if (typeof nextEffect === "string" && deletePaths.includes(nextEffect.trim())) {
      nextEffect = {};
    }
    if (isObject(nextEffect)) {
      nextEffect = {...nextEffect};
      for (const deletePath of deletePaths) {
        const keys = deletePath.split(".").map(function (value) { return value.trim(); });
        if (keys.some(function (key) { return key === ""; })) continue;
        const parents = [nextEffect];
        let node = nextEffect;
        for (let keyIndex = 0;keyIndex < keys.length - 1;keyIndex += 1) {
          if (!isObject(node[keys[keyIndex]])) {
            node = null;
            break;
          }
          node[keys[keyIndex]] = {...node[keys[keyIndex]]};
          node = node[keys[keyIndex]];
          parents.push(node);
        }
        const lastKey = keys[keys.length - 1];
        if (!node || !Object.prototype.hasOwnProperty.call(node,lastKey)) continue;
        delete node[lastKey];
        for (let depth = parents.length - 1;depth > 0;depth -= 1) {
          if (Object.keys(parents[depth]).length > 0) break;
          delete parents[depth - 1][keys[depth - 1]];
        }
      }
      for (const [addPath,addValue] of Object.entries(addConfig)) {
        const keys = String(addPath).split(".").map(function (value) { return value.trim(); });
        if (keys.some(function (key) { return key === ""; })) continue;
        let node = nextEffect;
        for (let keyIndex = 0;keyIndex < keys.length - 1;keyIndex += 1) {
          node[keys[keyIndex]] = isObject(node[keys[keyIndex]]) ? {...node[keys[keyIndex]]} : {};
          node = node[keys[keyIndex]];
        }
        node[keys[keys.length - 1]] = addValue !== null && typeof addValue === "object" ? JSON.parse(JSON.stringify(addValue)) : addValue;
      }
      delete nextEffect["effectchange"];
      if (Object.keys(nextEffect).length === 0) {
        return {side:side,type:type,effect:null,tag:tag,sidetype:sidetype,register:register};
      }
    }
  }
  if (isObject(nextEffect) && Object.prototype.hasOwnProperty.call(nextEffect,"effectchange")) {
    nextEffect = {...nextEffect};
    delete nextEffect["effectchange"];
  }
  const effectSide = Number(ownerSide) === 1 ? 1 : 0;
    if (isObject(nextEffect) && isObject(nextEffect["valuechange"])) {
    nextEffect = {...nextEffect};

    const valueModify = {};

    for (const [path,config] of Object.entries(nextEffect["valuechange"])) {
      let newPath = String(path ?? "");

      newPath = newPath.replace("<selfside>",side === 1 ? "player" : "enemy");
      newPath = newPath.replace("<otherside>",side === 1 ? "enemy" : "player");

      const newConfig = isObject(config) ? {...config} : {value:config};
      if (!Object.prototype.hasOwnProperty.call(newConfig,"value")) {
        for (let valueTypeIndex = 0;valueTypeIndex < valuetypes.length;valueTypeIndex += 1) {
          if (!Object.prototype.hasOwnProperty.call(newConfig,valuetypes[valueTypeIndex])) {
            continue;
          }
          // const value = await advvalue(newConfig,side,fight,cardName,valuechange,sidetype,type,effect); 旧逻辑
          const value = await advvalue(newConfig,effectSide,fight,cardName,valuechange,sidetype,type,effect);
          newConfig.value = Number.isFinite(value) ? value : 0;
          delete newConfig.value_read;
          delete newConfig.value_js;
          break;
        }
      }
      valueModify[newPath] = newConfig;
    }
    nextEffect["valuechange"] = valueModify;
  }
  if (isObject(nextEffect) && isObject(nextEffect["伤害"])) {
    const damage = nextEffect["伤害"];
    if (!Object.prototype.hasOwnProperty.call(damage,"value")) {
      for (let valueTypeIndex = 0;valueTypeIndex < valuetypes.length;valueTypeIndex += 1) {
        if (!Object.prototype.hasOwnProperty.call(damage,valuetypes[valueTypeIndex])) {
          continue;
        }
        const value = await advvalue(damage,side,fight,cardName,valuechange,sidetype,type,effect);
        nextEffect = {...nextEffect};
        nextEffect["伤害"] = {...damage,value:Number.isFinite(value) ? value : 0};
        delete nextEffect["伤害"].value_read;
        delete nextEffect["伤害"].value_js;
        break;
      }
    }
  }
  const damageModifier = source["伤害修改"];
  if (isObject(damageModifier) && isObject(nextEffect) && isObject(nextEffect["伤害"])) {
    const damage = nextEffect["伤害"];
    const damageType = String(damage.type ?? "").trim();
    const requiredType = String(damageModifier.type ?? "").trim();
    if (requiredType === "unconstrained" || (requiredType && requiredType.split(";").map(function (value) { return value.trim(); }).filter(Boolean).includes(damageType))) {
      nextEffect = {...nextEffect};
      let modifierValue = null;
      if (Object.prototype.hasOwnProperty.call(damageModifier,"value")) {
        modifierValue = Number(damageModifier.value);
      } else {
        for (let valueTypeIndex = 0;valueTypeIndex < valuetypes.length;valueTypeIndex += 1) {
          if (!Object.prototype.hasOwnProperty.call(damageModifier,valuetypes[valueTypeIndex])) {
            continue;
          }
          modifierValue = await advvalue(damageModifier,effectSide,fight,cardName,valuechange,sidetype,type,effect);
          break;
        }
      }
        if (Object.prototype.hasOwnProperty.call(damageModifier,"value_new")) {
        const newValue = Number(damageModifier.value_new);
        if (Number.isFinite(newValue)) {
          nextEffect["伤害"] = {...damage,value:Math.max(0,Math.floor(newValue))};
        }
      } else if (Number.isFinite(modifierValue)) {
        const damageValue = Number(damage.value);
        if (Number.isFinite(damageValue)) {
          nextEffect["伤害"] = {...damage,value:Math.max(0,Math.floor(damageValue + modifierValue))};
        }
      }
    }
  }
  const sourceMarks = source["标记"];
  if (!isFallbackSource && isObject(sourceMarks)) {
    nextEffect = isObject(nextEffect) ? {...nextEffect,"标记":{...(nextEffect["标记"] || {})}} : {"标记":{}};
    const flipSelfOther = Number(ownerSide) !== Number(side);
    for (const [tagName,tagConfig] of Object.entries(sourceMarks)) {
      if (!isObject(tagConfig)) continue;
      const existingTagConfig = isObject(nextEffect["标记"][tagName]) ? {...nextEffect["标记"][tagName]} : {};
      for (const sideName of ["self","other","all"]) {
        if (!isObject(tagConfig[sideName])) continue;
        const sourceSideConfig = {...tagConfig[sideName]};
        if (!Object.prototype.hasOwnProperty.call(sourceSideConfig,"value")) {
          for (let valueTypeIndex = 0;valueTypeIndex < valuetypes.length;valueTypeIndex += 1) {
            if (!Object.prototype.hasOwnProperty.call(sourceSideConfig,valuetypes[valueTypeIndex])) {
              continue;
            }
            const value = await advvalue(sourceSideConfig,effectSide,fight,cardName,valuechange,sidetype,type,effect);
            sourceSideConfig.value = Number.isFinite(value) ? value : 0;
            delete sourceSideConfig.value_read;
            delete sourceSideConfig.value_js;
            break;
          }
        }
        const targetSideName = flipSelfOther ? (sideName === "self" ? "other" : sideName === "other" ? "self" : "all") : sideName;
        if (isObject(existingTagConfig[targetSideName]) && Number.isFinite(Number(existingTagConfig[targetSideName].value)) && Number.isFinite(Number(sourceSideConfig.value))) {
          existingTagConfig[targetSideName] = {...existingTagConfig[targetSideName],value:Number(existingTagConfig[targetSideName].value) + Number(sourceSideConfig.value)};
        } else {
          existingTagConfig[targetSideName] = sourceSideConfig;
        }
      }
      nextEffect["标记"][tagName] = existingTagConfig;
    }
  }
  if (isObject(nextEffect) && isObject(nextEffect["抽卡"])) {
    const drawCard = nextEffect["抽卡"];
    if (!Object.prototype.hasOwnProperty.call(drawCard,"value")) {
      for (let valueTypeIndex = 0;valueTypeIndex < valuetypes.length;valueTypeIndex += 1) {
        if (!Object.prototype.hasOwnProperty.call(drawCard,valuetypes[valueTypeIndex])) {
          continue;
        }
        const value = await advvalue(drawCard,side,fight,cardName,valuechange,sidetype,type,effect);
        nextEffect = {...nextEffect};
        nextEffect["抽卡"] = {...drawCard,value:Number.isFinite(value) ? value : 0};
        delete nextEffect["抽卡"].value_read;
        delete nextEffect["抽卡"].value_js;
        break;
      }
    }
  }
    if (isObject(nextEffect) && isObject(nextEffect["卡牌选择"])) {
    /* pick:pick only hand,other fallback to random */
    const rawCardSelectConfig = nextEffect["卡牌选择"];
    const rawCardSelectSource = String(rawCardSelectConfig.source ?? "hand").trim().toLowerCase();
    if (String(rawCardSelectConfig.pick ?? "").trim().toLowerCase() === "pick" && rawCardSelectSource !== "hand") {
      console.warn(`[${cardName}]在不支持的source使用了pick:pick`);
      nextEffect = {...nextEffect,"卡牌选择":{...rawCardSelectConfig,pick:"random"}};
    }
    const cardSelectConfig = nextEffect["卡牌选择"];
    if (!Object.prototype.hasOwnProperty.call(cardSelectConfig,"value")) {
      for (let valueTypeIndex = 0;valueTypeIndex < valuetypes.length;valueTypeIndex += 1) {
        if (!Object.prototype.hasOwnProperty.call(cardSelectConfig,valuetypes[valueTypeIndex])) {
          continue;
        }
        const value = await advvalue(cardSelectConfig,side,fight,cardName,valuechange,sidetype,type,effect);
        nextEffect = {...nextEffect};
        nextEffect["卡牌选择"] = {...cardSelectConfig,value:Number.isFinite(value) ? value : 0};
        delete nextEffect["卡牌选择"].value_read;
        delete nextEffect["卡牌选择"].value_js;
        break;
      }
    }
  }
  if (isObject(nextEffect) && isObject(nextEffect["获取卡"])) {
    nextEffect = {...nextEffect,"获取卡":{...nextEffect["获取卡"]}};
    for (const [getCardName,getCardConfig] of Object.entries(nextEffect["获取卡"])) {
      if (!isObject(getCardConfig)) continue;
      const nextGetCardConfig = {...getCardConfig};
      if (!Object.prototype.hasOwnProperty.call(nextGetCardConfig,"value")) {
        let value = null;
        for (let valueTypeIndex = 0;valueTypeIndex < valuetypes.length;valueTypeIndex += 1) {
          if (!Object.prototype.hasOwnProperty.call(nextGetCardConfig,valuetypes[valueTypeIndex])) {
            continue;
          }
          value = await advvalue(nextGetCardConfig,side,fight,cardName,valuechange,sidetype,type,effect);
          break;
        }
        if (Number.isFinite(value)) {
          nextGetCardConfig.value = value;
          delete nextGetCardConfig.value_read;
          delete nextGetCardConfig.value_js;
        }
      }
      nextEffect["获取卡"][getCardName] = nextGetCardConfig;
    }
  }
  return {side:side,type:type,effect:nextEffect,tag:tag,sidetype:sidetype,register:register};
}
async function cardeffect(side,type,effect,fight,cardName = "",sidetype = []) {
//  console.log(side,type,effect,fight);
  /* 数值修改 */
  const valueModify = isObject(effect) ? effect["valuechange"] : null;

  if (isObject(valueModify)) {
    for (const [path,config] of Object.entries(valueModify)) {
      if (!isObject(config)) {
        continue;
      }

      const value = Number(config.value);
      const valueNew = Number(config.value_new);

      const match = String(path).match(/^fight\.(player|enemy)\.(.+)$/);

      if (!match) {
        continue;
      }

      const target = match[1] === "player" ? fight.player : fight.enemy;

      const key = match[2];

      if (!Object.prototype.hasOwnProperty.call(target,key)) {
        continue;
      }

      if (Object.prototype.hasOwnProperty.call(config,"value_new")) {
        if (Number.isFinite(valueNew)) {
          target[key] = valueNew;
        }
      } else if (Object.prototype.hasOwnProperty.call(config,"value")) {
        if (Number.isFinite(value)) {
          target[key] = Number(target[key]) + value;
        }
      }
    }
  }
  /* 攻击伤害 */
  const damage = isObject(effect) ? effect["伤害"] : null;
  const value = isObject(damage) ? Number(damage.value) : 0;
  if (Number.isFinite(value) && value > 0) {
    const damageSide = String(damage.side ?? "other").trim().toLowerCase();
    const selfSide = Number(side) === 1 ? 1 : 0;
    // side默认other
    const targetSides = damageSide === "all" ? [selfSide,1 - selfSide] : [damageSide === "self" ? selfSide : 1 - selfSide];

    for (const targetSide of targetSides) {
      const target = targetSide === 1 ? fight.player : fight.enemy;
      target.HP = Number(target.HP) - value;
    }
  }
  /* 抽卡 */
  const drawCard = isObject(effect) ? effect["抽卡"] : null;
  const drawValue = isObject(drawCard) ? Number(drawCard.value) : 0;
  if (Number.isFinite(drawValue) && drawValue > 0) {
    if (side === 1) {
      await drawPlayerCards(drawValue);
      renderPlayerHand(fight);
    } else {
      await drawEnemyCards(drawValue);
      renderEnemyHand(fight);
    }
  }
  exposeBattleGlobals(fight);
  /* 将指定卡添加到卡组 */
const getCards = isObject(effect) ? effect["获取卡"] : null;
if (isObject(getCards)) {
  const selfSide = Number(side) === 1 ? 1 : 0;
  /* newloc: 放置位置。不填默认handcard(手牌)，支持fightcards(卡组)/grave(坟场)/site(场地)/equip(装备) */
  const getCardLocs = ["handcard","fightcards","grave","site","equip"];
  /* newcardside: 给谁。不填默认self(自身)，支持all(双方)/other(对方)；场地无效 */
  const getCardSides = ["self","all","other"];
  for (const [cardName,cardConfig] of Object.entries(getCards)) {
    const count = isObject(cardConfig) ? Number(cardConfig.value) : Number(cardConfig);
    const sidetypeText = isObject(cardConfig) ? String(cardConfig.sidetype ?? "").trim() : "";
    if (!Number.isFinite(count) || count <= 0) {
      continue;
    }
    let newLoc = isObject(cardConfig) ? String(cardConfig.newloc ?? "").trim().toLowerCase() : "";
    if (!getCardLocs.includes(newLoc)) {
      newLoc = "handcard";
    }
    let newCardSide = isObject(cardConfig) ? String(cardConfig.newcardside ?? "").trim().toLowerCase() : "";
    if (!getCardSides.includes(newCardSide)) {
      newCardSide = "self";
    }
    /* 场地不支持newcardside，固定放到自身场地 */
    let targetSides;
    if (newLoc === "site") {
      targetSides = [selfSide];
    } else if (newCardSide === "all") {
      targetSides = [0,1];
    } else if (newCardSide === "other") {
      targetSides = [1 - selfSide];
    } else {
      targetSides = [selfSide];
    }
    const addCount = Math.floor(count);
    for (let sideIndex = 0;sideIndex < targetSides.length;sideIndex += 1) {
      const targetSide = targetSides[sideIndex];
      for (let index = 0;index < addCount;index += 1) {
        if (newLoc === "handcard") {
          addcardtohand(cardName,targetSide,sidetypeText || undefined,undefined);
        } else if (newLoc === "fightcards") {
          movetofightcards(cardName,targetSide);
        } else if (newLoc === "grave") {
          await movetograve(cardName,targetSide);
        } else if (newLoc === "site") {
          movetosite(fight,cardName,targetSide,resolveCardSidetype(cardName,sidetypeText),1,{});
        } else if (newLoc === "equip") {
          movetoequip(fight,cardName,targetSide,resolveCardSidetype(cardName,sidetypeText),{});
        }
      }
    }
  }
  window.fightplayerhand = fight.playerhand;
  window.fightenemyhand = fight.enemyhand;
  renderPlayerHand(fight);
  renderEnemyHand(fight);
  exposeBattleGlobals(fight);
}
  /* 标记处理 */
  const tagsEffect = isObject(effect) ? effect["标记"] : null;
  if (isObject(tagsEffect)) {
    for (const [tagName,tagConfig] of Object.entries(tagsEffect)) {
      if (!isObject(tagConfig)) continue;
      for (const sideName of ["self","other","all"]) {
        const config = isObject(tagConfig[sideName]) ? tagConfig[sideName] : null;
        if (!config) continue;
        const valueNew = Number(config.value_new);
        /* if no value */
        let value = Number(config.value);
        if (!Object.prototype.hasOwnProperty.call(config,"value") || !Number.isFinite(value)) {
          value = await advvalue(config,side,fight,null,{},[],type,effect);
        }
        const targetSides = sideName === "all" ? [side,1 - side]
          : [sideName === "self" ? side : 1 - side];
        for (const targetSide of targetSides) {
          if (Object.prototype.hasOwnProperty.call(config,"value_new") && Number.isFinite(valueNew)) {
            setTagCount(fight,targetSide,tagName,valueNew);
          } else if (Number.isFinite(value) && value !== 0) {
            modifyTagCount(fight,targetSide,tagName,value);
          }
        }
          }
        }
      }
    }
  }

  /* 卡牌选择处理 */
  const cardSelection = isObject(effect) ? effect["卡牌选择"] : null;
  if (isObject(cardSelection)) {
    const selectConfig = parseCardSelection(cardSelection);
    const selectMode = String(selectConfig.mode ?? "").trim().toLowerCase();
    const selectPick = String(selectConfig.pick ?? "").trim().toLowerCase();
    const selectSource = String(selectConfig.source ?? "hand").trim().toLowerCase();
    const selectValue = Math.max(1,toInt(selectConfig.value,1));
    const newCardSide = selectConfig.newcardside === "self" ? side : (1 - side);
    const selectSide = selectConfig.side === "self" ? side : (1 - side);
    const selfName = String(cardName ?? "").trim() !== "" ? String(cardName).trim() : (parseFightCard(String(type ?? "")).name || "");

    /* source 默认/hand=手牌；fightcards=卡组，grave=坟场，site=场地，equip=装备 sitenoself=场地但跳过自身 */
    let sourceCards;
    let sourceOwners = null;
    if (selectSource === "fightcards") {
      sourceCards = selectSide === 1 ? fight.playercards : fight.enemycards;
    } else if (selectSource === "grave") {
      sourceCards = selectSide === 1 ? fight.fightplayergrave : fight.fightenemygrave;
    } else if (selectSource === "site" || selectSource === "sitenoself") {
      sourceCards = fight.fightsitecards;
      sourceOwners = fight.fightsitecardsow;
    } else if (selectSource === "equip") {
      sourceCards = selectSide === 1 ? fight.fightplayerequip : fight.fightenemyequip;
    } else {
      sourceCards = selectSide === 1 ? fight.playerhand : fight.enemyhand;
    }
    if (!Array.isArray(sourceCards)) {
      sourceCards = [];
    }

    /* 选择池：默认等于来源；sitenoself 时剔除自身（最后一个同名场地牌） */
    let poolIndices = sourceCards.map(function (cardEntry,index) { return index; });
    if (selectSource === "sitenoself" && selfName !== "") {
      let selfIndex = -1;
      for (let index = sourceCards.length - 1;index >= 0;index -= 1) {
        if (parseFightCard(sourceCards[index]).name === selfName) {
          selfIndex = index;
          break;
        }
      }
      if (selfIndex !== -1) {
        poolIndices = poolIndices.filter(function (index) { return index !== selfIndex; });
      }
    }
    const pickPool = poolIndices.map(function (index) { return sourceCards[index]; });
    let pickedIndices = [];
    if (selectConfig.hasFiller) {
      // js
      const filler = window[selectConfig.filler_js];
      if (typeof filler === "function") {
        const params = selectConfig.input === "" ? [] : selectConfig.input.split(";").map(function (value) { return value.trim(); });
        try {
          const selected = await filler(pickPool.slice(),...params);
          const remaining = poolIndices.slice();
          if (Array.isArray(selected)) {
            for (const entry of selected) {
              const index = remaining.findIndex(function (sourceIndex) { return sourceCards[sourceIndex] === entry; });
              if (index === -1) continue;
              pickedIndices.push(remaining[index]);
              remaining.splice(index,1);
            }
          }
        } catch (error) {
          console.error(`Error calling ${selectConfig.filler_js}:`,error);
        }
      }
    } else if (selectPick === "random") {
      if (poolIndices.length > 0) {
        pickedIndices.push(poolIndices[Math.floor(Math.random() * poolIndices.length)]);
      }
    } else if (selectPick === "top") {
      if (poolIndices.length > 0) {
        pickedIndices.push(poolIndices[0]);
      }
    } else if (selectPick === "end") {
      if (poolIndices.length > 0) {
        pickedIndices.push(poolIndices[poolIndices.length - 1]);
      }
    } else if (selectPick === "topnext") {
      pickedIndices = poolIndices.slice(0,selectValue);
    } else if (selectPick === "endnext") {
      pickedIndices = poolIndices.slice(Math.max(0,poolIndices.length - selectValue));
    } else if (selectPick === "pick") {
      /* 手动选择仅支持手牌来源：玩家手动点选，敌方随机 */
      if (side === 1) {
        await new Promise(function(resolve) {
          setupManualCardSelection(fight, selectSide, function(picked) {
            cardpick = picked;
            resolve();
          });
        });
      } else {
        cardpick = randomSelectCard(fight,selectSide);
      }
      if (Array.isArray(cardpick) && cardpick.length === 2 && sourceCards[Number(cardpick[1])] !== undefined) {
        pickedIndices.push(Number(cardpick[1]));
      }
    }

    const pickedList = pickedIndices.map(function (index) { return {entry:sourceCards[index],index:index}; });
    for (let pickIndex = 0;pickIndex < pickedList.length;pickIndex += 1) {
      const pickedCard = pickedList[pickIndex].entry;
      if (pickedCard === null || pickedCard === undefined) {
        continue;
      }
      const pickedInfo = parseFightCard(pickedCard);
      const pickedName = pickedInfo.name;
      if (!pickedName) {
        continue;
      }

      /* site/sitenoself can not with remove */
      if ((selectSource === "site" || selectSource === "sitenoself") && selectMode === "remove") {
        continue;
      }

      // filler
      let giveCount = 1;
      if ((selectConfig.hasFiller ? pickedList.length === 1 : (selectPick === "top" || selectPick === "end")) && (selectMode === "get" || selectMode === "copy")) {
        giveCount = selectValue;
      }

      if (selectMode === "copy" || selectMode === "get") {
        for (let addIndex = 0;addIndex < giveCount;addIndex += 1) {
          addcardtohand(pickedName,newCardSide,selectConfig.sidetypechange,pickedInfo.valuechange);
        }
      }

      if (selectMode === "get" || selectMode === "remove" || selectMode === "delete") {
        let removeIndex = pickedList[pickIndex].index;
        if (sourceCards[removeIndex] !== pickedCard) {
          removeIndex = sourceCards.indexOf(pickedCard);
        }
        if (removeIndex !== -1) {
          sourceCards.splice(removeIndex,1);
          if (Array.isArray(fight.judgeRemoveLog)) fight.judgeRemoveLog.push({list:sourceCards,index:removeIndex});
          if (Array.isArray(sourceOwners)) {
            sourceOwners.splice(removeIndex,1);
          }
          for (let laterIndex = pickIndex + 1;laterIndex < pickedList.length;laterIndex += 1) {
            if (pickedList[laterIndex].index > removeIndex) {
              pickedList[laterIndex].index -= 1;
            }
          }
        }
        /* remove */
        if (selectMode === "remove") {
          movetosite(fight,pickedName,selectSide,applySidetypeChange(pickedInfo.sidetype,selectConfig.sidetypechange),1,pickedInfo.valuechange);
        }
      }
    }
    if (selectSource === "equip") {
      renderFightEquip(fight,1);
      renderFightEquip(fight,0);
    }
    cardpick = null;

    window.fightplayerhand = fight.playerhand;
    window.fightenemyhand = fight.enemyhand;
    renderPlayerHand(fight);
    renderEnemyHand(fight);
    exposeBattleGlobals(fight);
  }
  const noWaitSidetypes = ["turnstart","turnend","drawcard","movetograve"];
  if (!(Array.isArray(sidetype) && sidetype.some(function (value) { return noWaitSidetypes.includes(String(value).trim()); }))) {
    await new Promise(function (resolve) { setTimeout(resolve,1000); });
  }
  return {side: side,type: type,effect: effect};
}

  async function carduse(side,type,effect,tag,cardName,fight,sidetype = [],register = -1,startStep = 0,valuechange = {},nextto = null,rulesChecked = false,usedMP = null,ignoreOverride = null){
  await loadTagsDatabase();
  let ignore = ignoreOverride === null || ignoreOverride === undefined ? "" : String(ignoreOverride);
  fight = fight || window.fight;

  if (!fight || fight.ended) {
    return null;
  }

  const cardData = cardName ? getFightCardData(cardName) : null;
  const cardType = isObject(cardData) ? String(cardData["类型"] ?? "").trim() : "";

  let ignoreValue = ignore;
  if ((ignoreValue === null || ignoreValue === undefined || String(ignoreValue).trim() === "") && cardName) {
    ignoreValue = cardData ? cardData["ignore"] : "";
  }
  const ignoreSteps = new Set(String(ignoreValue ?? "").split(";").map(function (value) { return value.trim(); }).filter(Boolean));

  let effectList = [];
  if (isObject(effect) && (Object.prototype.hasOwnProperty.call(effect,"效果") || Object.prototype.hasOwnProperty.call(effect,"效果_2"))) {
    if (isObject(effect["效果"])) {
      effectList.push(effect["效果"]);
    }
    let effectIndex = 2;
    while (Object.prototype.hasOwnProperty.call(effect,`效果_${effectIndex}`)) {
      if (isObject(effect[`效果_${effectIndex}`])) {
        effectList.push(effect[`效果_${effectIndex}`]);
      }
      effectIndex += 1;
    }
  }
  if (effectList.length === 0) {
    effectList.push(effect);
  }

  const judgementSteps = [startsidecounter,startsideequip,startsidetrait,startsidetag,nsidetag,nsidetrait,nsideequip,nsidecounter];

  let initialRegister = typeof register === "number" ? register : -1;
  if (typeof nextto === "string") {
    const nextData = nextto.split(":");
    if (nextData.length === 2) {
      const nextStep = Number(nextData[0]);
      const nextRegister = Number(nextData[1]);
      if (Number.isFinite(nextStep) && Number.isFinite(nextRegister)) {
        startStep = Math.floor(nextStep);
        initialRegister = Math.floor(nextRegister);
      }
    }
  } else if (isObject(nextto)) {
    for (const [stepName,stepRegister] of Object.entries(nextto)) {
      let stepIndexByName = -1;
      for (let stepIndex = 0;stepIndex < judgementSteps.length;stepIndex += 1) {
        if (judgementSteps[stepIndex].name === stepName) {
          stepIndexByName = stepIndex;
          break;
        }
      }
      if (stepIndexByName !== -1 && Number.isFinite(Number(stepRegister))) {
        startStep = stepIndexByName;
        initialRegister = Math.floor(Number(stepRegister));
        break;
      }
    }
  }
  if (!Number.isFinite(startStep) || startStep < 0) {
    startStep = 0;
  }

  /* carduse 可以嵌套（触发的新效果会发起新的 carduse）。只有最外层负责加锁/解锁与手牌重绘，嵌套层结束时不能提前解锁 */
  const carduseDepth = Number(fight.carduseDepth) > 0 ? Number(fight.carduseDepth) : 0;
  const isRootCarduse = carduseDepth === 0;
  fight.carduseDepth = carduseDepth + 1;
  if (isRootCarduse) {
    fight.carduseLocked = true;
    updatePlayerHandUI(fight);
  }

  let lastCardEffectResult = null;
  try {
  /* 入场统一在使用开始时处理：反制卡/基本卡移入场中，装备卡移入装备区 */
  if (cardName && cardType !== "" && !fight.ended) {
    const cardSide = Number(side) === 1 ? 1 : 0;
    let movedCounter = null;
    /* 反制卡移出手牌*/
    if (cardType === "反制卡") {
      const moveHand = cardSide === 1 ? fight.playerhand : fight.enemyhand;
      let moveIndex = -1;
      const locks = Array.isArray(fight.judgeLocks) ? fight.judgeLocks : [];
      for (let lockIndex = locks.length - 1;lockIndex >= 0;lockIndex -= 1) {
        const current = locks[lockIndex].list === moveHand ? locks[lockIndex].current : null;
        if (!current) continue;
        if (current.alive && moveHand[current.index] === current.entry && parseFightCard(current.entry).name === cardName) {
          moveIndex = current.index;
        }
        break;
      }
      if (moveIndex === -1) {
        moveIndex = moveHand.findIndex(function (entry) { return parseFightCard(entry).name === cardName; });
      }
      if (moveIndex !== -1) {
        movedCounter = parseFightCard(moveHand[moveIndex]);
        moveHand.splice(moveIndex,1);
        if (Array.isArray(fight.judgeRemoveLog)) fight.judgeRemoveLog.push({list:moveHand,index:moveIndex});
        if (cardSide === 1) {
          renderPlayerHand(fight);
        } else {
          renderEnemyHand(fight);
        }
      }
    }
    const baseSidetype = String(cardData["sidetype"] ?? "").split(";").map(function (value) { return value.trim(); }).filter(Boolean);
    const moveSidetype = Array.isArray(sidetype) && sidetype.length > 0 ? sidetype : baseSidetype;
    if (movedCounter) { // save valuechange and sidetype
      movetosite(fight,cardName,cardSide,movedCounter.sidetype,1,movedCounter.valuechange);
    } else if (cardType === "反制卡" || cardType === "基本卡") {
      movetosite(fight,cardName,cardSide,moveSidetype,1,valuechange);
    } else if (cardType === "装备卡") {
      movetoequip(fight,cardName,cardSide,moveSidetype,valuechange);
      if (!fight.ended) {
        /* 入场触发链：效果.装备.value = 卡名 */
        lastCardEffectResult = await carduse(cardSide,type,{"装备":{value:cardName}},tag,null,fight,moveSidetype,-1,0,valuechange,null,false,null,ignoreValue);
      }
      /* 含 startonadd:1 的效果（支持 效果_2 等）在 loops 检查前各自独立结算 */
      for (let effectIndex = 0;effectIndex < effectList.length;effectIndex += 1) {
        const addEffect = effectList[effectIndex];
        if (!isObject(addEffect) || Number(addEffect["startonadd"]) !== 1 || fight.ended) {
          continue;
        }
        const startEffect = {...addEffect};
        delete startEffect["startonadd"];
        lastCardEffectResult = await carduse(cardSide,type,startEffect,tag,null,fight,moveSidetype,-1,0,valuechange,null,false,null,ignoreValue);
      }
      /* 其余效果留在装备区作为规则，不在使用时结算 */
      return lastCardEffectResult;
    }
  }
  for (let effectIndex = 0;effectIndex < effectList.length;effectIndex += 1) {
    const cardEffect = effectList[effectIndex];
    let loopCount = 1;

    if (isObject(cardEffect) && isObject(cardEffect.loop)) {
      const loopConfig = cardEffect.loop;
      if (!Object.prototype.hasOwnProperty.call(loopConfig,"value")) {
        for (let valueTypeIndex = 0;valueTypeIndex < valuetypes.length;valueTypeIndex += 1) {
          if (!Object.prototype.hasOwnProperty.call(loopConfig,valuetypes[valueTypeIndex])) {
            continue;
          }
          const loopValue = await advvalue(loopConfig,side,fight,cardName,valuechange,sidetype,type,cardEffect);
          loopCount = Math.max(0,toInt(loopValue,1));
          break;
        }
      } else if (Number.isFinite(Number(loopConfig.value))) {
        loopCount = Math.max(0,toInt(loopConfig.value,1));
      }
    }

    for (let iter = 0;iter < loopCount;iter += 1) {
      if (!fight || fight.ended) break;

      /* random */
      let currentEffect = cardEffect;
      if (isObject(cardEffect)) {
        const keptEffect = {};
        for (const [effectName,effectConfig] of Object.entries(cardEffect)) {
          if (!isObject(effectConfig) || !Object.prototype.hasOwnProperty.call(effectConfig,"random")) {
            keptEffect[effectName] = effectConfig;
            continue;
          }
          const random = Number(effectConfig.random);
          if (Number.isFinite(random) && Math.random() >= random) {
            continue;
          }
          const keptConfig = {...effectConfig};
          delete keptConfig.random;
          keptEffect[effectName] = keptConfig;
        }
        currentEffect = keptEffect;
      }

      const initialEffectResult = await effectAPI(Number(side) === 1 ? 1 : 0,type,currentEffect,tag,sidetype,fight,-1,-1,null,Number(side) === 1 ? 1 : 0,1,cardName,valuechange);
      // 先通过 effectAPI 进行一次基础效果解析，再进入判定链
      let result = {
        side:Number(side) === 1 ? 1 : 0,
        type:type,
        effect:initialEffectResult.effect,
        tag:tag,
        sidetype:sidetype,
        cardName:cardName,
        valuechange:valuechange
      };
      for (let i = startStep;i < judgementSteps.length;i += 1) {
        const step = judgementSteps[i];
        // ignore
        if (ignoreSteps.has(step.name)) {
          continue;
        }
        // register 只作用于 startStep 指定的那一层（表示该层已判定到 register 为止，从下一项继续）；其后的层级必须从头判定
        const stepRegister = i === startStep ? initialRegister : -1;
        result = await runJudgementStep(step,result,fight,stepRegister,i);

        if (!result) {
          break;
        }

        result.effect = prepareJudgementEffect(result.effect);

        if (result.effect === null) {
          break;
        }

        result.register = -1;
      }

      if (!result || result.effect === null || fight.ended) {
        continue;
      }

      exposeBattleGlobals(fight);

      const cardeffectResult = await cardeffect(result.side,result.type,result.effect,fight,cardName,result.sidetype);
      lastCardEffectResult = cardeffectResult;
    }
  }  } finally {
    fight.carduseDepth = Math.max(0,Number(fight.carduseDepth) - 1);
    if (isRootCarduse) {
      fight.carduseLocked = false;
      updatePlayerHandUI(fight);
      renderAbilityButton(fight,1);
//      renderAbilityButton(fight,0);
      bindPlayerHandActions(fight);
    }
  }
  return lastCardEffectResult;
}
function bindPlayerHandActions(fight) {
  const slots = Array.from(document.querySelectorAll(".game-area .player.bottom .slots .card-slot"));
  slots.forEach(function (button) {
    if (fight.carduseLocked) {
      button.disabled = true;
      button.onclick = null;
      return;
    }
    const index = Number(button.dataset.index);
    const cardEntry = fight.playerhand[index];
    const parsedCard = parseFightCard(cardEntry);
    const cardName = parsedCard.name;
    
    // 卡牌可用性检查
    button.disabled = !playerCardCanUse(fight, cardEntry, false);
    
    button.onclick = async function () {
      if (!window.fight || window.fight !== fight || fight.ended || fight.carduseLocked || fight.sideturn === "enemy") {
        return;
      }
      const index = Number(button.dataset.index);
      const cardEntry = fight.playerhand[index];
      const parsedCard = parseFightCard(cardEntry);
      const cardName = parsedCard.name;
      const sidetype = parsedCard.sidetype;
      const valuechange = parsedCard.valuechange;
      if (!cardName) {
        return;
      }
      const card = getFightCardData(cardName);
      const type = card ? card["类型"] : null;
      const effect = card ? card["效果"] : null;
      const tagValue = card ? String(card["tag"] ?? "").trim() : "";
      const tag = tagValue;
      const baseCost = Number(valuechange.MP ?? card?.MP ?? 0);
      const costChange = Number(fight.player.cardmpchange ?? 0);
      const mpCost = Math.max(0,(Number.isFinite(baseCost) ? baseCost : 0) + (Number.isFinite(costChange) ? costChange : 0));
      if (Number.isFinite(mpCost) && mpCost > 0 && fight.player.MP < mpCost) {
        updatePlayerHandUI(fight);
        return;
      }
      fight.playerhand.splice(index, 1);
      renderPlayerHand(fight);
      bindPlayerHandActions(fight);
      exposeBattleGlobals(fight);
      if (Number.isFinite(mpCost) && mpCost > 0) {
        fight.player.MP -= mpCost;
      }
      const res = await carduse(1,type,card,tag,cardName,fight,sidetype,-1,0,valuechange,null,false,mpCost);
      const outcome = getFightOutcome(fight);
      if (outcome === "win" || outcome === "lost") {
        finishFight(fight,outcome);
      }
      updatePlayerHandUI(fight);
      bindPlayerHandActions(fight);
    };
  });
}
async function fightenemyactioncard(fight) {
  for (let index = 0; index < fight.enemyhand.length; index += 1) {
    const cardEntry = fight.enemyhand[index];
    const parsedCard = parseFightCard(cardEntry);
    const cardName = parsedCard.name;
    const sidetype = parsedCard.sidetype;
    const valuechange = parsedCard.valuechange;
    if (!cardName) continue;
    const card = getFightCardData(cardName);
    if (!card) continue;
    const type = card["类型"];
    const effect = card["效果"];
    const tagValue = card ? String(card["tag"] ?? "").trim() : "";
    const tag = tagValue === "" ? "item" : tagValue;
    let shouldUse = false;
    if (type === "基本卡") {
      shouldUse = true;
    } else if (type === "道具卡") {
      shouldUse = true;
    } else if (type === "装备卡") {
      shouldUse = true;
    }
    if (!shouldUse || !checkCardCanUse(cardEntry,fight.enemy,true)) continue;
    const baseCost = Number(valuechange.MP ?? card.MP ?? 0);
    const costChange = Number(fight.enemy.cardmpchange ?? 0);
    const mpCost = Math.max(0,(Number.isFinite(baseCost) ? baseCost : 0) + (Number.isFinite(costChange) ? costChange : 0));
    fight.enemyhand.splice(index, 1);
    index -= 1;
    renderEnemyHand(fight);
    exposeBattleGlobals(fight);
    fight.enemy.MP -= mpCost;
    await carduse(0,type,card,tag,cardName,fight,sidetype, -1, 0, valuechange, null, false, mpCost);
    await new Promise(function (resolve) { setTimeout(resolve, 1000); });
  }
}
  async function fightenemyaction() {
     const fight = window.fight;
   while (true) {
     if (!fight || fight.ended) return null;
          const turnStartResult = await carduse(0,"event","event","turnstart",null,fight,["turnstart"]);
     // 敌方能力：查找第一个可用（remaining === 0）的能力并使用
     if (Array.isArray(fight.enemyability) && fight.enemyability.length > 0) {
       for (let i = 0; i < fight.enemyability.length; i += 1) {
         const entry = fight.enemyability[i];
         const name = String(entry[0] ?? "").trim();
         const total = toInt(entry[1], 0);
         const remaining = Number(entry[2] ?? 0);
         if (name && remaining === 0) {
           const abilityCard = getFightCardData(name);
           if (abilityCard) {
             const mpCost = Number(abilityCard["MP"] ?? 0);
             if (!Number.isFinite(mpCost) || mpCost <= 0 || fight.enemy.MP >= mpCost) {
               if (Number.isFinite(mpCost) && mpCost > 0) {
                 fight.enemy.MP -= mpCost;
               }
               const effect = abilityCard ? abilityCard["效果"] : null;
               const type = abilityCard ? abilityCard["类型"] : null;
               const tagValue = abilityCard ? String(abilityCard["tag"] ?? "").trim() : "";
               await carduse(0,type,abilityCard,tagValue,name,fight,["ability"]);
               // set remaining cooldown to total
               entry[2] = Math.max(0, total);
               await new Promise(function (resolve) { setTimeout(resolve, 1000); });
               break; // 使用一次后退出循环（按原逻辑只用一次）
             }
           }
         }
       }
     }
     await fightenemyactioncard(fight);
     if (fight.enemy.MP < fight.enemy.MAXMP) {
     fight.enemy.MP = fight.enemy.MAXMP;
     }
     const turnEndResult = await carduse(0,"event","event","turnend",null,fight,["turnend"]);
     await moveSiteCardsToGrave(fight);
     // 敌方：所有能力剩余冷却减 1（如果有）
     if (Array.isArray(fight.enemyability) && fight.enemyability.length > 0) {
       for (let i = 0; i < fight.enemyability.length; i += 1) {
         const entry = fight.enemyability[i];
         if (Number.isFinite(entry[2]) && entry[2] > 0) {
           entry[2] = Math.max(0, entry[2] - 1);
         }
       }
     }
     const moreturnIdx = findMorereturnTag(fight, 0);
     if (moreturnIdx !== -1 && !fight.ended) {
       modifyTagCount(fight, 0, "额外回合", -1);
       fight.turn += 1;
       continue;
     }
     break;
   }
   if (fight && !fight.ended) {
     await drawEnemyCards(2);
     renderEnemyHand(fight);
   }
   return "end";
   }
  async function fightmain() {
    const fight = window.fight;

    if (!fight || fight.ended) {
      return;
    }
    const turnStartResult = await carduse(1,"event","event","turnstart",null,fight);
    fight.sideturn = "player" ;

    // 在玩家回合开始的 turnstart 事件完成后进行胜负判定（按你的要求）
    const outcomeAfterTurnstart = getFightOutcome(fight);
    if (outcomeAfterTurnstart === "win" || outcomeAfterTurnstart === "lost") {
      return finishFight(fight,outcomeAfterTurnstart);
    }
    /* 发卡 */
    if(fight.turn === 1){
    await drawPlayerCards(3);
    renderPlayerHand(fight);
    
    }

    /* 绑定玩家手牌点击。鼠标点击即视为使用。 */
    bindPlayerHandActions(fight);

    /* 敌人初始牌 */
    if(fight.turn === 1){
    await drawEnemyCards(3);
    renderEnemyHand(fight);
    }
    /*
      显示场上卡牌 */
    renderFightSite(fight);

    /* 更新双方 HP / MP 以及牌库 / 坟场数量。*/
    exposeBattleGlobals(fight);

    /* 玩家结束回合 */
    const endTurnButton = document.querySelector(".game-area .end-turn");

    if (endTurnButton) {
      endTurnButton.disabled = false;

      
          endTurnButton.onclick = async function () {
  if (!window.fight || window.fight !== fight || fight.ended || fight.carduseLocked) {
    return;
  }
  endTurnButton.disabled = true;
  const turnEndResult = await carduse(1,"event","event","turnend",null,fight);
  fight.sideturn = "enemy";
  await moveSiteCardsToGrave(fight);
  renderAbilityButton(fight,1);
  renderAbilityButton(fight,0);
  // 玩家能力：所有能力的剩余冷却减 1
  if (Array.isArray(fight.playerability) && fight.playerability.length > 0) {
    for (let i = 0; i < fight.playerability.length; i += 1) {
      const entry = fight.playerability[i];
      if (Number.isFinite(entry[2]) && entry[2] > 0) {
        entry[2] = Math.max(0, entry[2] - 1);
      }
    }
  }
  if (fight.player.MP < fight.player.MAXMP) {
    fight.player.MP = fight.player.MAXMP;
  }
  await drawPlayerCards(2);
  renderPlayerHand(fight);
   const moreturnIdx = findMorereturnTag(fight, 1);
   if (moreturnIdx !== -1) {
     modifyTagCount(fight, 1, "额外回合", -1);
     fight.turn += 1;
     const outcome = await fightmain();
     if (outcome === "win" || outcome === "lost") {
       finishFight(fight, outcome);
     }
     return;
   }
   const result = await fightenemyaction();
   if (result !== "end" && result !== "moreturn") {
     return;
   }
   if (result === "moreturn") {
     recycleGraves(fight);
     bindPlayerHandActions(fight);
     return;
   }
  
  recycleGraves(fight);
  fight.turn += 1;
  const outcome = await fightmain();
  if (outcome === "win" || outcome === "lost") {
    finishFight(fight,outcome);
  }
};
    }

    /*
      战斗结束判断。

      玩家 HP > 0
      且敌人 HP <= 0：
      胜利
    */
    if (fight.player.HP > 0 && fight.enemy.HP <= 0) {
      return "win";
    }

    /*
      玩家 HP <= 0：
      失败
    */
    if (fight.player.HP <= 0) {
      return "lost";
    }

    /*
      其他情况故意不 return。
    */
  }

  async function fightAPI(enemyId) {
    await loadTagsDatabase();
    cardpick = null;
    const fight = createBattleState(enemyId);
    
    /* 处理背包和装备 */
       window.fightplayerbag = Array.isArray(window.adventurebagitem) ? window.adventurebagitem.slice() : [];
       fight.fightplayerbag = window.fightplayerbag;
       window.fightplayerequip = Array.isArray(window.adventureequip) ? window.adventureequip.slice() : [];
       fight.fightplayerequip = window.fightplayerequip;

 // 敌人背包与装备置空
 window.fightenemybag = [];
 window.fightenemyequip = [];
    window.fight = fight;

 // 渲染战斗界面相关 UI（背包）
 renderFightBags();

    fight.turn = 1;
    fight.ended = false;

    exposeBattleGlobals(fight);
    renderAbilityButton(fight, 1);
    renderAbilityButton(fight, 0);
    return new Promise(
      function (resolve) {
        fight.resolve = resolve;

        fightmain().then(function (outcome) {
          if (outcome === "win" || outcome === "lost") {
            finishFight(fight,outcome);
          }
        });
      }
    );
  }

  /* 对外暴露 */
window.fightAPI = fightAPI;
window.fightmain = fightmain;
window.fightenemyaction = fightenemyaction;
window.fightenemyactioncard = fightenemyactioncard;
window.movetosite = movetosite;
window.movetoequip = movetoequip;
window.carduse = carduse;
window.cardeffect = cardeffect;
window.modifyTagCount = modifyTagCount;
window.getTagCount = getTagCount;
window.parseFightCard = parseFightCard;
window.createFightCardEntry = createFightCardEntry;
window.getFightCardData = getFightCardData;
window.effectruleAPI = effectruleAPI;
window.addcardtohand = addcardtohand;
window.movetograve = movetograve;
window.movetofightcards = movetofightcards;
window.drawPlayerCards = drawPlayerCards;
window.drawEnemyCards = drawEnemyCards;
})();