# Boox Sync

Sync handwritten notes from your Onyx Boox device to Obsidian via BooxDrop.

## Features

- Scans your Boox device for exported PDF and PNG notes
- Shows new and changed notes in a selection dialog before syncing
- Preserves notebook folder structure in your vault (optional)
- Incremental sync, only downloads files that are new or have changed

## Setup

1. Install the plugin from Community Plugins.
2. Open **Settings → Boox Sync**.
3. Enter your Boox device's IP address (shown in the BooxDrop app on your device).
4. Make sure both devices are on the same WiFi network.

## Usage

- Click the tablet icon in the left ribbon, or
- Run **"Sync Boox Notes"** from the Command Palette.

A dialog lists all new and changed notes. Select which ones to sync and click **Sync Selected**.

On your Boox, export notes as PDF or PNG from the Notes app before syncing.

## Installation

### From Community Plugins

Search for "Boox Sync" in Obsidian's Community Plugins browser and install it.

### Manual

Copy `main.js`, `manifest.json`, and `styles.css` to your vault at `.obsidian/plugins/boox-sync/`.

## Support

For issues or suggestions, [open an issue](https://github.com/sky150/obsidian-boox-sync/issues).

If you find this plugin useful, consider [buying me a coffee](https://www.buymeacoffee.com/sky150).

## License

MIT
