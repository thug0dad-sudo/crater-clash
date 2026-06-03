#!/bin/bash
set -e

echo "== Restore stable turn handoff checkpoint, then add local replay patch =="

STAMP=$(date +%Y%m%d-%H%M%S)
mkdir -p "backups/$STAMP"

cp index.html game.js multiplayer.js sounds.js "backups/$STAMP/" 2>/dev/null || true
echo "Backup saved to backups/$STAMP"

echo "Restoring stable checkpoint files..."
git checkout stable-github-pages-multiplayer-turn-handoff -- index.html game.js multiplayer.js sounds.js

cat > multiplayer.js <<'JS'
const SUPABASE_URL = "https://hzvyklzmsndyoajmhbxb.supabase.co";
const SUPABASE_KEY = "sb_publishable_lJjQiFns48hCoyH44SKyKA_YbqpPxht";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let roomId = new URLSearchParams(location.search).get("room") || "";
let onlineRole = "offline";
let onlinePlayerIndex = null;
let myGamertag = localStorage.getItem("cc_gamertag") || "";
let lastSeenMoveId = null;

function cleanGamertag(raw) {
  return String(raw || "")
    .trim()
    .replace(/[^a-zA-Z0-9 _-]/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 16) || "Player";
}

function makeRoomId() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function setRoomStatus(text) {
  const el = document.getElementById("roomStatus");
  if (el) el.textContent = text;
}

function getGamertag() {
  const input = document.getElementById("gamertagInput");
  myGamertag = cleanGamertag(input?.value || myGamertag || "Player");
  localStorage.setItem("cc_gamertag", myGamertag);
  if (input) input.value = myGamertag;
  return myGamertag;
}

async function createRoom() {
  roomId = makeRoomId();
  onlineRole = "host";
  onlinePlayerIndex = 0;

  const tag = getGamertag();
  const initial = window.exportOnlineState?.() || {};

  const { error } = await supabaseClient.from("games").insert({
    id: roomId,
    state: {
      hostReady: true,
      turn: 0,
      players: [{ index: 0, tag }, null],
      move: null,
      snapshot: initial
    }
  });

  if (error) {
    console.error(error);
    alert("Create room failed: " + error.message);
    return;
  }

  history.replaceState(null, "", "?room=" + roomId);
  subscribeRoom();
  setRoomStatus(`Room ${roomId} — ${tag} is Player 1`);
}

async function joinRoom(code) {
  roomId = code.trim().toUpperCase();
  if (!roomId) return;

  const tag = getGamertag();

  const { data, error } = await supabaseClient
    .from("games")
    .select("state")
    .eq("id", roomId)
    .single();

  if (error) {
    console.error(error);
    alert("Join failed: " + error.message);
    return;
  }

  const state = data?.state || {};
  const players = state.players || [null, null];

  if (!players[0]) {
    onlineRole = "host";
    onlinePlayerIndex = 0;
    players[0] = { index: 0, tag };
  } else if (!players[1]) {
    onlineRole = "guest";
    onlinePlayerIndex = 1;
    players[1] = { index: 1, tag };
  } else {
    onlineRole = "spectator";
    onlinePlayerIndex = null;
    alert("Room already has two players. Joining as spectator.");
  }

  const nextState = { ...state, players };

  await supabaseClient
    .from("games")
    .update({
      state: nextState,
      updated_at: new Date().toISOString()
    })
    .eq("id", roomId);

  if (state.snapshot && window.loadOnlineState) {
    window.loadOnlineState(state.snapshot);
  }

  history.replaceState(null, "", "?room=" + roomId);
  subscribeRoom();

  if (onlinePlayerIndex === 0) setRoomStatus(`Room ${roomId} — ${tag} is Player 1`);
  else if (onlinePlayerIndex === 1) setRoomStatus(`Room ${roomId} — ${tag} is Player 2`);
  else setRoomStatus(`Room ${roomId} — Spectating`);
}

async function sendMove(move) {
  if (!roomId || onlineRole === "offline") return;

  const taggedMove = {
    ...move,
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    player: onlinePlayerIndex,
    tag: myGamertag,
    ts: Date.now()
  };

  const { data } = await supabaseClient
    .from("games")
    .select("state")
    .eq("id", roomId)
    .single();

  const oldState = data?.state || {};
  const nextTurn = (oldState.turn || 0) + 1;

  const isFire = taggedMove.type === "fire";

  await supabaseClient.from("games").update({
    state: {
      ...oldState,
      turn: nextTurn,
      move: taggedMove,

      // Critical: do NOT push a snapshot on fire.
      // The remote side needs to animate the shot first.
      snapshot: isFire ? oldState.snapshot : (window.exportOnlineState?.() || oldState.snapshot)
    },
    updated_at: new Date().toISOString()
  }).eq("id", roomId);
}

function subscribeRoom() {
  supabaseClient
    .channel("room-" + roomId)
    .on("postgres_changes", {
      event: "UPDATE",
      schema: "public",
      table: "games",
      filter: "id=eq." + roomId
    }, payload => {
      const state = payload.new?.state;
      if (!state) return;

      if (state.players) {
        const p1 = state.players[0]?.tag || "Waiting";
        const p2 = state.players[1]?.tag || "Waiting";
        setRoomStatus(`Room ${roomId} — P1: ${p1} | P2: ${p2}`);
      }

      const move = state.move;
      if (move?.id && move.id !== lastSeenMoveId) {
        lastSeenMoveId = move.id;

        // Critical: fire moves are replayed, not snapshot-loaded.
        if (window.receiveOnlineMove) {
          window.receiveOnlineMove(move);
        }

        if (move.type === "fire") return;
      }

      if (state.snapshot && window.loadOnlineState) {
        window.loadOnlineState(state.snapshot);
      }
    })
    .subscribe();
}

window.Multiplayer = {
  createRoom,
  joinRoom,
  sendMove,
  cleanGamertag,
  get roomId() { return roomId; },
  get role() { return onlineRole; },
  get playerIndex() { return onlinePlayerIndex; },
  get gamertag() { return myGamertag; },
  get isOnline() { return onlineRole !== "offline"; }
};
JS

cat >> game.js <<'JS'

/* Local-only clean projectile replay patch */
window.__ccReplayingRemoteShot = false;

const previousIsMyOnlineTurnForReplay = typeof isMyOnlineTurn === "function" ? isMyOnlineTurn : null;
if (previousIsMyOnlineTurnForReplay) {
  isMyOnlineTurn = function() {
    if (window.__ccReplayingRemoteShot) return true;
    return previousIsMyOnlineTurnForReplay();
  };
}

const previousSendMoveForReplay = window.Multiplayer?.sendMove;
window.addEventListener("DOMContentLoaded", () => {
  if (window.Multiplayer && !window.Multiplayer.__replaySendWrapped) {
    const originalSendMove = window.Multiplayer.sendMove.bind(window.Multiplayer);
    window.Multiplayer.sendMove = function(move) {
      if (window.__ccReplayingRemoteShot && move?.type === "fire") {
        return Promise.resolve();
      }
      return originalSendMove(move);
    };
    window.Multiplayer.__replaySendWrapped = true;
  }
});

function replayRemoteFireMove(move) {
  if (!move || move.type !== "fire") return false;
  if (!window.Multiplayer?.isOnline) return false;

  // Ignore our own echo.
  if (move.player === window.Multiplayer.playerIndex) return true;

  const status = document.getElementById("roomStatus");
  if (status) status.textContent = `${move.tag || "Opponent"} is firing...`;

  const tryReplay = () => {
    if (projectiles.length || gameOver) {
      setTimeout(tryReplay, 200);
      return;
    }

    window.__ccReplayingRemoteShot = true;

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

      // Keep replay mode long enough for fire wrappers to finish,
      // then allow normal turn controls/sync after projectile resolves.
      setTimeout(() => {
        window.__ccReplayingRemoteShot = false;
        updateOnlineTurnControls?.();
      }, 500);
    }, 350);
  };

  tryReplay();
  return true;
}

const previousReceiveOnlineMoveCleanReplay = window.receiveOnlineMove;
window.receiveOnlineMove = function(move) {
  if (replayRemoteFireMove(move)) return;
  previousReceiveOnlineMoveCleanReplay?.(move);
};
JS

echo ""
echo "Patch applied locally."
echo ""
echo "Test:"
echo "  python3 -m http.server 3000"
echo ""
echo "Open two windows, create/join a room, fire from P1, and confirm P2 sees the projectile fly."
echo ""
echo "No GitHub push was performed."
