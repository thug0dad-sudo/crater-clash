#!/bin/bash
set -e

STAMP=$(date +%Y%m%d-%H%M%S)
mkdir -p backups/$STAMP
cp game.js multiplayer.js backups/$STAMP/

cat >> game.js <<'JS'

/* Fix online turn sync after projectile resolves */
function saveOnlineSnapshotAfterTurn() {
  if (!window.Multiplayer?.isOnline) return;
  setTimeout(() => {
    window.Multiplayer?.sendMove({
      type: "state-sync",
      player: window.Multiplayer.playerIndex,
      currentPlayer,
      message,
      ts: Date.now()
    });
  }, 50);
}

const originalFinishTurnIfReadyOnlineSync = finishTurnIfReady;
finishTurnIfReady = function(...args) {
  const before = currentPlayer;
  const result = originalFinishTurnIfReadyOnlineSync.apply(this, args);
  const after = currentPlayer;

  if (window.Multiplayer?.isOnline && before !== after && projectiles.length === 0) {
    saveOnlineSnapshotAfterTurn();
  }

  updateOnlineTurnControls?.();
  return result;
};

const previousReceiveOnlineMoveForTurnSync = window.receiveOnlineMove;
window.receiveOnlineMove = function(move) {
  previousReceiveOnlineMoveForTurnSync?.(move);

  if (move?.type === "state-sync" && Number.isInteger(move.currentPlayer)) {
    currentPlayer = move.currentPlayer;
    message = move.message || message;
    updateUI();
    draw();
    updateOnlineTurnControls?.();
  }
};
JS

echo "Turn sync fix applied."
echo "Backups saved to backups/$STAMP"
