'use strict';

import axios from 'axios';
import express from 'express';
import open from 'open';

// someone create PR and add dotenv pls (cannot be bothered)
const CLIENT_ID = '';
const CLIENT_SECRET = '';
const REDIRECT_URI = 'http://localhost:8888/callback';
const SCOPES = 'user-read-playback-state user-read-currently-playing';

const DISCORD_ENABLED = true;
const DISCORD_TOKEN = '';
const DISCORD_EMOJI = '';

let accessToken = null;
let refreshToken = null;
let tokenExpiresAt = null;

let currentSongId = null;
let lyricsData = null;
let currentLineIndex = -1;
let lastDiscordStatus = null;

/**
 * Updates Discord custom status with current lyric.
 * 
 * @param {String} text The text to display (lyric line or empty to clear)
 */

async function updateDiscordStatus(text) {
    if (!DISCORD_ENABLED || DISCORD_TOKEN === 'YOUR_DISCORD_TOKEN_HERE') {
        return;
    }

    const statusText = text ? `${DISCORD_EMOJI} ${text}` : '';

    if (statusText === lastDiscordStatus) {
        return;
    }

    try {
        const customStatus = text ? {
            text: statusText,
            emoji_name: DISCORD_EMOJI
        } : null;

        await axios.patch(
            'https://discord.com/api/v9/users/@me/settings',
            {
                custom_status: customStatus
            },
            {
                headers: {
                    'Authorization': DISCORD_TOKEN,
                    'Content-Type': 'application/json'
                }
            }
        );

        lastDiscordStatus = statusText;
        
        if (text) {
            console.log(`[DISCORD] Status updated: ${statusText}`);
        } else {
            console.log('[DISCORD] Status cleared');
        }
    } catch (error) {
        console.error('[DISCORD ERROR]', error.response?.data || error.message);
    }
}

/**
 * Starts a local Express server to handle Spotify OAuth callback.
 * 
 * @returns {Promise<void>} Callback for authorization 
 */

function startAuthServer() {
    return new Promise((resolve) => {
        const app = express();

        app.get('/callback', async (req, res) => {
            const code = req.query.code;

            if (!code) {
                res.send('Error: No code received');
                return;
            }

            try {
                const response = await axios.post('https://accounts.spotify.com/api/token',
                    new URLSearchParams({
                        grant_type: 'authorization_code',
                        code: code,
                        redirect_uri: REDIRECT_URI
                    }), {
                    headers: {
                        'Authorization': 'Basic ' + Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64'),
                        'Content-Type': 'application/x-www-form-urlencoded'
                    }
                }
                );

                accessToken = response.data.access_token;
                refreshToken = response.data.refresh_token;
                tokenExpiresAt = Date.now() + (response.data.expires_in * 1000);

                res.send('<h1>Authentication successful!</h1><p>You can close this window and return to the terminal.</p>');

                setTimeout(() => {
                    server.close();
                    resolve();
                }, 1000);

            } catch (error) {
                res.send('Error during authentication');
                console.error('Auth error:', error.message);
            }
        });

        const server = app.listen(8888, () => {
            const authUrl = `https://accounts.spotify.com/authorize?` +
                `client_id=${CLIENT_ID}&` +
                `response_type=code&` +
                `redirect_uri=${encodeURIComponent(REDIRECT_URI)}&` +
                `scope=${encodeURIComponent(SCOPES)}`;

            console.log('\n[!] Opening browser for Spotify authentication...\n');
            open(authUrl);
        });
    });
}

/**
 * Refreshes the Spotify access token using the refresh token.
 * 
 * @returns True if success, false if not
 */

async function refreshAccessToken() {
    if (!refreshToken) return false;

    try {
        const response = await axios.post('https://accounts.spotify.com/api/token',
            new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: refreshToken
            }), {
            headers: {
                'Authorization': 'Basic ' + Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64'),
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        }
        );

        accessToken = response.data.access_token;
        tokenExpiresAt = Date.now() + (response.data.expires_in * 1000);
        return true;
    } catch (error) {
        console.error('Token refresh failed:', error.message);
        return false;
    }
}

/**
 * Fetch the current playback state from Spotify API.
 * 
 * @returns The playback state from spotify including the current progress in the song, name, artist, id OR null if not playing/error
 */

async function getSpotifyPlaybackState() {
    if (!accessToken) return null;

    if (Date.now() >= tokenExpiresAt - 60000) {
        await refreshAccessToken();
    }

    try {
        const response = await axios.get('https://api.spotify.com/v1/me/player', {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        if (response.data && response.data.is_playing && response.data.item) {
            return {
                progress_ms: response.data.progress_ms,
                track: response.data.item.name,
                artist: response.data.item.artists[0].name,
                songId: response.data.item.id
            };
        }
    } catch (error) {
        if (error.response?.status === 401) {
            await refreshAccessToken();
        }
        return null;
    }
}

/**
 * Fetches synchronized lyrics from lrclib.net API.
 * 
 * @param {String} artist The artist of the song
 * @param {String} track  The 'name' of the song
 * @returns {Object|null} Returns lyrics data or null if not found
 */

async function fetchLyrics(artist, track) {
    try {
        const response = await axios.get('https://lrclib.net/api/search', {
            params: {
                artist_name: artist,
                track_name: track
            }
        });

        if (response.data && response.data.length > 0) {
            const trackData = response.data[0];

            if (trackData.syncedLyrics) {
                const lines = [];
                const lrcLines = trackData.syncedLyrics.split('\n');

                for (let i = 0; i < lrcLines.length; i++) {
                    const match = lrcLines[i].match(/\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/);
                    if (match) {
                        const minutes = parseInt(match[1]);
                        const seconds = parseInt(match[2]);
                        const centiseconds = parseInt(match[3].padEnd(2, '0').slice(0, 2));
                        const text = match[4].trim();

                        const startTime = (minutes * 60 + seconds) * 1000 + centiseconds * 10;

                        let endTime = startTime + 5000;
                        if (i < lrcLines.length - 1) {
                            const nextMatch = lrcLines[i + 1].match(/\[(\d{2}):(\d{2})\.(\d{2,3})\]/);
                            if (nextMatch) {
                                const nextMinutes = parseInt(nextMatch[1]);
                                const nextSeconds = parseInt(nextMatch[2]);
                                const nextCentiseconds = parseInt(nextMatch[3].padEnd(2, '0').slice(0, 2));
                                endTime = (nextMinutes * 60 + nextSeconds) * 1000 + nextCentiseconds * 10;
                            }
                        }

                        if (text) {
                            lines.push({ startTime, endTime, text });
                        }
                    }
                }

                return { lines };
            }
        }

        return null;
    } catch (error) {
        console.error('[ERROR] Failed to fetch lyrics:', error.message);
        return null;
    }
}

/**
 * Displays the current lyric line based on playback position.
 * 
 * @param {Number} progressMs Current playback position in milliseconds
 * @returns Returns nothing
 */

function displayCurrentLyric(progressMs) {
    if (!lyricsData || !lyricsData.lines.length) return;

    for (let i = 0; i < lyricsData.lines.length; i++) {
        const line = lyricsData.lines[i];

        if (progressMs >= line.startTime && progressMs < line.endTime) {
            if (currentLineIndex !== i) {
                currentLineIndex = i;
                console.log(`\n♪ ${line.text}`);
                
                updateDiscordStatus(line.text);
            }
            return;
        }
    }
}

/**
 * Monitors spotify playback and updates lyrics display.
 */

async function monitorSpotify() {
    const playback = await getSpotifyPlaybackState();

    if (playback) {
        if (playback.songId !== currentSongId) {
            console.log('\n' + '='.repeat(50));
            console.log(`[NEW SONG] ${playback.artist} - ${playback.track}`);
            console.log('='.repeat(50));

            currentSongId = playback.songId;
            currentLineIndex = -1;

            lyricsData = await fetchLyrics(playback.artist, playback.track);

            if (!lyricsData || !lyricsData.lines.length) {
                console.log('[INFO] No synchronized lyrics available for this song.\n');
                updateDiscordStatus('');
            } else {
                console.log(`[INFO] Loaded ${lyricsData.lines.length} lyric lines.\n`);
            }
        }

        if (lyricsData) {
            displayCurrentLyric(playback.progress_ms);
        }
    } else if (currentSongId) {
        console.log('\n[INFO] Playback stopped.\n');
        currentSongId = null;
        lyricsData = null;
        currentLineIndex = -1;

        updateDiscordStatus('');
    }
}

/**
 * Main application entry point.
 */

async function main() {

    if (CLIENT_ID === 'YOUR_CLIENT_ID_HERE') {
        console.error('Please set your CLIENT_ID and CLIENT_SECRET in the code!');
        console.log('\nGet them from: https://developer.spotify.com/dashboard');
        process.exit(1);
    }

    console.log('='.repeat(50));
    console.log('Spotify Lyrics Monitor with Discord Integration');
    console.log('='.repeat(50));
    
    if (DISCORD_ENABLED) {
        if (DISCORD_TOKEN === 'YOUR_DISCORD_TOKEN_HERE') {
            console.log('[WARNING] Discord token not set. Discord integration disabled.');
            console.log('[INFO] Set DISCORD_TOKEN to enable Discord status updates.\n');
        } else {
            console.log('[INFO] Discord integration enabled!\n');
        }
    } else {
        console.log('[INFO] Discord integration disabled.\n');
    }

    await startAuthServer();

    console.log('Authentication successful!');
    console.log('Monitoring Spotify playback...\n');

    setInterval(monitorSpotify, 500);
}

/**
 * Waits for INTERRUPT SIGNAL to gracefully exit and clear Discord status.
 */

process.on('SIGINT', async () => {
    console.log('\n\nShutting down...');
    
    if (DISCORD_ENABLED) {
        await updateDiscordStatus('');
    }
    
    process.exit(0);
});

main();