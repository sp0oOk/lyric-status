# Spotify Lyrics Monitor with Discord Status Integration

This project lets you display the **currently playing Spotify song’s synced lyrics** in your console — and optionally sets your **Discord custom status** to the current lyric line in real time.  
It uses the Spotify Web API, [LRCLib](https://lrclib.net/) for lyrics, and the Discord API.

## Requirements

- [Node.js](https://nodejs.org/) (v18 or newer recommended)
- A [Spotify Developer Account](https://developer.spotify.com/dashboard)
- A Discord user token *(optional but required for status integration)*

## Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/spotify-lyrics-discord.git
   cd spotify-lyrics-discord
   ```

2. **Install dependencies**
    ```bash
    npm install
    ```
3. **Set configuration fields**
    ```js
    const CLIENT_ID = 'your_spotify_client_id';
    const CLIENT_SECRET = 'your_spotify_client_secret';
    const DISCORD_TOKEN = 'your_discord_token';
    const DISCORD_EMOJI = '🎶'; // optional
    ```
4. **Run**
    ```bash
    node index.js
    ```

This application was inspired by [Lyric Status](https://github.com/OvalQuilter/lyrics-status), but for some reason I couldn't get it to work for me (probably just a me issue), so created this as hopefully a quicker to use alternative.
