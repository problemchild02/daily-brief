const STORAGE_PREFIX = "dailybrief:";

function storageAvailable() {
  try {
    const key = "__dailybrief_test__";
    localStorage.setItem(key, "1");
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

const canUseStorage = storageAvailable();

function storageGet(key) {
  if (!canUseStorage) return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key, value) {
  if (!canUseStorage) return;
  try {
    localStorage.setItem(key, value);
  } catch {}
}

function storageRemove(key) {
  if (!canUseStorage) return;
  try {
    localStorage.removeItem(key);
  } catch {}
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  storageSet(STORAGE_PREFIX + "theme", theme);

  const themeBtn = document.getElementById("btn-theme");
  if (themeBtn) {
    const nextTheme = theme === "light" ? "dark" : "light";
    themeBtn.setAttribute("aria-label", `Switch to ${nextTheme} theme`);
    themeBtn.setAttribute("title", `Switch to ${nextTheme} theme`);
  }
}

function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme") || "light";
  applyTheme(current === "light" ? "dark" : "light");
}

function restoreTheme() {
  const saved = storageGet(STORAGE_PREFIX + "theme");
  if (saved === "light" || saved === "dark") {
    applyTheme(saved);
    return;
  }

  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  applyTheme(prefersDark ? "dark" : "light");
}

function getTabs() {
  return Array.from(document.querySelectorAll('[role="tab"]'));
}

function getPanels() {
  return Array.from(document.querySelectorAll('[role="tabpanel"]'));
}

function activateTab(tab, setFocus = true) {
  const tabs = getTabs();
  const panels = getPanels();

  tabs.forEach((item) => {
    const isActive = item === tab;
    item.classList.toggle("active", isActive);
    item.setAttribute("aria-selected", String(isActive));
    item.setAttribute("tabindex", isActive ? "0" : "-1");
  });

  panels.forEach((panel) => {
    const isMatch = panel.id === tab.getAttribute("aria-controls");
    panel.hidden = !isMatch;
  });

  if (setFocus) {
    tab.focus();
  }
}

function onTabKeydown(event) {
  const tabs = getTabs();
  const currentIndex = tabs.indexOf(event.currentTarget);
  if (currentIndex === -1) return;

  let nextIndex = null;

  switch (event.key) {
    case "ArrowRight":
      nextIndex = (currentIndex + 1) % tabs.length;
      break;
    case "ArrowLeft":
      nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
      break;
    case "Home":
      nextIndex = 0;
      break;
    case "End":
      nextIndex = tabs.length - 1;
      break;
    case "Enter":
    case " ":
      event.preventDefault();
      activateTab(event.currentTarget);
      return;
    default:
      return;
  }

  event.preventDefault();
  tabs[nextIndex].focus();
}

function initTabs() {
  const tabs = getTabs();

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => activateTab(tab, false));
    tab.addEventListener("keydown", onTabKeydown);
  });
}

function toggleExpand(btn) {
  const expanded = btn.getAttribute("aria-expanded") === "true";
  const nextState = !expanded;

  btn.setAttribute("aria-expanded", String(nextState));

  const panelId = btn.getAttribute("aria-controls");
  const panel = document.getElementById(panelId);
  if (panel) {
    panel.hidden = !nextState;
  }

  const label = btn.querySelector(".expand-label");
  if (label) {
    label.textContent = nextState ? "Read less" : "Read more";
  }
}

function initExpandButtons() {
  const buttons = document.querySelectorAll(".btn-expand");
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => toggleExpand(btn));
  });
}

function noteKey(storyId) {
  return STORAGE_PREFIX + "note:" + storyId;
}

function saveNote(storyId, text) {
  if (!storyId) return;
  if (text.trim() === "") {
    storageRemove(noteKey(storyId));
  } else {
    storageSet(noteKey(storyId), text);
  }
}

function loadNote(storyId) {
  return storageGet(noteKey(storyId)) || "";
}

function initNotes() {
  const textareas = document.querySelectorAll(".story-note");
  textareas.forEach((textarea) => {
    textarea.addEventListener("input", () => {
      const storyId = textarea.getAttribute("data-story-id");
      saveNote(storyId, textarea.value);
    });
  });
}

function restoreNotes() {
  const textareas = document.querySelectorAll(".story-note");
  textareas.forEach((textarea) => {
    const storyId = textarea.getAttribute("data-story-id");
    textarea.value = loadNote(storyId);
  });
}

function bookmarkKey(storyId) {
  return STORAGE_PREFIX + "bookmark:" + storyId;
}

function saveBookmark(storyId, isBookmarked) {
  if (!storyId) return;
  if (isBookmarked) {
    storageSet(bookmarkKey(storyId), "1");
  } else {
    storageRemove(bookmarkKey(storyId));
  }
}

function isBookmarked(storyId) {
  return storageGet(bookmarkKey(storyId)) === "1";
}

function applyBookmarkState(button, bookmarked) {
  button.setAttribute("aria-pressed", String(bookmarked));
  const label = button.querySelector(".bookmark-label");
  if (label) {
    label.textContent = bookmarked ? "Bookmarked" : "Bookmark";
  }
}

function toggleBookmark(button) {
  const storyId = button.getAttribute("data-story-id");
  const currentlyPressed = button.getAttribute("aria-pressed") === "true";
  const nextState = !currentlyPressed;

  applyBookmarkState(button, nextState);
  saveBookmark(storyId, nextState);
}

function initBookmarks() {
  const buttons = document.querySelectorAll(".btn-bookmark");
  buttons.forEach((button) => {
    button.addEventListener("click", () => toggleBookmark(button));
  });
}

function restoreBookmarks() {
  const buttons = document.querySelectorAll(".btn-bookmark");
  buttons.forEach((button) => {
    const storyId = button.getAttribute("data-story-id");
    applyBookmarkState(button, isBookmarked(storyId));
  });
}

function initArchiveButton() {
  const btn = document.getElementById("btn-archive");
  if (!btn) return;
  btn.addEventListener("click", () => {
    alert("Archive is not yet implemented in this version.");
  });
}

function initReadingModeButton() {
  const btn = document.getElementById("btn-reading");
  if (!btn) return;
  btn.addEventListener("click", () => {
    alert("Reading mode is not yet implemented in this version.");
  });
}

function initFocusModeButton() {
  const btn = document.getElementById("btn-focus");
  if (!btn) return;
  btn.addEventListener("click", () => {
    alert("Focus mode is not yet implemented in this version.");
  });
}

function init() {
  restoreTheme();
  initTabs();
  initExpandButtons();
  initNotes();
  restoreNotes();
  initBookmarks();
  restoreBookmarks();

  const themeBtn = document.getElementById("btn-theme");
  if (themeBtn) {
    themeBtn.addEventListener("click", toggleTheme);
  }

  initArchiveButton();
  initReadingModeButton();
  initFocusModeButton();
}

document.addEventListener("DOMContentLoaded", init);
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./sw.js")
      .catch((error) => console.error("Service worker registration failed:", error));
  });
}
