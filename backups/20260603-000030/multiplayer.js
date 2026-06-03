const SUPABASE_URL = "https://hzvyklzmsndyoajmhbxb.supabase.co";
const SUPABASE_KEY = "sb_publishable_lJjQiFns48hCoyH44SKyKA_YbqpPxht";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let roomId = new URLSearchParams(location.search).get("room") || "";
let onlineRole = "offline";
let onlinePlayerIndex = null;
let myGamertag = localStorage.getItem("cc_gamertag") || "";

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
      players: [
        { index: 0, tag },
        null
      ],
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

  await supabaseClient.from("games").update({
    state: {
      ...oldState,
      turn: nextTurn,
      move: taggedMove,
      snapshot: window.exportOnlineState?.() || oldState.snapshot
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

      if (state.snapshot && window.loadOnlineState) {
        window.loadOnlineState(state.snapshot);
      }

      if (state.move && window.receiveOnlineMove) {
        window.receiveOnlineMove(state.move);
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
