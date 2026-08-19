import axios from 'axios';
import * as cheerio from 'cheerio';

export interface XPostMetadata {
  url: string;
  statusId: string;
  authorName: string;
  authorHandle: string;
  tweetText: string;
  mediaUrls: string[];
}

export async function fetchXPostMetadata(url: string): Promise<XPostMetadata> {
  const statusIdMatch = url.match(/status\/(\d+)/);
  const statusId = statusIdMatch ? statusIdMatch[1] : '';

  // Standardize URL format for Twitter oEmbed API
  const canonicalUrl = statusId ? `https://twitter.com/i/status/${statusId}` : url;

  try {
    // 1. Fetch via Twitter official oEmbed endpoint (free, no API key required)
    const oembedUrl = `https://publish.twitter.com/oembed?url=${encodeURIComponent(canonicalUrl)}`;
    const response = await axios.get(oembedUrl, {
      timeout: 8000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Watodo/1.0'
      }
    });

    if (response.data && response.data.html) {
      const $ = cheerio.load(response.data.html);

      // Extract Tweet text from paragraph element inside blockquote
      const tweetText = $('p').text().trim();
      const authorName = response.data.author_name || '';
      const authorUrl = response.data.author_url || '';
      const authorHandle = authorUrl.split('/').pop() || '';

      if (tweetText) {
        return {
          url: canonicalUrl,
          statusId,
          authorName,
          authorHandle: authorHandle ? `@${authorHandle}` : '',
          tweetText,
          mediaUrls: []
        };
      }
    }
  } catch (error: any) {
    console.warn(`[X Enricher] oEmbed API fetch failed for ${url}: ${error.message}`);
  }

  // 2. Fallback: OpenGraph scraping from fixupx / fxtwitter / vxtwitter proxy APIs
  try {
    const vxUrl = canonicalUrl.replace(/https?:\/\/(x|twitter)\.com/, 'https://api.vxtwitter.com');
    const response = await axios.get(vxUrl, { timeout: 8000 });
    if (response.data && response.data.text) {
      return {
        url: canonicalUrl,
        statusId,
        authorName: response.data.user_name || 'X User',
        authorHandle: response.data.user_screen_name ? `@${response.data.user_screen_name}` : '',
        tweetText: response.data.text,
        mediaUrls: Array.isArray(response.data.media_extended) ? response.data.media_extended.map((m: any) => m.url) : []
      };
    }
  } catch (error: any) {
    console.warn(`[X Enricher] vxTwitter API fallback failed for ${url}: ${error.message}`);
  }

  return {
    url,
    statusId,
    authorName: 'X User',
    authorHandle: '',
    tweetText: `Post ID: ${statusId} (${url})`,
    mediaUrls: []
  };
}
