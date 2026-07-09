// ---------- Constants ----------

const EMOJI_OPTIONS = ["✦", "🛒", "👟", "🏡", "💻", "🎧", "📚", "🎁", "🧴", "🪴", "🐾", "✈️"];

const STORAGE_KEYS = {
  lists: "shoply_lists",
  activeList: "shoply_active_list",
  viewMode: "shoply_view_mode"
};

// ---------- State ----------

let state = {
  lists: [],
  activeListId: null,
  viewMode: "icon",
  currentTab: null,
  selectedEmoji: EMOJI_OPTIONS[0]
};

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
  settingsToggle: document.getElementById("settingsToggle")
};

// ---------- Init ----------

init();

async function init() {
  const stored = await chrome.storage.local.get([
    STORAGE_KEYS.lists,
    STORAGE_KEYS.activeList,
    STORAGE_KEYS.viewMode
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

  buildEmojiRow();
  renderTabs();
  renderToolbar();
  renderItems();
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
    [STORAGE_KEYS.viewMode]: state.viewMode
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
    });
    el.emojiRow.appendChild(btn);
  });
  state.selectedEmoji = EMOJI_OPTIONS[0];
}

function toggleNewListForm(forceHide) {
  const shouldHide = forceHide === true || !el.newListForm.classList.contains("hidden");
  el.newListForm.classList.toggle("hidden", shouldHide);
  if (!shouldHide) {
    el.newListName.value = "";
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

  el.settingsToggle.addEventListener("click", toggleNewListForm);
}

function setViewMode(mode) {
  if (state.viewMode === mode) return;
  state.viewMode = mode;
  persist();
  renderToolbar();
  renderItems();
}
