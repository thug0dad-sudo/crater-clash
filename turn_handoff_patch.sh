#!/bin/bash
set -e

STAMP=$(date +%Y%m%d-%H%M%S)
mkdir -p backups/$STAMP
cp game.js multiplayer.js index.html backups/$STAMP/

cat >> game.js <<'JS'

/* Online turn handoff patch */
function isMyOnlineTurn() {
  if (!window.Multiplayer?.isOnline) return true;
  if (window.Multiplayer.role === "spectator") return false;
  return currentPlayer === window.Multiplayer.playerIndex;
}

function updateOnlineTurnControls() {
  const online = window.Multiplayer?.isOnline;
  const mine = isMyOnlineTurn();

  fireBtn.disabled = online && !mine;
  angleSlider.disabled = online && !mine;
  powerSlider.disabled = online && !mine;
  weaponSelect.disabled = online && !mine;

  const status = document.getElementById("roomStatus");
  if (status && online) {
    const playerName = window.Multiplayer.gamertag || `Player ${window.Multiplayer.playerIndex + 1}`;
    const turnName = currentPlayer === 0 ? "Player 1" : "Player 2";
    status.textContent = mine
      ? `Room ${window.Multiplayer.roomId} — ${playerName}, your turn`
      : `Room ${window.Multiplayer.roomId} — waiting for ${turnName}`;
  }
}

const originalUpdateUIForOnlineTurns = updateUI;
updateUI = function(...args) {
  const result = originalUpdateUIForOnlineTurns.apply(this, args);
  updateOnlineTurnControls();
  return result;
};

const originalFireForOnlineTurns = fire;
fire = function(...args) {
  if (window.Multiplayer?.isOnline && !isMyOnlineTurn()) {
    message = "Not your turn.";
    updateUI();
    draw();
    return;
  }

  return originalFireForOnlineTurns.apply(this, args);
};

const originalLoadOnlineStateForTurns = window.loadOnlineState;
window.loadOnlineState = function(state) {
  originalLoadOnlineStateForTurns?.(state);
  updateOnlineTurnControls();
};

window.addEventListener("DOMContentLoaded", () => {
  setTimeout(updateOnlineTurnControls, 250);
});
JS

echo "Turn handoff patch applied."
echo "Backups saved to backups/$STAMP"
