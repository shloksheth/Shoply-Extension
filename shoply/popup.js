// ---------- Constants ----------

const EMOJI_OPTIONS = [
  "✦", "🛒", "👟", "🏡", "💻", "🎧", "📚", "🎁", "🧴", "🪴", "🐾", "✈️",
  "👗", "👜", "💄", "⌚", "🕶️", "💍", "🧢", "🥾", "🎮", "📱", "🖥️", "📷",
  "🎨", "🎵", "🏋️", "⚽", "🚲", "🚗", "🍳", "🍿", "☕", "🍷", "🌱", "🧸",
  "🛠️", "🧦", "🛋️", "💡", "🎓", "🏕️", "🐶", "🐱", "🎯", "💎", "🧁", "🔥"
];

const THEMES = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
  { id: "sepia", label: "Sepia" }
];

const STORAGE_KEYS = {
  lists: "shoply_lists",
  activeList: "shoply_active_list",
  viewMode: "shoply_view_mode",
  theme: "shoply_theme"
};

// ---------- State ----------

let state = {
  lists: [],
  activeListId: null,
  viewMode: "icon",
  currentTab: null,
  selectedEmoji: EMOJI_OPTIONS[0],
  theme: "light"
};

let dragTabIndex = null;
let manageDragIndex = null;
let expandedManageLists = new Set();

// ---------- Elements ----------

const el = {
  siteFavicon: document.getElementById("siteFavicon"),
  siteDomain: document.getElementById("siteDomain"),
  addListSelect: document.getElementById("addListSelect"),
  addPageBtn: document.getElementById("addPageBtn"),
  addStatus: document.getElementById("addStatus"),
  listTabs: document.getElementById("listTabs"),
  newListForm: document.getElementById("newListForm"),
  newListName: document.getElementById("newListName"),
  emojiRow: document.getElementById("emojiRow"),
  customEmojiInput: document.getElementById("customEmojiInput"),
  cancelNewList: document.getElementById("cancelNewList"),
  listToolbar: document.getElementById("listToolbar"),
  activeListEmoji: document.getElementById("activeListEmoji"),
  activeListName: document.getElementById("activeListName"),
  itemCount: document.getElementById("itemCount"),
  modeIconBtn: document.getElementById("modeIconBtn"),
  modeLinkBtn: document.getElementById("modeLinkBtn"),
  deleteListBtn: document.getElementById("deleteListBtn"),
  itemsWrap: document.getElementById("itemsWrap"),
  emptyState: document.getElementById("emptyState"),
  itemsGrid: document.getElementById("itemsGrid"),
  itemsList: document.getElementById("itemsList"),
  settingsToggle: document.getElementById("settingsToggle"),
  settingsOverlay: document.getElementById("settingsOverlay"),
  settingsClose: document.getElementById("settingsClose"),
  themeRow: document.getElementById("themeRow"),
  manageLists: document.getElementById("manageLists"),
  downloadDataBtn: document.getElementById("downloadDataBtn"),
  importDataBtn: document.getElementById("importDataBtn"),
  importFileInput: document.getElementById("importFileInput"),
  importStatus: document.getElementById("importStatus"),
  itemContextMenu: document.getElementById("itemContextMenu")
};

// ---------- Init ----------

init();

async function init() {
  const stored = await chrome.storage.local.get([
    STORAGE_KEYS.lists,
    STORAGE_KEYS.activeList,
    STORAGE_KEYS.viewMode,
    STORAGE_KEYS.theme
  ]);

  state.lists = stored[STORAGE_KEYS.lists] || [];

  if (state.lists.length === 0) {
    const defaultList = makeList("Wishlist", "✦");
    state.lists.push(defaultList);
  }

  state.activeListId =
    stored[STORAGE_KEYS.activeList] &&
    state.lists.some((l) => l.id === stored[STORAGE_KEYS.activeList])
      ? stored[STORAGE_KEYS.activeList]
      : state.lists[0].id;

  state.viewMode = stored[STORAGE_KEYS.viewMode] || "icon";
  state.theme = stored[STORAGE_KEYS.theme] || "light";
  applyTheme(state.theme);

  buildEmojiRow();
  renderTabs();
  renderToolbar();
  renderItems();
  renderThemeRow();
  renderManageLists();
  await persist();

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  state.currentTab = tab || null;
  renderAddStrip();
  populateAddSelect();

  wireEvents();
}

function makeList(name, emoji) {
  return {
    id: crypto.randomUUID(),
    name,
    emoji,
    createdAt: Date.now(),
    items: []
  };
}

async function persist() {
  await chrome.storage.local.set({
    [STORAGE_KEYS.lists]: state.lists,
    [STORAGE_KEYS.activeList]: state.activeListId,
    [STORAGE_KEYS.viewMode]: state.viewMode,
    [STORAGE_KEYS.theme]: state.theme
  });
}

function getActiveList() {
  return state.lists.find((l) => l.id === state.activeListId) || state.lists[0];
}

// ---------- Add current page strip ----------

function renderAddStrip() {
  if (!state.currentTab || !state.currentTab.url || !/^https?:\/\//.test(state.currentTab.url)) {
    el.siteDomain.textContent = "Not a web page";
    el.addPageBtn.disabled = true;
    el.addPageBtn.style.opacity = "0.5";
    el.siteFavicon.style.visibility = "hidden";
    return;
  }
  const url = new URL(state.currentTab.url);
  el.siteDomain.textContent = url.hostname.replace(/^www\./, "");
  el.siteFavicon.style.visibility = "visible";
  el.siteFavicon.src =
    state.currentTab.favIconUrl || `https://www.google.com/s2/favicons?sz=64&domain=${url.hostname}`;
  el.siteFavicon.onerror = () => {
    el.siteFavicon.style.visibility = "hidden";
  };
}

function populateAddSelect() {
  el.addListSelect.innerHTML = "";
  state.lists.forEach((list) => {
    const opt = document.createElement("option");
    opt.value = list.id;
    opt.textContent = `${list.emoji}  ${list.name}`;
    if (list.id === state.activeListId) opt.selected = true;
    el.addListSelect.appendChild(opt);
  });
}

async function handleAddPage() {
  const url = state.currentTab && state.currentTab.url;
  if (!url) return;

  const targetListId = el.addListSelect.value;
  const targetList = state.lists.find((l) => l.id === targetListId);
  if (!targetList) return;

  el.addPageBtn.disabled = true;
  el.addPageBtn.textContent = "Adding…";
  setAddStatus("", false);

  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: state.currentTab.id },
      func: extractProductInfo
    });

    const info = result || {};
    const domain = new URL(url).hostname.replace(/^www\./, "");

    const already = targetList.items.some((it) => it.url === url);
    if (already) {
      setAddStatus("Already in this list", true);
    } else {
      targetList.items.unshift({
        id: crypto.randomUUID(),
        name: info.name || document.title || domain,
        price: info.price || "",
        image: info.image || "",
        url,
        domain,
        addedAt: Date.now()
      });
      await persist();
      setAddStatus(`Added to ${targetList.name} ✓`, false);
      if (targetList.id === state.activeListId) {
        renderToolbar();
        renderItems();
      }
    }
  } catch (err) {
    setAddStatus("Couldn't read this page", true);
  } finally {
    el.addPageBtn.disabled = false;
    el.addPageBtn.textContent = "Add site";
  }
}

function setAddStatus(text, isError) {
  el.addStatus.textContent = text;
  el.addStatus.classList.toggle("error", !!isError);
}

// This function is injected into the active tab. It must be fully
// self-contained (no references to outer popup.js scope).
function extractProductInfo() {
  function meta(selector) {
    const node = document.querySelector(selector);
    return node ? node.getAttribute("content") : null;
  }
  function text(selector) {
    const node = document.querySelector(selector);
    return node ? node.textContent.trim() : null;
  }
  function attr(selector, attribute) {
    const node = document.querySelector(selector);
    return node ? node.getAttribute(attribute) : null;
  }
  function cleanPrice(raw) {
    if (!raw) return "";
    const match = raw.replace(/\s+/g, " ").match(/[$£€]\s?\d[\d,]*\.?\d{0,2}/);
    return match ? match[0].replace(/\s/g, "") : raw.trim().slice(0, 20);
  }

  const host = location.hostname;
  let name = null;
  let price = null;
  let image = null;

  if (host.includes("amazon.")) {
    name = text("#productTitle");
    price =
      text("#corePrice_feature_div .a-offscreen") ||
      text(".a-price .a-offscreen") ||
      text("#priceblock_ourprice") ||
      text("#priceblock_dealprice");
    image = attr("#landingImage", "src") || attr("#imgTagWrapperId img", "src");
  } else if (host.includes("walmart.")) {
    name = text('h1[itemprop="name"]') || text('[data-testid="product-title"]');
    price =
      text('[itemprop="price"]') ||
      text('[data-testid="price-wrap"] span') ||
      meta('meta[property="product:price:amount"]');
    image = attr('img[data-testid="hero-image"]', "src") || attr('[data-testid="hero-image-container"] img', "src");
  } else if (host.includes("target.")) {
    name = text('h1[data-test="product-title"]');
    price = text('[data-test="product-price"]') || text('span[data-test="product-price"] span');
    image = attr('picture img', "src") || attr('[data-test="product-image"] img', "src");
  }

  // Universal fallbacks via Open Graph / meta tags.
  if (!name) name = meta('meta[property="og:title"]') || meta('meta[name="twitter:title"]') || document.title;
  if (!image) image = meta('meta[property="og:image"]') || meta('meta[name="twitter:image"]');
  if (!price) {
    price =
      meta('meta[property="product:price:amount"]') ||
      meta('meta[property="og:price:amount"]') ||
      meta('meta[itemprop="price"]');
  }
  if (!price) {
    // last resort: scan for a plausible price-looking string near the top of the page
    const bodyText = document.body ? document.body.innerText.slice(0, 4000) : "";
    const match = bodyText.match(/[$£€]\s?\d[\d,]*\.\d{2}/);
    if (match) price = match[0];
  }

  if (image && image.startsWith("//")) image = location.protocol + image;
  if (image && image.startsWith("/")) image = location.origin + image;

  return {
    name: (name || "").trim().slice(0, 200),
    price: cleanPrice(price),
    image: image || ""
  };
}

// ---------- Tabs ----------

function renderTabs() {
  el.listTabs.innerHTML = "";
  state.lists.forEach((list) => {
    const chip = document.createElement("button");
    chip.className = "tab-chip" + (list.id === state.activeListId ? " active" : "");
    chip.textContent = `${list.emoji} ${list.name}`;
    chip.addEventListener("click", () => {
      state.activeListId = list.id;
      persist();
      renderTabs();
      renderToolbar();
      renderItems();
      populateAddSelect();
    });
    el.listTabs.appendChild(chip);
  });

  const addChip = document.createElement("button");
  addChip.className = "tab-chip tab-chip-new";
  addChip.textContent = "+";
  addChip.title = "New list";
  addChip.addEventListener("click", toggleNewListForm);
  el.listTabs.appendChild(addChip);
}

// ---------- Tabs horizontal scrolling ----------
// Converts vertical mouse-wheel scroll into horizontal scroll, and allows
// click-and-drag scrolling, so the list tabs can be scrolled with any input
// device (not just a trackpad's native two-finger horizontal swipe).

function wireTabsScrolling() {
  el.listTabs.addEventListener(
    "wheel",
    (e) => {
      if (el.listTabs.scrollWidth <= el.listTabs.clientWidth) return;
      const delta = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      if (delta === 0) return;
      e.preventDefault();
      el.listTabs.scrollLeft += delta;
    },
    { passive: false }
  );

  let isDragging = false;
  let dragStartX = 0;
  let scrollStartX = 0;
  let moved = false;

  el.listTabs.addEventListener("mousedown", (e) => {
    isDragging = true;
    moved = false;
    dragStartX = e.pageX;
    scrollStartX = el.listTabs.scrollLeft;
    el.listTabs.classList.add("dragging");
  });

  window.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    const dx = e.pageX - dragStartX;
    if (Math.abs(dx) > 4) moved = true;
    el.listTabs.scrollLeft = scrollStartX - dx;
  });

  window.addEventListener("mouseup", () => {
    if (!isDragging) return;
    isDragging = false;
    el.listTabs.classList.remove("dragging");
  });

  // Suppress the tab-click that would otherwise fire right after a drag.
  el.listTabs.addEventListener(
    "click",
    (e) => {
      if (moved) {
        e.stopPropagation();
        e.preventDefault();
      }
    },
    true
  );
}

// ---------- Theme ----------

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
}

function renderThemeRow() {
  el.themeRow.innerHTML = "";
  THEMES.forEach((theme) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "theme-swatch" + (state.theme === theme.id ? " active" : "");
    btn.innerHTML = `<span class="theme-swatch-dot" data-swatch="${theme.id}"></span><span>${theme.label}</span>`;
    btn.addEventListener("click", async () => {
      state.theme = theme.id;
      applyTheme(theme.id);
      await persist();
      renderThemeRow();
    });
    el.themeRow.appendChild(btn);
  });
}

// Give each swatch dot its own preview colors regardless of the currently
// active theme, by painting them directly rather than relying on inherited
// CSS variables (which only reflect the *active* theme).
function paintThemeSwatchPreviews() {
  const previews = {
    light: { bg: "#FFFFFF", ring: "#16171B" },
    dark: { bg: "#1B1C1F", ring: "#F1F0EA" },
    sepia: { bg: "#FBF3E4", ring: "#2C241C" }
  };
  el.themeRow.querySelectorAll(".theme-swatch-dot").forEach((dot) => {
    const id = dot.getAttribute("data-swatch");
    const preview = previews[id];
    if (!preview) return;
    dot.style.background = preview.bg;
    dot.style.boxShadow = `inset 0 0 0 3px ${preview.bg}`;
    dot.style.borderColor = preview.ring;
  });
}

// ---------- Settings panel ----------

function openSettingsPanel() {
  hideItemContextMenu();
  renderThemeRow();
  paintThemeSwatchPreviews();
  renderManageLists();
  el.settingsOverlay.classList.remove("hidden");
}

function closeSettingsPanel() {
  el.settingsOverlay.classList.add("hidden");
}

// ---------- Manage lists (reorder / rename / delete) ----------

function renderManageLists() {
  el.manageLists.innerHTML = "";
  state.lists.forEach((list, index) => {
    el.manageLists.appendChild(buildManageRow(list, index));
    if (expandedManageLists.has(list.id)) {
      el.manageLists.appendChild(buildManageItemsPanel(list));
    }
  });
}

function buildManageRow(list, index) {
  const row = document.createElement("div");
  row.className = "manage-row";
  row.draggable = true;
  row.dataset.index = String(index);

  const handle = document.createElement("span");
  handle.className = "manage-drag-handle";
  handle.textContent = "⠿";
  handle.title = "Drag to reorder";
  row.appendChild(handle);

  const emojiBtn = document.createElement("button");
  emojiBtn.type = "button";
  emojiBtn.className = "manage-emoji-btn";
  emojiBtn.textContent = list.emoji;
  emojiBtn.title = "Change emoji";
  emojiBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleEmojiPicker(row, list);
  });
  row.appendChild(emojiBtn);

  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.className = "manage-name-input";
  nameInput.value = list.name;
  nameInput.maxLength = 40;
  nameInput.addEventListener("change", async () => {
    const trimmed = nameInput.value.trim();
    list.name = trimmed || list.name;
    nameInput.value = list.name;
    await persist();
    renderTabs();
    renderToolbar();
    populateAddSelect();
  });
  row.appendChild(nameInput);

  const count = document.createElement("span");
  count.className = "manage-count";
  count.textContent = list.items.length;
  row.appendChild(count);

  const expandBtn = document.createElement("button");
  expandBtn.type = "button";
  expandBtn.className = "manage-expand-btn" + (expandedManageLists.has(list.id) ? " open" : "");
  expandBtn.innerHTML = "▾";
  expandBtn.title = "Show items";
  expandBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (expandedManageLists.has(list.id)) {
      expandedManageLists.delete(list.id);
    } else {
      expandedManageLists.add(list.id);
    }
    renderManageLists();
  });
  row.appendChild(expandBtn);

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "manage-delete-btn";
  deleteBtn.textContent = "✕";
  deleteBtn.title = "Delete list";
  deleteBtn.disabled = state.lists.length <= 1;
  deleteBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    deleteListById(list.id);
  });
  row.appendChild(deleteBtn);

  // Drag & drop reordering
  row.addEventListener("dragstart", (e) => {
    manageDragIndex = index;
    row.classList.add("dragging-row");
    e.dataTransfer.effectAllowed = "move";
  });
  row.addEventListener("dragend", () => {
    row.classList.remove("dragging-row");
    [...el.manageLists.children].forEach((c) => c.classList.remove("drag-over"));
  });
  row.addEventListener("dragover", (e) => {
    e.preventDefault();
    if (manageDragIndex === null || manageDragIndex === index) return;
    row.classList.add("drag-over");
  });
  row.addEventListener("dragleave", () => row.classList.remove("drag-over"));
  row.addEventListener("drop", async (e) => {
    e.preventDefault();
    row.classList.remove("drag-over");
    if (manageDragIndex === null || manageDragIndex === index) return;
    const [moved] = state.lists.splice(manageDragIndex, 1);
    state.lists.splice(index, 0, moved);
    manageDragIndex = null;
    await persist();
    renderManageLists();
    renderTabs();
    populateAddSelect();
  });

  return row;
}

function buildManageItemsPanel(list) {
  const panel = document.createElement("div");
  panel.className = "manage-items-panel";

  if (list.items.length === 0) {
    const empty = document.createElement("p");
    empty.className = "manage-items-empty";
    empty.textContent = "No items in this list yet.";
    panel.appendChild(empty);
    return panel;
  }

  list.items.forEach((item) => {
    const itemRow = document.createElement("div");
    itemRow.className = "manage-item-row";

    const name = document.createElement("span");
    name.className = "manage-item-name";
    name.textContent = item.name;
    name.title = item.name;
    itemRow.appendChild(name);

    const select = document.createElement("select");
    select.className = "manage-item-select";

    const placeholder = document.createElement("option");
    placeholder.textContent = "Move to…";
    placeholder.value = "";
    placeholder.disabled = true;
    placeholder.selected = true;
    select.appendChild(placeholder);

    state.lists
      .filter((l) => l.id !== list.id)
      .forEach((l) => {
        const opt = document.createElement("option");
        opt.value = l.id;
        opt.textContent = `${l.emoji} ${l.name}`;
        select.appendChild(opt);
      });

    select.addEventListener("change", async () => {
      const destId = select.value;
      if (!destId) return;
      await moveItem(list.id, item.id, destId);
    });
    itemRow.appendChild(select);

    panel.appendChild(itemRow);
  });

  return panel;
}

function toggleEmojiPicker(row, list) {
  const existing = row.nextElementSibling;
  if (existing && existing.classList.contains("emoji-picker-popover")) {
    existing.remove();
    return;
  }
  [...el.manageLists.querySelectorAll(".emoji-picker-popover")].forEach((p) => p.remove());

  const popover = document.createElement("div");
  popover.className = "emoji-picker-popover";

  const grid = document.createElement("div");
  grid.className = "emoji-picker-grid";
  EMOJI_OPTIONS.forEach((emoji) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "emoji-opt" + (emoji === list.emoji ? " selected" : "");
    btn.textContent = emoji;
    btn.addEventListener("click", async () => {
      list.emoji = emoji;
      await persist();
      renderManageLists();
      renderTabs();
      renderToolbar();
      populateAddSelect();
    });
    grid.appendChild(btn);
  });
  popover.appendChild(grid);

  const customRow = document.createElement("div");
  customRow.className = "emoji-custom-row";
  const customInput = document.createElement("input");
  customInput.type = "text";
  customInput.className = "emoji-custom-input";
  customInput.placeholder = "Or type any emoji…";
  customInput.maxLength = 8;
  customInput.addEventListener("change", async () => {
    const typed = customInput.value.trim();
    if (!typed) return;
    list.emoji = typed;
    await persist();
    renderManageLists();
    renderTabs();
    renderToolbar();
    populateAddSelect();
  });
  customRow.appendChild(customInput);
  popover.appendChild(customRow);

  row.after(popover);
}

async function deleteListById(listId) {
  if (state.lists.length <= 1) return;
  const list = state.lists.find((l) => l.id === listId);
  if (!list) return;
  const ok = confirm(`Delete "${list.name}" and everything in it?`);
  if (!ok) return;
  state.lists = state.lists.filter((l) => l.id !== listId);
  if (state.activeListId === listId) {
    state.activeListId = state.lists[0].id;
  }
  await persist();
  renderManageLists();
  renderTabs();
  renderToolbar();
  renderItems();
  populateAddSelect();
}

// ---------- Export / import data ----------

function buildExportText() {
  const lines = [];
  lines.push("SHOPLY DATA EXPORT");
  lines.push(`Exported: ${new Date().toLocaleString()}`);
  lines.push("=".repeat(40));
  lines.push("");

  state.lists.forEach((list) => {
    lines.push("=== LIST START ===");
    lines.push(`Name: ${list.name}`);
    lines.push(`Emoji: ${list.emoji}`);
    lines.push(`Items: ${list.items.length}`);
    lines.push("");
    list.items.forEach((item, idx) => {
      lines.push(`${idx + 1}. ${item.name}`);
      lines.push(`   Price: ${item.price || "—"}`);
      lines.push(`   URL: ${item.url}`);
      lines.push("");
    });
    lines.push("=== LIST END ===");
    lines.push("");
  });

  return lines.join("\n");
}

function downloadData() {
  const text = buildExportText();
  const blob = new Blob([text], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const dateStr = new Date().toISOString().slice(0, 10);
  const a = document.createElement("a");
  a.href = url;
  a.download = `shoply-export-${dateStr}.txt`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function parseImportText(text) {
  const lines = text.split(/\r?\n/);
  const parsedLists = [];
  let current = null;
  let currentItem = null;

  const flushItem = () => {
    if (current && currentItem && currentItem.name) {
      current.items.push(currentItem);
    }
    currentItem = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (line === "=== LIST START ===") {
      current = { name: "", emoji: "✦", items: [] };
      continue;
    }
    if (line === "=== LIST END ===") {
      flushItem();
      if (current && current.name && current.items.length >= 0) {
        parsedLists.push(current);
      }
      current = null;
      continue;
    }
    if (!current) continue;

    if (line.startsWith("Name:")) {
      current.name = line.slice(5).trim();
      continue;
    }
    if (line.startsWith("Emoji:")) {
      current.emoji = line.slice(6).trim() || "✦";
      continue;
    }
    if (line.startsWith("Items:")) continue;

    const itemMatch = line.match(/^(\d+)\.\s+(.*)$/);
    if (itemMatch) {
      flushItem();
      currentItem = {
        id: crypto.randomUUID(),
        name: itemMatch[2].trim(),
        price: "",
        image: "",
        url: "",
        domain: "",
        addedAt: Date.now()
      };
      continue;
    }
    if (currentItem && line.startsWith("Price:")) {
      const price = line.slice(6).trim();
      currentItem.price = price === "—" ? "" : price;
      continue;
    }
    if (currentItem && line.startsWith("URL:")) {
      currentItem.url = line.slice(4).trim();
      try {
        currentItem.domain = new URL(currentItem.url).hostname.replace(/^www\./, "");
      } catch {
        currentItem.domain = "";
      }
      continue;
    }
  }

  return parsedLists.filter((l) => l.name);
}

async function importDataFromText(text) {
  const parsedLists = parseImportText(text);
  if (parsedLists.length === 0) {
    setImportStatus("Couldn't find any Shoply lists in that file.", true);
    return;
  }

  let addedLists = 0;
  let addedItems = 0;

  parsedLists.forEach((parsed) => {
    let target = state.lists.find((l) => l.name.toLowerCase() === parsed.name.toLowerCase());
    if (!target) {
      target = makeList(parsed.name, parsed.emoji || "✦");
      state.lists.push(target);
      addedLists++;
    }
    parsed.items.forEach((item) => {
      const exists = item.url && target.items.some((it) => it.url === item.url);
      if (!exists) {
        target.items.push(item);
        addedItems++;
      }
    });
  });

  await persist();
  renderTabs();
  renderToolbar();
  renderItems();
  renderManageLists();
  populateAddSelect();
  setImportStatus(
    `Imported ${addedItems} item${addedItems === 1 ? "" : "s"} across ${parsedLists.length} list${parsedLists.length === 1 ? "" : "s"}` +
      (addedLists ? ` (${addedLists} new).` : "."),
    false
  );
}

function setImportStatus(text, isError) {
  el.importStatus.textContent = text;
  el.importStatus.style.color = isError ? "#C4432B" : "";
}

// ---------- New list form ----------

function buildEmojiRow() {
  el.emojiRow.innerHTML = "";
  EMOJI_OPTIONS.forEach((emoji, idx) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "emoji-opt" + (idx === 0 ? " selected" : "");
    btn.textContent = emoji;
    btn.addEventListener("click", () => {
      state.selectedEmoji = emoji;
      [...el.emojiRow.children].forEach((c) => c.classList.remove("selected"));
      btn.classList.add("selected");
      el.customEmojiInput.value = "";
    });
    el.emojiRow.appendChild(btn);
  });
  state.selectedEmoji = EMOJI_OPTIONS[0];

  el.customEmojiInput.addEventListener("input", () => {
    const typed = el.customEmojiInput.value.trim();
    if (typed) {
      state.selectedEmoji = typed;
      [...el.emojiRow.children].forEach((c) => c.classList.remove("selected"));
    } else {
      state.selectedEmoji = EMOJI_OPTIONS[0];
      el.emojiRow.children[0].classList.add("selected");
    }
  });
}

function toggleNewListForm(forceHide) {
  const shouldHide = forceHide === true || !el.newListForm.classList.contains("hidden");
  el.newListForm.classList.toggle("hidden", shouldHide);
  if (!shouldHide) {
    el.newListName.value = "";
    el.customEmojiInput.value = "";
    state.selectedEmoji = EMOJI_OPTIONS[0];
    [...el.emojiRow.children].forEach((c, idx) => c.classList.toggle("selected", idx === 0));
    el.newListName.focus();
  }
}

async function handleCreateList(evt) {
  evt.preventDefault();
  const name = el.newListName.value.trim();
  if (!name) return;
  const list = makeList(name, state.selectedEmoji);
  state.lists.push(list);
  state.activeListId = list.id;
  await persist();
  toggleNewListForm(true);
  renderTabs();
  renderToolbar();
  renderItems();
  populateAddSelect();
}

// ---------- Toolbar ----------

function renderToolbar() {
  const list = getActiveList();
  if (!list) return;
  el.activeListEmoji.textContent = list.emoji;
  el.activeListName.textContent = list.name;
  el.itemCount.textContent = list.items.length;
  el.modeIconBtn.classList.toggle("active", state.viewMode === "icon");
  el.modeLinkBtn.classList.toggle("active", state.viewMode === "link");
  el.deleteListBtn.classList.toggle("hidden", state.lists.length <= 1);
}

// ---------- Items ----------

function renderItems() {
  const list = getActiveList();
  if (!list) return;
  const hasItems = list.items.length > 0;

  el.emptyState.classList.toggle("hidden", hasItems);
  el.itemsGrid.classList.toggle("hidden", !hasItems || state.viewMode !== "icon");
  el.itemsList.classList.toggle("hidden", !hasItems || state.viewMode !== "link");

  if (!hasItems) return;

  if (state.viewMode === "icon") {
    el.itemsGrid.innerHTML = "";
    list.items.forEach((item) => el.itemsGrid.appendChild(buildCard(item, list.id)));
  } else {
    el.itemsList.innerHTML = "";
    list.items.forEach((item) => el.itemsList.appendChild(buildRow(item, list.id)));
  }
}

function buildCard(item, listId) {
  const card = document.createElement("div");
  card.className = "product-card";
  card.addEventListener("click", () => chrome.tabs.create({ url: item.url }));
  card.addEventListener("contextmenu", (e) => showItemContextMenu(e, listId, item));

  const punch = document.createElement("div");
  punch.className = "card-punch";
  card.appendChild(punch);

  const removeBtn = document.createElement("button");
  removeBtn.className = "card-remove";
  removeBtn.textContent = "✕";
  removeBtn.title = "Remove";
  removeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    removeItem(listId, item.id);
  });
  card.appendChild(removeBtn);

  const imgWrap = document.createElement("div");
  imgWrap.className = "card-image-wrap";
  if (item.image) {
    const img = document.createElement("img");
    img.src = item.image;
    img.alt = "";
    img.onerror = () => {
      imgWrap.innerHTML = '<span class="card-image-fallback">✦</span>';
    };
    imgWrap.appendChild(img);
  } else {
    imgWrap.innerHTML = '<span class="card-image-fallback">✦</span>';
  }
  card.appendChild(imgWrap);

  const body = document.createElement("div");
  body.className = "card-body";

  const name = document.createElement("p");
  name.className = "card-name";
  name.textContent = item.name;
  body.appendChild(name);

  const meta = document.createElement("div");
  meta.className = "card-meta";

  const price = document.createElement("span");
  price.className = "card-price" + (item.price ? "" : " empty");
  price.textContent = item.price || "No price";
  meta.appendChild(price);

  const domain = document.createElement("span");
  domain.className = "card-domain";
  domain.textContent = shortDomain(item.domain);
  meta.appendChild(domain);

  body.appendChild(meta);
  card.appendChild(body);

  return card;
}

function buildRow(item, listId) {
  const row = document.createElement("div");
  row.className = "product-row";
  row.addEventListener("click", () => chrome.tabs.create({ url: item.url }));
  row.addEventListener("contextmenu", (e) => showItemContextMenu(e, listId, item));

  const favicon = document.createElement("img");
  favicon.className = "row-favicon";
  favicon.src = `https://www.google.com/s2/favicons?sz=64&domain=${item.domain}`;
  favicon.alt = "";
  row.appendChild(favicon);

  const textWrap = document.createElement("div");
  textWrap.className = "row-text";

  const name = document.createElement("p");
  name.className = "row-name";
  name.textContent = item.name;
  textWrap.appendChild(name);

  const url = document.createElement("p");
  url.className = "row-url";
  url.textContent = item.url;
  textWrap.appendChild(url);

  row.appendChild(textWrap);

  if (item.price) {
    const price = document.createElement("span");
    price.className = "row-price";
    price.textContent = item.price;
    row.appendChild(price);
  }

  const removeBtn = document.createElement("button");
  removeBtn.className = "row-remove";
  removeBtn.textContent = "✕";
  removeBtn.title = "Remove";
  removeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    removeItem(listId, item.id);
  });
  row.appendChild(removeBtn);

  return row;
}

function shortDomain(domain) {
  return (domain || "").replace(/\.(com|net|org|co)$/i, "").split(".")[0];
}

async function removeItem(listId, itemId) {
  const list = state.lists.find((l) => l.id === listId);
  if (!list) return;
  list.items = list.items.filter((it) => it.id !== itemId);
  await persist();
  renderToolbar();
  renderItems();
}

async function moveItem(fromListId, itemId, toListId) {
  if (fromListId === toListId) return;
  const fromList = state.lists.find((l) => l.id === fromListId);
  const toList = state.lists.find((l) => l.id === toListId);
  if (!fromList || !toList) return;
  const idx = fromList.items.findIndex((it) => it.id === itemId);
  if (idx === -1) return;
  const [item] = fromList.items.splice(idx, 1);
  toList.items.unshift(item);
  await persist();
  renderToolbar();
  renderItems();
  renderManageLists();
}

// ---------- Right-click "move to list" menu ----------

function showItemContextMenu(e, listId, item) {
  e.preventDefault();
  e.stopPropagation();

  const menu = el.itemContextMenu;
  menu.innerHTML = "";

  const label = document.createElement("div");
  label.className = "context-menu-label";
  label.textContent = "Move to…";
  menu.appendChild(label);

  const others = state.lists.filter((l) => l.id !== listId);
  if (others.length === 0) {
    const empty = document.createElement("div");
    empty.className = "context-menu-empty";
    empty.textContent = "No other lists yet";
    menu.appendChild(empty);
  } else {
    others.forEach((list) => {
      const opt = document.createElement("button");
      opt.type = "button";
      opt.className = "context-menu-item";
      opt.textContent = `${list.emoji} ${list.name}`;
      opt.addEventListener("click", async () => {
        await moveItem(listId, item.id, list.id);
        hideItemContextMenu();
      });
      menu.appendChild(opt);
    });
  }

  menu.classList.remove("hidden");

  // Position at the cursor, then clamp so it stays inside the popup window.
  menu.style.left = "0px";
  menu.style.top = "0px";
  requestAnimationFrame(() => {
    const rect = menu.getBoundingClientRect();
    const maxLeft = Math.max(4, window.innerWidth - rect.width - 4);
    const maxTop = Math.max(4, window.innerHeight - rect.height - 4);
    menu.style.left = `${Math.min(e.clientX, maxLeft)}px`;
    menu.style.top = `${Math.min(e.clientY, maxTop)}px`;
  });
}

function hideItemContextMenu() {
  el.itemContextMenu.classList.add("hidden");
}

async function deleteActiveList() {
  if (state.lists.length <= 1) return;
  const list = getActiveList();
  const ok = confirm(`Delete "${list.name}" and everything in it?`);
  if (!ok) return;
  state.lists = state.lists.filter((l) => l.id !== list.id);
  state.activeListId = state.lists[0].id;
  await persist();
  renderTabs();
  renderToolbar();
  renderItems();
  populateAddSelect();
}

// ---------- Events ----------

function wireEvents() {
  el.addPageBtn.addEventListener("click", handleAddPage);
  el.cancelNewList.addEventListener("click", () => toggleNewListForm(true));
  el.newListForm.addEventListener("submit", handleCreateList);
  el.deleteListBtn.addEventListener("click", deleteActiveList);

  el.modeIconBtn.addEventListener("click", () => setViewMode("icon"));
  el.modeLinkBtn.addEventListener("click", () => setViewMode("link"));

  el.settingsToggle.addEventListener("click", openSettingsPanel);
  el.settingsClose.addEventListener("click", closeSettingsPanel);
  el.settingsOverlay.addEventListener("click", (e) => {
    if (e.target === el.settingsOverlay) closeSettingsPanel();
  });

  el.downloadDataBtn.addEventListener("click", downloadData);
  el.importDataBtn.addEventListener("click", () => el.importFileInput.click());
  el.importFileInput.addEventListener("change", async () => {
    const file = el.importFileInput.files && el.importFileInput.files[0];
    el.importFileInput.value = "";
    if (!file) return;
    setImportStatus("Importing…", false);
    try {
      const text = await file.text();
      await importDataFromText(text);
    } catch (err) {
      setImportStatus("Couldn't read that file.", true);
    }
  });

  wireTabsScrolling();
  wireContextMenuDismissal();
}

function wireContextMenuDismissal() {
  document.addEventListener("click", (e) => {
    if (!el.itemContextMenu.classList.contains("hidden") && !el.itemContextMenu.contains(e.target)) {
      hideItemContextMenu();
    }
  });
  document.addEventListener(
    "contextmenu",
    (e) => {
      if (!e.target.closest(".product-card") && !e.target.closest(".product-row")) {
        hideItemContextMenu();
      }
    },
    true
  );
  el.itemsWrap.addEventListener("scroll", hideItemContextMenu);
  window.addEventListener("blur", hideItemContextMenu);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") hideItemContextMenu();
  });
}

function setViewMode(mode) {
  if (state.viewMode === mode) return;
  state.viewMode = mode;
  persist();
  renderToolbar();
  renderItems();
}
