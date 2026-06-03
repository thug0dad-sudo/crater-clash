#!/bin/bash

set -e

echo "Creating backup..."

STAMP=$(date +%Y%m%d-%H%M%S)

mkdir -p backups/$STAMP
cp game.js backups/$STAMP/
cp multiplayer.js backups/$STAMP/
cp index.html backups/$STAMP/

echo "Patching game.js..."

cat >> game.js <<'JS'

/* Multiplayer Testing Layer */

function sendAimUpdate() {
  if (!window.Multiplayer?.isOnline) return;

  Multiplayer.sendMove({
    type: "aim",
    player: currentPlayer,
    angle: Number(angleSlider.value),
    power: Number(powerSlider.value),
    weapon: weaponSelect.value,
    ts: Date.now()
  });
}

angleSlider.addEventListener("input", sendAimUpdate);
powerSlider.addEventListener("input", sendAimUpdate);

weaponSelect.addEventListener("change", () => {
  sendAimUpdate();

  Multiplayer.sendMove({
    type: "weapon",
    player: currentPlayer,
    weapon: weaponSelect.value,
    ts: Date.now()
  });
});

const originalFire = fire;

fire = function(...args) {

  if (window.Multiplayer?.isOnline) {

    Multiplayer.sendMove({
      type: "fire",
      player: currentPlayer,
      angle: Number(angleSlider.value),
      power: Number(powerSlider.value),
      weapon: weaponSelect.value,
      ts: Date.now()
    });

  }

  return originalFire.apply(this,args);
};

window.receiveOnlineMove = function(move) {

  console.log("ONLINE MOVE", move);

  const status = document.getElementById("roomStatus");

  if (!status) return;

  switch(move.type) {

    case "aim":
      status.textContent =
        `P${move.player+1} aiming ${move.angle}° P:${move.power}`;
      break;

    case "weapon":
      status.textContent =
        `P${move.player+1} selected ${move.weapon}`;
      break;

    case "fire":
      status.textContent =
        `P${move.player+1} FIRED ${move.weapon}`;
      break;

    default:
      status.textContent =
        JSON.stringify(move);
  }
};

JS

echo ""
echo "Patch complete."
echo ""
echo "Open two browsers."
echo "Create room in one."
echo "Join room in another."
echo ""
echo "Move sliders and fire."
echo "Room status should update live."
