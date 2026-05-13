const STORAGE_PREFIX = "dailybrief:";
let storyData = null;

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

  if (setFocus) tab.focus();
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

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function createStoryMarkup(story, type = "card", instanceKey = "default") {
  const isHero = type === "hero";
  const headlineTag = isHero ? "h2" : "h3";
  const wrapperClass = isHero ? "hero-card" : "story-card";
  const noteLabel = story.contextNote
    ? (["legal", "reliance", "retail", "opinion"].includes(story.section) ? "Why it matters" : "Why it's relevant")
    : "Context";

  const domIdSuffix = `${story.id}-${instanceKey}`;

  return `
    <article class="${wrapperClass}" data-story-id="${escapeHtml(story.id)}">
      ${isHero ? `<span class="story-index" aria-hidden="true">01</span>` : ""}
      <${headlineTag} class="${isHero ? "hero-headline" : "story-headline"}">
        ${escapeHtml(story.headline)}
      </${headlineTag}>

      <p class="story-hook ${isHero ? "" : "story-hook-card"}">
        ${escapeHtml(story.hook)}
      </p>

      <button
        class="btn-expand"
        type="button"
        aria-expanded="false"
        aria-controls="details-${escapeHtml(domIdSuffix)}"
      >
        <span class="expand-label">Read more</span>
        <svg class="expand-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
             aria-hidden="true">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </button>

      <div class="story-details" id="details-${escapeHtml(domIdSuffix)}" hidden>
        <div class="story-details-inner">
          <p class="story-summary">${escapeHtml(story.summary)}</p>

          ${story.contextNote ? `
            <div class="why-matters ${isHero ? "hero" : "card"}">
              <p class="why-label">${escapeHtml(noteLabel)}</p>
              <p>${escapeHtml(story.contextNote)}</p>
            </div>
          ` : ""}

          <div class="story-meta">
            <span class="story-source">${escapeHtml(story.source)}</span>
            <span class="story-date">${escapeHtml(story.dateLabel)}</span>
          </div>

          <div class="notes-block">
            <label class="notes-label" for="note-${escapeHtml(domIdSuffix)}">Your note</label>
            <textarea
              class="story-note"
              id="note-${escapeHtml(domIdSuffix)}"
              data-story-id="${escapeHtml(story.id)}"
              placeholder="Add a note — saved automatically…"
              rows="3"
            ></textarea>
          </div>

          <div class="card-footer">
            <button
              class="btn-bookmark"
              type="button"
              data-story-id="${escapeHtml(story.id)}"
              aria-pressed="false"
            >
              <svg class="icon-bookmark" width="16" height="16" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
                   aria-hidden="true">
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
              </svg>
              <span class="bookmark-label">Bookmark</span>
            </button>

            <a class="read-link" href="${escapeHtml(story.sourceUrl || "#")}" target="_blank" rel="noopener noreferrer">
              Read source
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
                   aria-hidden="true">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                <polyline points="15 3 21 3 21 9"></polyline>
                <line x1="10" y1="14" x2="21" y2="3"></line>
              </svg>
            </a>
          </div>
        </div>
      </div>
    </article>
  `;
}

function getAllStories(data) {
  if (!data || !data.sections) return [];
  return Object.values(data.sections).flatMap((items) => Array.isArray(items) ? items : []);
}

function findHeroStory(data) {
  const allStories = getAllStories(data);
  return allStories.find((story) => story.id === data.heroStoryId) || null;
}

function getBookmarkedStories(data) {
  const allStories = getAllStories(data);
  return allStories.filter((story) => isBookmarked(story.id));
}

function renderBookmarksPanel(data) {
  const bookmarksGrid = document.getElementById("bookmarks-grid");
  if (!bookmarksGrid) return;

  const bookmarkedStories = getBookmarkedStories(data);

  if (!bookmarkedStories.length) {
    bookmarksGrid.innerHTML = `
      <article class="story-card">
        <h3 class="story-headline">No bookmarks yet</h3>
        <p class="story-hook story-hook-card">
          Save stories to revisit them later. Bookmarked stories will appear here automatically.
        </p>
      </article>
    `;
    return;
  }

  bookmarksGrid.innerHTML = bookmarkedStories
    .map((story, index) => createStoryMarkup(story, "card", `bookmarks-${index}`))
    .join("");
}

function renderStories(data) {
  const heroContainer = document.getElementById("hero-container");
  const heroStory = findHeroStory(data);

  if (heroContainer && heroStory) {
    heroContainer.innerHTML = createStoryMarkup(heroStory, "hero", "hero");
  } else if (heroContainer) {
    heroContainer.innerHTML = `
      <article class="hero-card">
        <h2 class="hero-headline">No hero story available</h2>
        <p class="story-hook">Please check that heroStoryId matches one of the story IDs in stories.json.</p>
      </article>
    `;
  }

  const sectionKeys = [
    "legal",
    "reliance",
    "retail",
    "business",
    "tech",
    "geopolitics",
    "sports",
    "opinion"
  ];

  sectionKeys.forEach((sectionKey) => {
    const stories = Array.isArray(data?.sections?.[sectionKey]) ? data.sections[sectionKey] : [];

    const allSectionsGrid = document.getElementById(`${sectionKey}-grid`);
    if (allSectionsGrid) {
      allSectionsGrid.innerHTML = stories
        .map((story, index) => createStoryMarkup(story, "card", `${sectionKey}-all-${index}`))
        .join("");
    }

    const panelGrid = document.getElementById(`${sectionKey}-grid-panel`);
    if (panelGrid) {
      panelGrid.innerHTML = stories
        .map((story, index) => createStoryMarkup(story, "card", `${sectionKey}-panel-${index}`))
        .join("");
    }
  });
  
    renderBookmarksPanel(data);
}

function initExpandButtons() {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const buttons = document.querySelectorAll(".btn-expand");

  buttons.forEach((button) => {
    const detailsId = button.getAttribute("aria-controls");
    const details = detailsId ? document.getElementById(detailsId) : null;
    if (!details) return;

        const label = button.querySelector(".expand-label");

    const updateButtonLabel = (expanded) => {
      if (label) {
        label.textContent = expanded ? "Show less" : "Read more";
      }
    };
    
     const setClosed = () => {
      button.setAttribute("aria-expanded", "false");
      updateButtonLabel(false);
      details.classList.remove("is-open");
      details.style.maxHeight = "0px";
      details.style.opacity = "0";
      details.hidden = true;
    };

    const setOpen = () => {
      button.setAttribute("aria-expanded", "true");
      updateButtonLabel(true);
      details.hidden = false;
      details.classList.add("is-open");
      details.style.maxHeight = `${details.scrollHeight}px`;
      details.style.opacity = "1";
    };

    const isExpanded = button.getAttribute("aria-expanded") === "true";

    if (reduceMotion) {
      details.hidden = !isExpanded;
      details.classList.toggle("is-open", isExpanded);
      details.style.maxHeight = "none";
      details.style.opacity = "1";
    } else {
      if (isExpanded) {
        setOpen();
      } else {
        setClosed();
      }
    }

    button.addEventListener("click", () => {
      const expanded = button.getAttribute("aria-expanded") === "true";

      if (reduceMotion) {
        if (expanded) {
          setClosed();
        } else {
          setOpen();
        }
        return;
      }

                  if (expanded) {
        button.setAttribute("aria-expanded", "false");
        updateButtonLabel(false);
        details.classList.remove("is-open");
        details.style.opacity = "0";

        requestAnimationFrame(() => {
          details.style.maxHeight = "0px";
        });

        const onEnd = (event) => {
          if (event.propertyName !== "max-height") return;
          details.hidden = true;
          details.removeEventListener("transitionend", onEnd);
        };

        details.addEventListener("transitionend", onEnd);
      } else {
        details.hidden = false;
        details.style.maxHeight = "0px";
        details.style.opacity = "0";

        requestAnimationFrame(() => {
          button.setAttribute("aria-expanded", "true");
          details.classList.add("is-open");
          details.style.maxHeight = `${details.scrollHeight}px`;
          details.style.opacity = "1";
        });

        const onEnd = (event) => {
          if (event.propertyName !== "max-height") return;
          details.style.maxHeight = `${details.scrollHeight}px`;
          details.removeEventListener("transitionend", onEnd);
        };

        details.addEventListener("transitionend", onEnd);
      }
    });
  });
}
function syncNoteFields(storyId, value, sourceTextarea = null) {
  const textareas = document.querySelectorAll(`.story-note[data-story-id="${CSS.escape(storyId)}"]`);
  textareas.forEach((textarea) => {
    if (textarea === sourceTextarea) return;
    textarea.value = value;
  });
}

function syncBookmarkButtons(storyId, bookmarked) {
  const buttons = document.querySelectorAll(`.btn-bookmark[data-story-id="${CSS.escape(storyId)}"]`);
  buttons.forEach((button) => applyBookmarkState(button, bookmarked));
}

function initNotes() {
  const textareas = document.querySelectorAll(".story-note");

  textareas.forEach((textarea) => {
    const storyId = textarea.getAttribute("data-story-id");
    textarea.value = loadNote(storyId);

    textarea.addEventListener("input", () => {
      const value = textarea.value;
      saveNote(storyId, value);
      syncNoteFields(storyId, value, textarea);
    });
  });
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

  saveBookmark(storyId, nextState);

  if (storyData) {
    renderStories(storyData);
    initScrollReveal();
    initExpandButtons();
    initNotes();
    initBookmarks();
  }
}

function initBookmarks() {
  const buttons = document.querySelectorAll(".btn-bookmark");

  buttons.forEach((button) => {
    const storyId = button.getAttribute("data-story-id");
    applyBookmarkState(button, isBookmarked(storyId));

    button.addEventListener("click", () => toggleBookmark(button));
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

async function loadStories() {
  const response = await fetch("./stories.json", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Failed to load stories.json");
  }
  return response.json();
}

async function refreshStories(button = null) {
  const minDelay = 700;
  const startTime = Date.now();

  if (button) {
    button.disabled = true;
    const originalHtml = button.innerHTML;
    button.dataset.originalHtml = originalHtml;
    button.setAttribute("aria-busy", "true");
    button.innerHTML = `
      <span class="btn-spinner" aria-hidden="true"></span>
      <span>Refreshing…</span>
    `;
  }

  try {
     storyData = await loadStories();
    renderStories(storyData);
    initScrollReveal();

    initExpandButtons();
    initNotes();
    initBookmarks();

    const elapsed = Date.now() - startTime;
    const remaining = minDelay - elapsed;

    if (remaining > 0) {
      await new Promise((resolve) => setTimeout(resolve, remaining));
    }
  } catch (error) {
    console.error("Refresh failed:", error);
    alert("Could not refresh stories. Please try again.");
  } finally {
    if (button) {
      button.disabled = false;
      button.removeAttribute("aria-busy");

      if (button.dataset.originalHtml) {
        button.innerHTML = button.dataset.originalHtml;
      }
    }
  }
}

function initRefreshButtons() {
  const buttons = document.querySelectorAll("[data-refresh-section]");
  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      refreshStories(button);
    });
  });
}

function initScrollReveal() {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const revealItems = document.querySelectorAll(".hero-section, .rail-section, .rail-section-single, .story-card, .hero-card");

  if (reduceMotion) {
    revealItems.forEach((item) => item.classList.add("is-visible"));
    return;
  }

  revealItems.forEach((item) => item.classList.add("reveal-on-scroll"));

  const observer = new IntersectionObserver(
    (entries, obs) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        obs.unobserve(entry.target);
      });
    },
    {
      threshold: 0.12,
      rootMargin: "0px 0px -40px 0px",
    }
  );

  revealItems.forEach((item) => observer.observe(item));
}

async function initApp() {
  restoreTheme();
  initTabs();

    storyData = await loadStories();
  renderStories(storyData);
  initScrollReveal();

  initExpandButtons();
  initNotes();
  initBookmarks();
  initRefreshButtons();

  const themeBtn = document.getElementById("btn-theme");
  if (themeBtn) {
    themeBtn.addEventListener("click", toggleTheme);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initApp().catch((error) => {
    console.error(error);
    const main = document.getElementById("main-content");
    if (main) {
      main.innerHTML = `
        <section class="rail-section">
          <h2 class="rail-heading">Unable to load stories</h2>
          <p class="panel-note">Please check that stories.json exists in the repo root and is valid JSON.</p>
        </section>
      `;
    }
  });
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./sw.js")
      .catch((error) => console.error("Service worker registration failed:", error));
  });
}
