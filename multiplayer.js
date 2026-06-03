const SUPABASE_URL = "https://hzvyklzmsndyoajmhbxb.supabase.co";
const SUPABASE_KEY = "sb_publishable_lJjQiFns48hCoyH44SKyKA_YbqpPxht";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let roomId = new URLSearchParams(location.search).get("room") || "";
let onlineRole = "offline";

function makeRoomId() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function setRoomStatus(text) {
  const el = document.getElementById("roomStatus");
  if (el) el.textContent = text;
}

async function createRoom() {
  roomId = makeRoomId();
  onlineRole = "host";

  const initial = window.exportOnlineState?.() || {};
  const { error } = await supabaseClient.from("games").insert({
    id: roomId,
    state: {
      hostReady: true,
      turn: 0,
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
  setRoomStatus("Host room: " + roomId);
}

async function joinRoom(code) {
  roomId = code.trim().toUpperCase();
  if (!roomId) return;

  onlineRole = "guest";
  history.replaceState(null, "", "?room=" + roomId);

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

  if (data?.state?.snapshot && window.loadOnlineState) {
    window.loadOnlineState(data.state.snapshot);
  }

  subscribeRoom();
  setRoomStatus("Joined room: " + roomId);
}

async function sendMove(move) {
  if (!roomId || onlineRole === "offline") return;

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
      move,
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
  get roomId() { return roomId; },
  get role() { return onlineRole; },
  get isOnline() { return onlineRole !== "offline"; }
};
