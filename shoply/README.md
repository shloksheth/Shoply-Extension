# Shoply

A personal Chrome extension for collecting products from any store — Amazon, Walmart, Target, or generic sites — into named, visual shopping lists.

## Install (unpacked, for personal use)

1. Unzip `shoply.zip` somewhere permanent (don't delete the folder after — Chrome loads the extension from it live).
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** (top right toggle).
4. Click **Load unpacked** and select the unzipped `shoply` folder.
5. Pin Shoply from the extensions toolbar icon (puzzle piece) so it's always visible.

## How it works

- **Add a product**: open any product page (Amazon, Walmart, Target, or basically any store), click the Shoply icon, pick a list from the dropdown in the "On this page" strip, and click **Add site**. Shoply reads the product name, price, and image straight off the page.
- **Create lists**: click the `+` chip under the header, name the list, pick an emoji, and hit **Create list**.
- **Switch lists**: click any chip in the row of tabs.
- **Icon mode**: grid of cards with product photo, name, price, and source site.
- **Link mode**: compact scrollable rows with name and full URL — good for quickly scanning or opening a lot of links.
- Click any card or row to open that product in a new tab. Hover to reveal the ✕ to remove it.
- Delete an entire list with the small "Delete this list" link (only shows when you have more than one list).

## Notes on extraction

Amazon, Walmart, and Target get dedicated selectors for name/price/image. Any other store falls back to Open Graph / meta tags (`og:title`, `og:image`, `product:price:amount`, etc.), which most modern shopping sites support — so "any store page" should work, though price detection on unusual sites is best-effort.

Everything is stored locally on your machine via `chrome.storage.local` — nothing leaves your browser.
