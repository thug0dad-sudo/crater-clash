#!/bin/bash
set -e

echo "== Crater Clash: multiplayer projectile replay patch =="

STAMP=$(date +%Y%m%d-%H%M%S)
mkdir -p "backups/$STAMP"

for f in index.html game.js multiplayer.js sounds.js; do
  if [ -f "$f" ]; then
    cp "$f" "backups/$STAMP/$f"
  fi
done

echo "Backups saved to backups/$STAMP"

if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  CURRENT_BRANCH=$(git branch --show-current)
  if [ "$CURRENT_BRANCH" != "multiplayer-projectile-replay" ]; then
    git checkout -B multiplayer-projectile-replay
  fi
fi

python3 <<'PY'
from pathlib import Path

gpath = Path("game.js")
g = gpath.read_text()

guard = r"""
/* Multiplayer projectile replay state */
let onlineReplayInProgress = false;
let onlineSuppressNextFireSend = false;
let onlineLastFireSentAt = 0;
"""
if "let onlineReplayInProgress = false;" not in g:
    marker = "let lastShotWeapon = weapons[1];"
    g = g.replace(marker, marker + guard)

old_fire = """function fire(customWeapon = null) {
  if (projectiles.length || gameOver) return;
  SFX?.play('launch');
  SFX?.flight();"""

new_fire = """function fire(customWeapon = null) {
  if (projectiles.length || gameOver) return;

  if (window.Multiplayer?.isOnline && !onlineSuppressNextFireSend) {
    if (typeof isMyOnlineTurn === "function" && !isMyOnlineTurn()) {
      message = "Not your turn.";
      updateUI();
      draw();
      return;
    }

    const now = Date.now();
    if (now - onlineLastFireSentAt > 400) {
      onlineLastFireSentAt = now;
      window.Multiplayer.sendMove({
        type: "fire",
        player: currentPlayer,
        angle: Number(angleSlider.value),
        power: Number(powerSlider.value),
        weapon: weaponSelect.value,
        wind,
        ts: now
      });
    }
  }

  onlineSuppressNextFireSend = false;
  SFX?.play('launch');
  SFX?.flight();"""

fire_start = g.find("function fire(customWeapon = null)")
fire_end = g.find("function carveCrater")
fire_block = g[fire_start:fire_end] if fire_start != -1 and fire_end != -1 else ""

if old_fire in g and "onlineLastFireSentAt" not in fire_block:
    g = g.replace(old_fire, new_fire)
elif "onlineLastFireSentAt" in fire_block:
    print("fire() already appears patched.")
else:
    print("WARNING: fire() did not match expected shape. Manual check may be needed.")

old_sync = """if (window.Multiplayer?.isOnline && before !== after && projectiles.length === 0) {
    saveOnlineSnapshotAfterTurn();
  }"""
new_sync = """if (window.Multiplayer?.isOnline && before !== after && projectiles.length === 0) {
    if (!onlineReplayInProgress) saveOnlineSnapshotAfterTurn();
    else onlineReplayInProgress = false;
  }"""

if old_sync in g:
    g = g.replace(old_sync, new_sync)
else:
    print("NOTE: Did not find exact finishTurn sync block. Continuing.")

replay_block = r"""

/* Multiplayer projectile replay handler */
function replayOnlineFireMove(move) {
  if (!move || move.type !== "fire") return false;
  if (!window.Multiplayer?.isOnline) return false;

  // Ignore our own echoed fire events.
  if (move.player === window.Multiplayer.playerIndex) return true;

  if (projectiles.length || gameOver) {
    setTimeout(() => replayOnlineFireMove(move), 250);
    return true;
  }

  onlineReplayInProgress = true;
  onlineSuppressNextFireSend = true;

  currentPlayer = move.player;
  if (typeof move.wind === "number") wind = move.wind;
  if (Number.isFinite(move.angle)) angleSlider.value = String(move.angle);
  if (Number.isFinite(move.power)) powerSlider.value = String(move.power);
  if (move.weapon) weaponSelect.value = move.weapon;

  message = `${move.tag || "Opponent"} fired ${move.weapon || "weapon"}`;
  updateUI();
  draw();

  setTimeout(() => {
    fire(selectedWeapon());
  }, 350);

  return true;
}

const previousReceiveOnlineMoveForReplay = window.receiveOnlineMove;
window.receiveOnlineMove = function(move) {
  if (replayOnlineFireMove(move)) return;
  previousReceiveOnlineMoveForReplay?.(move);
};
"""

if "function replayOnlineFireMove(move)" not in g:
    g += replay_block

gpath.write_text(g)
PY

echo ""
echo "Patch applied."
echo ""
echo "Test locally:"
echo "  python3 -m http.server 3000"
echo ""
echo "Open two windows, create/join a room, then fire from Player 1."
echo "The remote browser should show the projectile flying before the turn hands off."
echo ""
echo "If it works:"
echo "  git add ."
echo "  git commit -m \"Add multiplayer projectile replay\""
echo "  git push --set-upstream origin multiplayer-projectile-replay"
echo ""
echo "To restore from backup:"
echo "  cp backups/$STAMP/game.js game.js"
echo "  cp backups/$STAMP/multiplayer.js multiplayer.js"
echo "  cp backups/$STAMP/index.html index.html"
