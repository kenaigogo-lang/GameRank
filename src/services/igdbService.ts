
const PROXY_URL = "https://corsproxy.io/?";
const CLIENT_ID = import.meta.env.VITE_IGDB_CLIENT_ID;
const CLIENT_SECRET = import.meta.env.VITE_IGDB_CLIENT_SECRET;
const AUTH_URL = "https://id.twitch.tv/oauth2/token";
const IGDB_API_URL = "https://api.igdb.com/v4/games";

// Google Custom Search Config
const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_API_KEY;
const GOOGLE_CX = import.meta.env.VITE_GOOGLE_CX;
const GOOGLE_SEARCH_URL = "https://www.googleapis.com/customsearch/v1";

const STEAM_SEARCH_URL = "https://store.steampowered.com/api/storesearch/?l=tchinese&cc=TW&term=";
const WIKI_API_URL = "https://zh.wikipedia.org/w/api.php?action=query&format=json&prop=langlinks&lllang=en&titles=";

const TOKEN_KEY = 'igdb_access_token';
const EXPIRY_KEY = 'igdb_token_expiry';

interface IGDBAuthResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

interface IGDBGameRaw {
  id: number;
  name: string;
  cover?: { url: string };
  screenshots?: { url: string }[];
}

export interface UnifiedGame {
  id: string | number;
  name: string;
  coverUrl: string;
  source: 'STEAM' | 'IGDB' | 'GOOGLE';
}

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

const getHighResIgdbUrl = (url: string): string => {
  if (!url) return '';
  const cleanUrl = url.startsWith('//') ? `https:${url}` : url;
  return cleanUrl.replace('t_thumb', 't_720p');
};

export const searchSteamGames = async (query: string): Promise<UnifiedGame[]> => {
  try {
    const targetUrl = `${STEAM_SEARCH_URL}${encodeURIComponent(query)}`;
    const response = await fetch(`${PROXY_URL}${encodeURIComponent(targetUrl)}`);
    const data = await response.json();

    if (data.total > 0 && data.items) {
      return data.items.map((item: any) => ({
        id: `steam-${item.id}`,
        name: item.name,
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

export const getWikiEnglishTitle = async (query: string): Promise<string | null> => {
  try {
    const targetUrl = `${WIKI_API_URL}${encodeURIComponent(query)}`;
    const response = await fetch(`${PROXY_URL}${encodeURIComponent(targetUrl)}`);
    const data = await response.json();
    
    const pages = data.query?.pages;
    if (!pages) return null;

    const pageId = Object.keys(pages)[0];
    if (pageId === '-1') return null;

    const langlinks = pages[pageId].langlinks;
    if (langlinks && langlinks.length > 0) {
      return langlinks[0]['*'];
    }
    
    return null;
  } catch (error) {
    console.error("Wiki Translation Error:", error);
    return null;
  }
};

const searchIgdbInternal = async (query: string): Promise<UnifiedGame[]> => {
  try {
    const token = await getIgdbAccessToken();
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

const searchGoogleImages = async (query: string): Promise<UnifiedGame[]> => {
  try {
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

export const searchUnifiedGames = async (query: string): Promise<UnifiedGame[]> => {
  const steamPromise = searchSteamGames(query);

  const igdbPromise = (async () => {
      let searchTerm = query;
      if (/[\u4e00-\u9fa5]/.test(query)) {
         const translatedTitle = await getWikiEnglishTitle(query);
         if (translatedTitle) {
           console.log(`Translated "${query}" to "${translatedTitle}"`);
           searchTerm = translatedTitle;
         }
      }
      return searchIgdbInternal(searchTerm);
  })();

  const googlePromise = searchGoogleImages(query);

  const [steamResults, igdbResults, googleResults] = await Promise.all([
    steamPromise, 
    igdbPromise,
    googlePromise
  ]);

  return [...steamResults, ...igdbResults, ...googleResults];
};