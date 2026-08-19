import axios from 'axios';
import * as cheerio from 'cheerio';
import TurndownService from 'turndown';

export interface ArticleMetadata {
  url: string;
  title: string;
  description: string;
  siteName: string;
  author: string;
  contentMarkdown: string;
  publishedTime?: string;
}

export async function scrapeArticleMetadata(url: string): Promise<ArticleMetadata> {
  const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });

  try {
    const response = await axios.get(url, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Watodo/1.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
      }
    });

    const html = response.data;
    const $ = cheerio.load(html);

    // Extract title
    const title =
      $('meta[property="og:title"]').attr('content') ||
      $('meta[name="twitter:title"]').attr('content') ||
      $('title').text().trim() ||
      url;

    // Extract description
    const description =
      $('meta[property="og:description"]').attr('content') ||
      $('meta[name="description"]').attr('content') ||
      $('meta[name="twitter:description"]').attr('content') ||
      '';

    // Extract site name & author
    const siteName = $('meta[property="og:site_name"]').attr('content') || new URL(url).hostname;
    const author = $('meta[name="author"]').attr('content') || $('meta[property="article:author"]').attr('content') || '';

    // Remove noise elements before markdown conversion
    $('script, style, nav, footer, iframe, header, noscript, .ad, .ads, .social-share').remove();

    // Select main article container if available
    const mainContainer = $('article, main, .post-content, .article-body, #content').first();
    const rawHtmlContent = mainContainer.length ? mainContainer.html() || '' : $('body').html() || '';

    let contentMarkdown = turndown.turndown(rawHtmlContent);

    // Clean up excessive whitespace
    contentMarkdown = contentMarkdown.replace(/\n{3,}/g, '\n\n').trim();

    if (contentMarkdown.length > 8000) {
      contentMarkdown = contentMarkdown.substring(0, 8000) + '\n\n... (Article text truncated for AI processing)';
    }

    return {
      url,
      title,
      description,
      siteName,
      author,
      contentMarkdown: contentMarkdown || description
    };
  } catch (error: any) {
    return {
      url,
      title: url,
      description: `Failed to scrape web page: ${error.message}`,
      siteName: new URL(url).hostname,
      author: '',
      contentMarkdown: `Scrape error: ${error.message}`
    };
  }
}
