(function () {
"use strict";

const CHARACTER_KEY = "TH_CARD_CHARACTER";

function hasSave() {
const saved = localStorage.getItem(CHARACTER_KEY);
if (!saved) return false;


try {
  const data = JSON.parse(saved);
  return (data !== null && typeof data === "object" && !Array.isArray(data) && typeof data.name === "string" && data.name.trim() !== "");
} catch (error) {
  return false;
}


}

function setScene(scene) {
const menu = document.getElementById("main-menu");
const characterSelect = document.getElementById("character-select");
const adventure = document.getElementById("adventure");
const gameArea = document.querySelector(".game-area");


if (menu) {
  menu.classList.toggle("is-hidden", scene !== "menu");
}

if (characterSelect) {
  const active = scene === "character";
  characterSelect.classList.toggle("is-hidden", !active);
  characterSelect.setAttribute("aria-hidden", active ? "false" : "true");
}

if (adventure) {
  const active = scene === "adventure";
  adventure.classList.toggle("is-active", active);
  adventure.classList.toggle("is-hidden", !active);
  adventure.setAttribute("aria-hidden", active ? "false" : "true");
}

if (gameArea) {
  const active = scene === "fight";
  gameArea.classList.toggle("is-active", active);
  gameArea.setAttribute("aria-hidden", active ? "false" : "true");
}


}

function achievement() {
return true;
}

window.achievement = achievement;

function updateContinueButton() {
const button = document.getElementById("main-menu-continue");
if (!button) return;


if (hasSave()) {
  button.disabled = false;
  button.hidden = false;
} else {
  button.disabled = true;
  button.hidden = true;
}


}

function startGame() {
window.startingNewGame = true;
setScene("character");
document.dispatchEvent(new Event("th-card:start-new-game"));
}



function continueGame() {
if (!hasSave()) return;


setScene("adventure");

if (
  window.adventureGame &&
  typeof window.adventureGame.activate === "function"
) {
  window.adventureGame.activate();
}


}

document.addEventListener("th-card:character-selected", function () {
setScene("adventure");
});

function bind() {
const continueButton = document.getElementById("main-menu-continue");
const startButton = document.getElementById("main-menu-start");
const achievementButton = document.getElementById("main-menu-achievement");


if (continueButton) {
  continueButton.addEventListener("click", continueGame);
}

if (startButton) {
  startButton.addEventListener("click", startGame);
}

if (achievementButton) {
  achievementButton.addEventListener("click", achievement);
}

updateContinueButton();
setScene("menu");


}

document.addEventListener("DOMContentLoaded", bind);
})();
