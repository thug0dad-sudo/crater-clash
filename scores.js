async function scoreHash(gamertag, pin) {
  const msg = `${gamertag.trim().toLowerCase()}:${pin}`;
  const data = new TextEncoder().encode(msg);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function cleanScoreName(raw) {
  return String(raw || "")
    .trim()
    .replace(/[^a-zA-Z0-9 _-]/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 16);
}

function cleanPin(raw) {
  return String(raw || "").replace(/[^0-9]/g, "").slice(0, 8);
}

let currentScoreProfile = null;
let savedGameIds = new Set(JSON.parse(localStorage.getItem("cc_saved_game_ids") || "[]"));

function setProfileStatus(text) {
  const el = document.getElementById("profileStatus");
  if (el) el.textContent = text;
}

function currentGameId() {
  return window.Multiplayer?.roomId
    ? `room:${window.Multiplayer.roomId}`
    : `local:${Date.now()}`;
}

async function ensureProfile() {
  if (currentScoreProfile) return currentScoreProfile;

  const nameInput = document.getElementById("scoreGamertagInput");
  const pinInput = document.getElementById("scorePinInput");

  let gamertag = cleanScoreName(
    nameInput?.value ||
    localStorage.getItem("cc_score_gamertag") ||
    localStorage.getItem("cc_gamertag") ||
    window.Multiplayer?.gamertag ||
    ""
  );

  if (!gamertag) {
    gamertag = cleanScoreName(prompt("Enter your gamertag to save your score:") || "");
  }

  let pin = cleanPin(pinInput?.value || localStorage.getItem("cc_score_pin") || "");

  if (pin.length < 4) {
    pin = cleanPin(prompt(`Enter a 4–8 digit PIN for ${gamertag}:`) || "");
  }

  if (!gamertag || pin.length < 4) {
    setProfileStatus("Score not saved: gamertag and 4–8 digit PIN required.");
    return null;
  }

  if (nameInput) nameInput.value = gamertag;
  if (pinInput) pinInput.value = pin;

  localStorage.setItem("cc_score_gamertag", gamertag);
  localStorage.setItem("cc_score_pin", pin);

  return loadProfile();
}

async function loadProfile() {
  const nameInput = document.getElementById("scoreGamertagInput");
  const pinInput = document.getElementById("scorePinInput");

  const gamertag = cleanScoreName(nameInput?.value);
  const pin = cleanPin(pinInput?.value);

  if (nameInput) nameInput.value = gamertag;
  if (pinInput) pinInput.value = pin;

  if (!gamertag || pin.length < 4) {
    setProfileStatus("Enter a gamertag and 4–8 digit PIN.");
    return null;
  }

  const pin_hash = await scoreHash(gamertag, pin);

  let { data, error } = await supabaseClient
    .from("scores")
    .select("*")
    .eq("gamertag", gamertag)
    .eq("pin_hash", pin_hash)
    .maybeSingle();

  if (error) {
    console.error(error);
    setProfileStatus("Profile load failed.");
    return null;
  }

  if (!data) {
    const inserted = await supabaseClient
      .from("scores")
      .insert({ gamertag, pin_hash, wins: 0, losses: 0, games_played: 0 })
      .select("*")
      .single();

    if (inserted.error) {
      console.error(inserted.error);
      setProfileStatus("Profile create failed.");
      return null;
    }

    data = inserted.data;
  }

  currentScoreProfile = data;
  localStorage.setItem("cc_score_gamertag", gamertag);
  localStorage.setItem("cc_score_pin", pin);

  setProfileStatus(`${gamertag}: ${data.wins}W / ${data.losses}L`);
  await loadScoreboard();
  return currentScoreProfile;
}

async function saveResult(result, gameId = currentGameId()) {
  if (savedGameIds.has(gameId)) {
    setProfileStatus("Score already saved for this game.");
    return false;
  }

  const profile = await ensureProfile();
  if (!profile) return false;

  const wins = profile.wins + (result === "win" ? 1 : 0);
  const losses = profile.losses + (result === "loss" ? 1 : 0);
  const games_played = profile.games_played + 1;

  const { data, error } = await supabaseClient
    .from("scores")
    .update({
      wins,
      losses,
      games_played,
      updated_at: new Date().toISOString()
    })
    .eq("id", profile.id)
    .select("*")
    .single();

  if (error) {
    console.error(error);
    setProfileStatus("Score save failed.");
    return false;
  }

  currentScoreProfile = data;
  savedGameIds.add(gameId);
  localStorage.setItem("cc_saved_game_ids", JSON.stringify([...savedGameIds].slice(-50)));

  setProfileStatus(`Saved win for ${data.gamertag}: ${data.wins}W / ${data.losses}L`);
  await loadScoreboard();
  updateSaveWinButton();
  return true;
}

async function loadScoreboard() {
  const board = document.getElementById("scoreboard");
  if (!board) return;

  const { data, error } = await supabaseClient
    .from("scores")
    .select("gamertag,wins,losses,games_played")
    .order("wins", { ascending: false })
    .order("games_played", { ascending: true })
    .limit(10);

  if (error) {
    console.error(error);
    board.textContent = "Could not load scoreboard.";
    return;
  }

  board.innerHTML =
    "<strong>Top Scores</strong>" +
    (data || []).map((row, i) =>
      `<div>${i + 1}. ${row.gamertag}: ${row.wins}W / ${row.losses}L</div>`
    ).join("");
}

function updateSaveWinButton() {
  const btn = document.getElementById("saveWinBtn");
  if (!btn) return;
  const gid = currentGameId();
  btn.disabled = savedGameIds.has(gid);
  btn.textContent = savedGameIds.has(gid) ? "Win Saved" : "Save Win";
}

window.Scores = {
  loadProfile,
  saveResult,
  loadScoreboard,
  ensureProfile,
  updateSaveWinButton
};

window.addEventListener("DOMContentLoaded", () => {
  const name = localStorage.getItem("cc_score_gamertag") || localStorage.getItem("cc_gamertag") || "";
  const pin = localStorage.getItem("cc_score_pin") || "";

  const nameInput = document.getElementById("scoreGamertagInput");
  const pinInput = document.getElementById("scorePinInput");

  if (nameInput) nameInput.value = name;
  if (pinInput) pinInput.value = pin;

  nameInput?.addEventListener("input", () => {
    nameInput.value = cleanScoreName(nameInput.value);
  });

  pinInput?.addEventListener("input", () => {
    pinInput.value = cleanPin(pinInput.value);
  });

  document.getElementById("loadProfileBtn")?.addEventListener("click", loadProfile);

  const saveBtn = document.getElementById("saveWinBtn");
  saveBtn?.addEventListener("click", () => saveResult("win"));

  loadScoreboard();
  updateSaveWinButton();
});
