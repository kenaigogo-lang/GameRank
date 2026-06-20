
const PROXY_URL = "https://corsproxy.io/?";
const CLIENT_ID = "mbg8bt1y5si0axlkowfc1xs5crf1zw";
const CLIENT_SECRET = "e7zvesgcxgiy94ovthixzqrgloe4mi";
const AUTH_URL = "https://id.twitch.tv/oauth2/token";
const IGDB_API_URL = "https://api.igdb.com/v4/games";

// Google Custom Search Config
const GOOGLE_API_KEY = "AIzaSyB3ewWWi1ssbLEg5qxf07yt4IBhMIuBudE"; // Dedicated Custom Search API Key
const GOOGLE_CX = "e6d2925d2004145f2";
const GOOGLE_SEARCH_URL = "https://www.googleapis.com/customsearch/v1";

// Steam API via Proxy
// Using l=tchinese and cc=TW for best Chinese search results
const STEAM_SEARCH_URL = "https://store.steampowered.com/api/storesearch/?l=tchinese&cc=TW&term=";

// Wikipedia API via Proxy
const WIKI_API_URL = "https://zh.wikipedia.org/w/api.php?action=query&format=json&prop=langlinks&lllang=en&titles=";

// Storage keys
const TOKEN_KEY = 'igdb_access_token';
const EXPIRY_KEY = 'igdb_token_expiry';

interface IGDBAuthResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

// Internal IGDB Raw Type
interface IGDBGameRaw {
  id: number;
  name: string;
  cover?: { url: string };
  screenshots?: { url: string }[];
}

// Unified Game Interface for UI
export interface UnifiedGame {
  id: string | number;
  name: string;
  coverUrl: string;
  source: 'STEAM' | 'IGDB' | 'GOOGLE';
}

// --- IGDB Auth ---
export const getIgdbAccessToken = async (): Promise<string> => {
  const cachedToken = localStorage.getItem(TOKEN_KEY);
  const expiry = localStorage.getItem(EXPIRY_KEY);

  if (cachedToken && expiry && Date.now() < Number(expiry)) {
    return cachedToken;
  }

  const targetUrl = `${AUTH_URL}?client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}&grant_type=client_credentials`;
  
  try {
    const response = await fetch(`${PROXY_URL}${encodeURIComponent(targetUrl)}`, {
      method: 'POST',
    });

    if (!response.ok) {
      throw new Error(`Auth failed: ${response.statusText}`);
    }

    const data: IGDBAuthResponse = await response.json();
    const expiresAt = Date.now() + (data.expires_in * 1000) - 60000;
    
    localStorage.setItem(TOKEN_KEY, data.access_token);
    localStorage.setItem(EXPIRY_KEY, expiresAt.toString());

    return data.access_token;
  } catch (error) {
    console.error("IGDB Auth Error:", error);
    throw error;
  }
};

// --- Helper: Get High Res IGDB URL ---
const getHighResIgdbUrl = (url: string): string => {
  if (!url) return '';
  const cleanUrl = url.startsWith('//') ? `https:${url}` : url;
  return cleanUrl.replace('t_thumb', 't_720p');
};

// --- 1. Steam Search ---
export const searchSteamGames = async (query: string): Promise<UnifiedGame[]> => {
  try {
    const targetUrl = `${STEAM_SEARCH_URL}${encodeURIComponent(query)}`;
    const response = await fetch(`${PROXY_URL}${encodeURIComponent(targetUrl)}`);
    const data = await response.json();

    if (data.total > 0 && data.items) {
      return data.items.map((item: any) => ({
        id: `steam-${item.id}`,
        name: item.name,
        // Try to construct the vertical library image (600x900)
        // Fallback to tiny_image or header if needed, but library is best for covers
        coverUrl: `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${item.id}/library_600x900.jpg`,
        source: 'STEAM'
      }));
    }
    return [];
  } catch (error) {
    console.error("Steam Search Error:", error);
    return [];
  }
};

// --- 2. Wikipedia Translation (CN -> EN) ---
export const getWikiEnglishTitle = async (query: string): Promise<string | null> => {
  try {
    const targetUrl = `${WIKI_API_URL}${encodeURIComponent(query)}`;
    const response = await fetch(`${PROXY_URL}${encodeURIComponent(targetUrl)}`);
    const data = await response.json();
    
    const pages = data.query?.pages;
    if (!pages) return null;

    const pageId = Object.keys(pages)[0];
    if (pageId === '-1') return null; // Not found

    const langlinks = pages[pageId].langlinks;
    if (langlinks && langlinks.length > 0) {
      // Return the English title found in langlinks
      return langlinks[0]['*'];
    }
    
    return null;
  } catch (error) {
    console.error("Wiki Translation Error:", error);
    return null;
  }
};

// --- 3. IGDB Search ---
const searchIgdbInternal = async (query: string): Promise<UnifiedGame[]> => {
  try {
    const token = await getIgdbAccessToken();
    // Escape quotes to prevent syntax errors
    const sanitizedQuery = query.replace(/"/g, '\\"');
    
    const body = `search "${sanitizedQuery}"; fields name, cover.url; limit 20; where cover != null;`;

    const response = await fetch(`${PROXY_URL}${encodeURIComponent(IGDB_API_URL)}`, {
      method: 'POST',
      headers: {
        'Client-ID': CLIENT_ID,
        'Authorization': `Bearer ${token}`,
      },
      body: body
    });

    if (!response.ok) throw new Error(`IGDB Search failed`);

    const results: IGDBGameRaw[] = await response.json();
    
    return results.map(g => ({
      id: `igdb-${g.id}`,
      name: g.name,
      coverUrl: getHighResIgdbUrl(g.cover?.url || ''),
      source: 'IGDB'
    }));
  } catch (error) {
    console.error("IGDB Search Error:", error);
    return [];
  }
};

// --- 4. Google Custom Search ---
const searchGoogleImages = async (query: string): Promise<UnifiedGame[]> => {
  try {
    
    // Restrict search to specific high-quality gaming sites (Bahamut GNN, Nintendo TW)
    const advancedQuery = `${query} (site:gnn.gamer.com.tw OR site:nintendo.tw)`;
    const url = `${GOOGLE_SEARCH_URL}?key=${GOOGLE_API_KEY}&cx=${GOOGLE_CX}&q=${encodeURIComponent(advancedQuery)}&searchType=image&num=10`;

    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok) {
        console.error("[Google Search] API Error:", data.error?.message || response.statusText);
        return [];
    }

    if (data.items) {
      return data.items.map((item: any, index: number) => ({
        id: `google-${index}`,
        name: item.title || query,
        coverUrl: item.link,
        source: 'GOOGLE'
      }));
    }
    
    return [];
  } catch (error) {
    console.error("Google Search Network Error:", error);
    return [];
  }
};

// --- MAIN: Unified Search Strategy ---
export const searchUnifiedGames = async (query: string): Promise<UnifiedGame[]> => {
  // Strategy:
  // Execute ALL searches in PARALLEL and combine results.
  
  // 1. Steam Promise
  const steamPromise = searchSteamGames(query);

  // 2. IGDB Promise (with Wiki translation)
  const igdbPromise = (async () => {
      let searchTerm = query;
      // If the query contains Chinese characters, try to translate
      if (/[\u4e00-\u9fa5]/.test(query)) {
         const translatedTitle = await getWikiEnglishTitle(query);
         if (translatedTitle) {
           console.log(`Translated "${query}" to "${translatedTitle}"`);
           searchTerm = translatedTitle;
         }
      }
      return searchIgdbInternal(searchTerm);
  })();

  // 3. Google Promise
  const googlePromise = searchGoogleImages(query);

  // 4. Wait for all
  const [steamResults, igdbResults, googleResults] = await Promise.all([
    steamPromise, 
    igdbPromise,
    googlePromise
  ]);

  // 5. Return Combined Results
  // Order: Steam -> IGDB -> Google
  return [...steamResults, ...igdbResults, ...googleResults];
};
