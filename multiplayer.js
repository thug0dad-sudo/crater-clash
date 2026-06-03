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

  if (taggedMove.type === "fire" && !Number.isFinite(taggedMove.seed)) {
    taggedMove.seed = Math.floor(Math.random() * 0xFFFFFFFF);
  }

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
        window.__ccMatchStarted = !!state.matchStarted;
        if (typeof renderLobby === "function") renderLobby(state.players, !!state.matchStarted);
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

/* Lobby system */
async function updateRoomState(mutator) {
  if (!roomId) return;

  const { data, error } = await supabaseClient
    .from("games")
    .select("state")
    .eq("id", roomId)
    .single();

  if (error) {
    console.error(error);
    return;
  }

  const oldState = data?.state || {};
  const nextState = mutator(oldState) || oldState;

  await supabaseClient
    .from("games")
    .update({
      state: nextState,
      updated_at: new Date().toISOString()
    })
    .eq("id", roomId);
}

async function setReady(ready = true) {
  if (!roomId || onlinePlayerIndex === null) return;

  await updateRoomState(state => {
    const players = state.players || [null, null];
    players[onlinePlayerIndex] = {
      ...(players[onlinePlayerIndex] || {}),
      index: onlinePlayerIndex,
      tag: myGamertag || `Player ${onlinePlayerIndex + 1}`,
      ready
    };

    return {
      ...state,
      players,
      matchStarted: !!state.matchStarted
    };
  });
}

async function startMatch() {
  if (!roomId || onlinePlayerIndex !== 0) {
    alert("Only Player 1 can start the match.");
    return;
  }

  await updateRoomState(state => {
    const players = state.players || [null, null];
    const bothReady = players[0]?.ready && players[1]?.ready;

    if (!bothReady) {
      alert("Both players must be ready.");
      return state;
    }

    return {
      ...state,
      matchStarted: true,
      snapshot: window.exportOnlineState?.() || state.snapshot
    };
  });
}

function renderLobby(players = [], matchStarted = false) {
  const lobby = document.getElementById("lobbyPlayers");
  const readyBtn = document.getElementById("readyBtn");
  const startBtn = document.getElementById("startMatchBtn");

  if (!lobby) return;

  const p1 = players[0];
  const p2 = players[1];

  lobby.innerHTML = `
    <div>P1: ${p1?.tag || "Waiting"} ${p1?.ready ? "✓ Ready" : ""}</div>
    <div>P2: ${p2?.tag || "Waiting"} ${p2?.ready ? "✓ Ready" : ""}</div>
    <div>Status: ${matchStarted ? "Match started" : "Waiting in lobby"}</div>
  `;

  if (readyBtn) readyBtn.disabled = !roomId || onlinePlayerIndex === null || matchStarted;
  if (startBtn) startBtn.disabled = onlinePlayerIndex !== 0 || matchStarted;
}

const oldSubscribeRoomForLobby = subscribeRoom;
subscribeRoom = function() {
  oldSubscribeRoomForLobby();

  setTimeout(async () => {
    const { data } = await supabaseClient
      .from("games")
      .select("state")
      .eq("id", roomId)
      .single();

    const state = data?.state || {};
    renderLobby(state.players || [], !!state.matchStarted);
    window.__ccMatchStarted = !!state.matchStarted;
  }, 500);
};

const oldSetRoomStatusForLobby = setRoomStatus;
setRoomStatus = function(text) {
  oldSetRoomStatusForLobby(text);
};

window.addEventListener("DOMContentLoaded", () => {
  document.getElementById("readyBtn")?.addEventListener("click", () => {
    setReady(true);
  });

  document.getElementById("startMatchBtn")?.addEventListener("click", () => {
    startMatch();
  });
});

const oldMultiplayerObject = window.Multiplayer;
Object.assign(window.Multiplayer, {
  setReady,
  startMatch,
  renderLobby
});

/* Share room links */
function getRoomLink() {
  if (!roomId) return location.origin + location.pathname;
  return location.origin + location.pathname + "?room=" + encodeURIComponent(roomId);
}

async function shareRoom() {
  if (!roomId) {
    alert("Create or join a room first.");
    return;
  }

  const url = getRoomLink();
  const text = `Join my Crater Clash room: ${roomId}`;

  if (navigator.share) {
    await navigator.share({ title: "Crater Clash", text, url });
  } else {
    await navigator.clipboard.writeText(`${text}\n${url}`);
    alert("Room link copied to clipboard.");
  }
}

window.addEventListener("DOMContentLoaded", () => {
  document.getElementById("shareRoomBtn")?.addEventListener("click", shareRoom);
});

Object.assign(window.Multiplayer, {
  getRoomLink,
  shareRoom
});

/* Restored lobby controls */
async function updateRoomState(mutator) {
  if (!roomId) return;
  const { data } = await supabaseClient.from("games").select("state").eq("id", roomId).single();
  const oldState = data?.state || {};
  const nextState = mutator(oldState) || oldState;
  await supabaseClient.from("games").update({
    state: nextState,
    updated_at: new Date().toISOString()
  }).eq("id", roomId);
}

async function setReady(ready = true) {
  if (!roomId || onlinePlayerIndex === null) return;
  await updateRoomState(state => {
    const players = state.players || [null, null];
    players[onlinePlayerIndex] = {
      ...(players[onlinePlayerIndex] || {}),
      index: onlinePlayerIndex,
      tag: myGamertag || `Player ${onlinePlayerIndex + 1}`,
      ready
    };
    return { ...state, players, matchStarted: !!state.matchStarted };
  });
}

async function startMatch() {
  if (onlinePlayerIndex !== 0) return alert("Only Player 1 can start the match.");
  await updateRoomState(state => {
    const players = state.players || [null, null];
    if (!(players[0]?.ready && players[1]?.ready)) {
      alert("Both players must be ready.");
      return state;
    }
    return { ...state, matchStarted: true, snapshot: window.exportOnlineState?.() || state.snapshot };
  });
}

function renderLobby(players = [], matchStarted = false) {
  const el = document.getElementById("lobbyPlayers");
  if (!el) return;
  el.innerHTML = `
    <div>P1: ${players[0]?.tag || "Waiting"} ${players[0]?.ready ? "✓ Ready" : ""}</div>
    <div>P2: ${players[1]?.tag || "Waiting"} ${players[1]?.ready ? "✓ Ready" : ""}</div>
    <div>Status: ${matchStarted ? "Match started" : "Waiting in lobby"}</div>
  `;
  const readyBtn = document.getElementById("readyBtn");
  const startBtn = document.getElementById("startMatchBtn");
  if (readyBtn) readyBtn.disabled = !roomId || onlinePlayerIndex === null || matchStarted;
  if (startBtn) startBtn.disabled = onlinePlayerIndex !== 0 || matchStarted;
}

window.addEventListener("DOMContentLoaded", () => {
  document.getElementById("readyBtn")?.addEventListener("click", () => setReady(true));
  document.getElementById("startMatchBtn")?.addEventListener("click", startMatch);
});

Object.assign(window.Multiplayer, { setReady, startMatch, renderLobby });
