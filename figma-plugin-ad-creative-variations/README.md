# Ad Creative Variations – Figma Plugin

Generate ad creative variations from Asset Organizer Ad Copy output. Duplicates a selected frame and fills text layers with headline/description combinations.

## Setup

1. In Figma: **Plugins** → **Development** → **Import plugin from manifest…**
2. Select the `manifest.json` in this folder
3. The plugin appears under **Plugins** → **Development** → **Ad Creative Variations**

## Usage

1. **Generate copy** in Asset Organizer Ad Copy Generator (Google Ads RSA, Meta, etc.)
2. **Copy for Figma** in the Ad Copy results panel (copies JSON to clipboard)
3. In Figma: Create a frame with text layers named "Headline" and "Description"
4. Select the frame
5. Run **Ad Creative Variations**
6. Paste the JSON into the plugin’s JSON field (or paste headlines/descriptions line-by-line)
7. Click **Generate Variations**

The plugin duplicates the frame for each headline/description pair and updates the text layers.

## Layer names

- Default: `Headline` and `Description`
- Override in the plugin UI if your layers use different names

## Limits

- Max 50 variations per run
- Headlines and descriptions are matched in pairs (headline[i] + description[j])
