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
  const noteLabel = "Why it matters";

  const domIdSuffix = `${story.id}-${instanceKey}`;

  return `
    <article class="${wrapperClass}" data-section="${escapeHtml(story.section)}" data-story-id="${escapeHtml(story.id)}">
      ${isHero ? `<span class="story-index" aria-hidden="true">01</span>` : ""}
      ${!isHero && story.source ? `<span class="story-source-pill">${escapeHtml(story.source)}</span>` : ""}
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
          ${story.summary
            ? `<p class="story-summary">${escapeHtml(story.summary)}</p>`
            : `<p class="story-summary story-summary--none">No additional summary available — open the full article for details.</p>`
          }

          ${story.contextNote ? `
            <div class="why-matters ${isHero ? "hero" : "card"}">
              <p class="why-label">${escapeHtml(noteLabel)}</p>
              <p>${escapeHtml(story.contextNote)}</p>
            </div>
          ` : ""}

<div class="story-meta">
  <span class="story-source">${escapeHtml(story.source || story.sectionLabel || story.section)}</span>
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

// ── Fix 2 & 3: Empty-state helpers ───────────────────────────────────────────

// Section labels used for empty-state messaging and offline edition
const SECTION_KEYS = ["legal", "reliance", "retail", "business", "tech", "world", "sports", "opinion"];

const SECTION_LABELS = {
  legal:    "Legal & Regulatory",
  reliance: "Reliance",
  retail:   "Retail",
  business: "Business",
  tech:     "Tech",
  world:    "World",
  sports:   "Sports",
  opinion:  "Opinion"
};

function createSectionEmptyState(sectionKey) {
  const label = SECTION_LABELS[sectionKey] || sectionKey;
  return `
    <article class="story-card story-card--empty">
      <h3 class="story-headline">No ${label} stories today</h3>
      <p class="story-hook story-hook-card">
        Stories update automatically each morning. Check back after 6 AM IST, or trigger a manual refresh from the Actions tab.
      </p>
    </article>
  `;
}

function createHeroEmptyState() {
  return `
    <article class="hero-card hero-card--empty">
      <span class="story-index" aria-hidden="true">—</span>
      <h2 class="hero-headline">Today's brief is on its way</h2>
      <p class="story-hook">
        Stories are fetched automatically at 6 AM IST each day. If it's past that time, you can trigger a manual run from the GitHub Actions tab — or check back shortly.
      </p>
    </article>
  `;
}

// ─────────────────────────────────────────────────────────────────────────────

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

function renderBookmarksPanel() {
  const bookmarksGrid = document.getElementById("bookmarks-grid");
  if (!bookmarksGrid || !storyData) return;

  const bookmarkedStories = getAllStories(storyData).filter((story) => isBookmarked(story.id));

if (!bookmarkedStories.length) {
  bookmarksGrid.innerHTML = `
    <article class="story-card">
      <h3 class="story-headline">No saved stories yet</h3>
      <p class="story-hook story-hook-card">
        Bookmark stories from any section and they'll appear here for quick access.
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

  // Fix 3: meaningful hero empty state
  if (heroContainer && heroStory) {
    heroContainer.innerHTML = createStoryMarkup(heroStory, "hero", "hero");
  } else if (heroContainer) {
    heroContainer.innerHTML = createHeroEmptyState();
  }

  // Fix 1 & 2: use SECTION_KEYS (world not geopolitics); show empty-state cards
  SECTION_KEYS.forEach((sectionKey) => {
    const stories = Array.isArray(data?.sections?.[sectionKey]) ? data.sections[sectionKey] : [];

    const allSectionsGrid = document.getElementById(`${sectionKey}-grid`);
    if (allSectionsGrid) {
      allSectionsGrid.innerHTML = stories.length
        ? stories.map((story, index) => createStoryMarkup(story, "card", `${sectionKey}-all-${index}`)).join("")
        : createSectionEmptyState(sectionKey);
    }

    const panelGrid = document.getElementById(`${sectionKey}-grid-panel`);
    if (panelGrid) {
      panelGrid.innerHTML = stories.length
        ? stories.map((story, index) => createStoryMarkup(story, "card", `${sectionKey}-panel-${index}`)).join("")
        : createSectionEmptyState(sectionKey);
    }
  });
  
  renderBookmarksPanel();
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
    renderBookmarksPanel();
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

// ── Offline Download Edition ──────────────────────────────────────────────────

function buildOfflineEditionHtml(data) {
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-IN", {
    weekday: "long", year: "numeric", month: "long", day: "numeric"
  });

  const heroStory = findHeroStory(data);

  let heroHtml = "";
  if (heroStory) {
    heroHtml = `
      <section class="section">
        <p class="eyebrow">Front Page</p>
        <h2>${escapeHtml(heroStory.headline)}</h2>
        <p class="hook">${escapeHtml(heroStory.hook)}</p>
        ${heroStory.summary ? `<p>${escapeHtml(heroStory.summary)}</p>` : ""}
        ${heroStory.contextNote ? `<blockquote>${escapeHtml(heroStory.contextNote)}</blockquote>` : ""}
        <p class="meta">${escapeHtml(heroStory.sectionLabel || heroStory.section || "")} · ${escapeHtml(heroStory.dateLabel || "")}</p>
        ${heroStory.sourceUrl ? `<a href="${escapeHtml(heroStory.sourceUrl)}">Read source ↗</a>` : ""}
      </section>
    `;
  }

  let sectionsHtml = "";
  // Fix 1: use SECTION_KEYS and SECTION_LABELS (world not geopolitics)
  SECTION_KEYS.forEach((key) => {
    const stories = Array.isArray(data?.sections?.[key]) ? data.sections[key] : [];
    if (!stories.length) return;

    const storiesHtml = stories.map((story) => `
      <div class="story">
        <h3>${escapeHtml(story.headline)}</h3>
        <p class="hook">${escapeHtml(story.hook)}</p>
        ${story.summary ? `<p>${escapeHtml(story.summary)}</p>` : ""}
        ${story.contextNote ? `<blockquote>${escapeHtml(story.contextNote)}</blockquote>` : ""}
        <p class="meta">${escapeHtml(story.sectionLabel || story.section || "")} · ${escapeHtml(story.dateLabel || "")}</p>
        ${story.sourceUrl ? `<a href="${escapeHtml(story.sourceUrl)}">Read source ↗</a>` : ""}
      </div>
    `).join("");

    sectionsHtml += `
      <section class="section">
        <h2>${escapeHtml(SECTION_LABELS[key] || key)}</h2>
        ${storiesHtml}
      </section>
    `;
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>The Daily Brief — ${dateStr}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: Georgia, 'Times New Roman', serif;
      background: #faf8f4;
      color: #1a1917;
      max-width: 720px;
      margin: 0 auto;
      padding: 32px 24px 64px;
      line-height: 1.7;
    }
    header {
      border-bottom: 2px solid #1a1917;
      padding-bottom: 16px;
      margin-bottom: 32px;
    }
    header h1 { font-size: 2rem; letter-spacing: -0.02em; }
    header p { color: #6b6a67; font-size: 0.875rem; margin-top: 4px; }
    .section {
      border-top: 1px solid #dcdad5;
      padding-top: 28px;
      margin-top: 28px;
    }
    .eyebrow {
      font-family: 'Courier New', monospace;
      font-size: 0.625rem;
      letter-spacing: 0.15em;
      text-transform: uppercase;
      color: #6b6a67;
      margin-bottom: 8px;
    }
    h2 { font-size: 1.5rem; line-height: 1.2; margin-bottom: 10px; }
    h3 { font-size: 1.1rem; line-height: 1.3; margin-bottom: 8px; margin-top: 24px; }
    .hook { font-style: italic; color: #4a4946; margin-bottom: 10px; }
    blockquote {
      border-left: 3px solid #c5392a;
      padding-left: 14px;
      margin: 12px 0;
      color: #4a4946;
      font-size: 0.9375rem;
    }
    .meta {
      font-family: 'Courier New', monospace;
      font-size: 0.6875rem;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #9a9894;
      margin-top: 10px;
    }
    a { color: #1a1917; }
    .story { margin-bottom: 8px; }
    footer { margin-top: 48px; border-top: 1px solid #dcdad5; padding-top: 16px; font-size: 0.75rem; color: #9a9894; }
  </style>
</head>
<body>
  <header>
    <h1>The Daily Brief</h1>
    <p>Offline edition · Saved ${dateStr}</p>
  </header>
  ${heroHtml}
  ${sectionsHtml}
  <footer>
    <p>The Daily Brief · Offline edition saved on ${dateStr}. Source links open when you're back online.</p>
  </footer>
</body>
</html>`;
}

function downloadOfflineEdition() {
  if (!storyData) {
    alert("Stories are still loading. Please wait a moment and try again.");
    return;
  }

  const btn = document.getElementById("btn-download");
  if (btn) {
    btn.disabled = true;
    btn.setAttribute("aria-label", "Saving…");
    btn.title = "Saving…";
  }

  try {
    const html = buildOfflineEditionHtml(storyData);
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);

    const now = new Date();
    const dateStamp = now.toISOString().slice(0, 10);
    const link = document.createElement("a");
    link.href = url;
    link.download = `daily-brief-${dateStamp}.html`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    if (btn) {
      btn.setAttribute("aria-label", "Edition saved!");
      btn.title = "Edition saved!";
      setTimeout(() => {
        btn.setAttribute("aria-label", "Download offline edition");
        btn.title = "Download offline edition";
        btn.disabled = false;
      }, 2500);
    }
  } catch (err) {
    console.error("Download failed:", err);
    alert("Could not generate the offline edition. Please try again.");
    if (btn) {
      btn.disabled = false;
      btn.setAttribute("aria-label", "Download offline edition");
      btn.title = "Download offline edition";
    }
  }
}

function initDownloadButton() {
  const btn = document.getElementById("btn-download");
  if (!btn) return;
  btn.addEventListener("click", downloadOfflineEdition);
}

function initHeaderRefreshButton() {
  const btn = document.getElementById("btn-refresh");
  if (!btn) return;
  btn.addEventListener("click", () => {
    btn.disabled = true;
    btn.style.opacity = "0.5";
    refreshStories().finally(() => {
      btn.disabled = false;
      btn.style.opacity = "";
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────

async function loadStories() {
  const response = await fetch("./stories.json", { cache: "reload" });
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
  initDownloadButton();
  initHeaderRefreshButton();
  initSettingsModal();
  initPdfImport();
  renderPaperStories();

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

// ─────────────────────────────────────────────────────────────────────────────
// Settings
// ─────────────────────────────────────────────────────────────────────────────

const SETTINGS_KEY = "daily-brief:settings";

function loadSettings() {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}"); }
  catch { return {}; }
}

function saveSettings(s) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

async function triggerWorkflow(pat) {
  const res = await fetch(
    "https://api.github.com/repos/problemchild02/daily-brief/actions/workflows/daily-update.yml/dispatches",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${pat}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ref: "main" }),
    }
  );
  return res.status === 204;
}

function initSettingsModal() {
  const overlay  = document.getElementById("settings-overlay");
  const openBtn  = document.getElementById("btn-settings");
  const closeBtn = document.getElementById("settings-close");
  const patInput = document.getElementById("input-github-pat");
  const saveBtn  = document.getElementById("btn-save-settings");
  const runBtn   = document.getElementById("btn-trigger-workflow");
  const status   = document.getElementById("settings-status");
  if (!overlay) return;

  function openModal() {
    patInput.value = loadSettings().githubPat || "";
    overlay.hidden = false;
    patInput.focus();
  }
  function closeModal() { overlay.hidden = true; }
  function showStatus(msg, ok) {
    status.textContent = msg;
    status.className = `settings-status ${ok ? "status-ok" : "status-err"}`;
    status.hidden = false;
  }

  openBtn.addEventListener("click", openModal);
  closeBtn.addEventListener("click", closeModal);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !overlay.hidden) closeModal(); });

  saveBtn.addEventListener("click", () => {
    const s = loadSettings();
    s.githubPat = patInput.value.trim();
    saveSettings(s);
    showStatus("Saved.", true);
  });

  runBtn.addEventListener("click", async () => {
    const pat = patInput.value.trim() || loadSettings().githubPat;
    if (!pat) { showStatus("Paste your GitHub PAT first.", false); return; }
    runBtn.disabled = true;
    runBtn.textContent = "Triggering…";
    try {
      const ok = await triggerWorkflow(pat);
      if (ok) {
        showStatus("Workflow triggered! Stories will update in ~3 minutes.", true);
      } else {
        showStatus("Failed — check your PAT has the 'workflow' scope.", false);
      }
    } catch (e) {
      showStatus(`Error: ${e.message}`, false);
    }
    runBtn.disabled = false;
    runBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg> Run workflow now`;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// PDF import
// ─────────────────────────────────────────────────────────────────────────────

const PAPERS_KEY = "daily-brief:papers";
const PDFJS_CDN  = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
const PDFJS_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

const SECTION_KW = {
  legal:    ["court", "judge", "judgment", "petition", "sc ", "high court", "supreme court", "nclt", "nclat", "sebi", "cci", "tribunal", "verdict", "bench", "justice", "advocate", "suo motu", "bail", "fir", "arrest", "conviction", "acquit", "ipc", "crpc", "constitution", "article "],
  business: ["company", "market", "stock", "share", "profit", "revenue", "quarterly", "ipo", "merger", "acquisition", "rbi", "nifty", "sensex", "corporate", "ceo", "board", "rupee", "gdp", "inflation", "budget", "fiscal", "trade"],
  reliance: ["reliance", "jio", "mukesh ambani", "ril", "jiomart"],
  retail:   ["retail", "fmcg", "consumer", "ecommerce", "e-commerce", "flipkart", "amazon", "zomato", "swiggy", "meesho", "blinkit", "grocer", "supermarket"],
  tech:     ["tech", "startup", "artificial intelligence", "ai ", "dpdp", "meity", "cyber", "data privacy", "app ", "software", "digital", "fintech", "edtech"],
  world:    ["pakistan", "china", "us ", "iran", "russia", "ukraine", "geopolit", "bilateral", "diplomatic", "nato", "united nations", "global", "international"],
  sports:   ["cricket", "football", "soccer", "ipl", "test match", "wicket", "batting", "bowling", "goal", "league", "tournament", "fifa", "premier league", "isl", "match"],
  opinion:  ["opinion", "editorial", "analysis", "column", "perspective", "view", "comment"],
};

function guessSection(text) {
  const lower = text.toLowerCase();
  let best = "opinion", bestScore = 0;
  for (const [sec, kws] of Object.entries(SECTION_KW)) {
    const score = kws.reduce((n, kw) => n + (lower.includes(kw) ? 1 : 0), 0);
    if (score > bestScore) { bestScore = score; best = sec; }
  }
  return best;
}

function loadPaperStories() {
  try { return JSON.parse(localStorage.getItem(PAPERS_KEY) || "[]"); }
  catch { return []; }
}

function savePaperStories(stories) {
  localStorage.setItem(PAPERS_KEY, JSON.stringify(stories));
}

async function loadPdfJs() {
  if (window.pdfjsLib) return;
  await new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = PDFJS_CDN;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
}

async function extractPdfText(file, onProgress) {
  await loadPdfJs();
  const buf = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
  const pages = pdf.numPages;
  let full = "";
  for (let i = 1; i <= pages; i++) {
    if (onProgress) onProgress(i, pages);
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map((it) => it.str).join(" ");
    full += pageText + "\n\n";
  }
  return full;
}

function parseStoriesFromText(text, sourceName) {
  const stories = [];
  const lines = text.split(/\n+/).map((l) => l.trim()).filter((l) => l.length > 0);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const words = line.split(/\s+/);
    const isHeadline =
      words.length >= 4 &&
      words.length <= 25 &&
      line.length >= 20 &&
      line.length <= 200 &&
      !/^\d+$/.test(line) &&
      !/^[A-Z\s\d]+$/.test(line) &&
      !/page \d+/i.test(line) &&
      !line.startsWith("http");

    if (!isHeadline) continue;

    const bodyLines = [];
    let j = i + 1;
    while (j < lines.length && bodyLines.length < 8) {
      const next = lines[j];
      const nextWords = next.split(/\s+/);
      if (nextWords.length >= 4 && nextWords.length <= 25 && next.length <= 200) break;
      if (next.length > 30) bodyLines.push(next);
      j++;
    }
    if (bodyLines.length === 0) continue;

    const body = bodyLines.join(" ");
    const hook = body.slice(0, 220);
    const summary = body.slice(0, 900);
    const section = guessSection(line + " " + hook);

    stories.push({
      id: "paper-" + Math.random().toString(36).slice(2, 10),
      headline: line,
      hook,
      summary,
      section,
      source: sourceName,
      sourceUrl: "#",
      dateLabel: "Today",
      tags: ["newspaper", section],
      contextNote: "",
      fromPaper: true,
    });
    i = j - 1;
  }
  return stories.slice(0, 40);
}

function renderPaperStories() {
  const grid  = document.getElementById("papers-grid");
  const empty = document.getElementById("papers-empty");
  if (!grid) return;

  const stories = loadPaperStories();
  if (stories.length === 0) {
    grid.hidden = true;
    if (empty) empty.hidden = false;
    return;
  }
  if (empty) empty.hidden = true;
  grid.hidden = false;
  grid.innerHTML = stories.map((s) => createStoryMarkup(s, "card", "paper")).join("");
  initExpandButtons();
  initNotes();
  initBookmarks();
}

function initPdfImport() {
  const overlay    = document.getElementById("pdf-overlay");
  const openBtn    = document.getElementById("btn-import-pdf");
  const closeBtn   = document.getElementById("pdf-close");
  const fileInput  = document.getElementById("input-pdf-file");
  const dropZone   = document.getElementById("pdf-drop-zone");
  const stepPick   = document.getElementById("pdf-step-pick");
  const stepProc   = document.getElementById("pdf-step-processing");
  const stepReview = document.getElementById("pdf-step-review");
  const progLabel  = document.getElementById("pdf-progress-label");
  const storyList  = document.getElementById("pdf-story-list");
  const storyCount = document.getElementById("pdf-story-count");
  const fileName   = document.getElementById("pdf-file-name");
  const backBtn    = document.getElementById("btn-pdf-back");
  const addBtn     = document.getElementById("btn-pdf-add");
  const clearBtn   = document.getElementById("btn-clear-papers");
  if (!overlay) return;

  let parsedStories = [];

  function showStep(step) {
    stepPick.hidden   = step !== "pick";
    stepProc.hidden   = step !== "processing";
    stepReview.hidden = step !== "review";
  }

  function openModal() { overlay.hidden = false; showStep("pick"); }
  function closeModal() { overlay.hidden = true; fileInput.value = ""; parsedStories = []; }

  openBtn.addEventListener("click", openModal);
  closeBtn.addEventListener("click", closeModal);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !overlay.hidden) closeModal(); });

  dropZone.addEventListener("dragover", (e) => { e.preventDefault(); dropZone.classList.add("drag-over"); });
  dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag-over"));
  dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropZone.classList.remove("drag-over");
    const file = e.dataTransfer.files[0];
    if (file && file.type === "application/pdf") processFile(file);
  });

  fileInput.addEventListener("change", () => {
    if (fileInput.files[0]) processFile(fileInput.files[0]);
  });

  async function processFile(file) {
    showStep("processing");
    progLabel.textContent = "Loading PDF library…";
    try {
      parsedStories = [];
      const text = await extractPdfText(file, (page, total) => {
        progLabel.textContent = `Extracting page ${page} of ${total}…`;
      });
      progLabel.textContent = "Parsing stories…";
      parsedStories = parseStoriesFromText(text, file.name.replace(/\.pdf$/i, ""));
      if (parsedStories.length === 0) {
        progLabel.textContent = "No stories could be detected. This PDF may be image-based (scanned).";
        return;
      }
      fileName.textContent = file.name;
      storyCount.textContent = parsedStories.length;
      storyList.innerHTML = parsedStories.map((s, idx) => `
        <div class="pdf-story-item">
          <input class="pdf-story-headline-input" type="text" value="${escapeHtml(s.headline)}" data-idx="${idx}" aria-label="Headline">
          <select class="pdf-story-section-select" data-idx="${idx}" aria-label="Section">
            ${["legal","business","retail","tech","world","sports","opinion"].map((sec) =>
              `<option value="${sec}" ${sec === s.section ? "selected" : ""}>${sec.charAt(0).toUpperCase() + sec.slice(1)}</option>`
            ).join("")}
          </select>
          <p class="pdf-story-preview">${escapeHtml(s.hook)}</p>
        </div>
      `).join("");
      showStep("review");
    } catch (err) {
      progLabel.textContent = `Error: ${err.message}`;
    }
  }

  storyList.addEventListener("input", (e) => {
    const idx = +e.target.dataset.idx;
    if (isNaN(idx)) return;
    if (e.target.tagName === "INPUT") parsedStories[idx].headline = e.target.value;
    if (e.target.tagName === "SELECT") parsedStories[idx].section = e.target.value;
  });

  backBtn.addEventListener("click", () => { fileInput.value = ""; showStep("pick"); });

  addBtn.addEventListener("click", () => {
    const existing = loadPaperStories();
    savePaperStories([...existing, ...parsedStories]);
    renderPaperStories();
    closeModal();
    // Switch to Papers tab
    const papersTab = document.getElementById("tab-papers");
    if (papersTab) papersTab.click();
  });

  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      if (confirm("Clear all imported newspaper stories?")) {
        savePaperStories([]);
        renderPaperStories();
      }
    });
  }
}
