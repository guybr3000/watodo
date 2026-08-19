import { classifyContent } from '../classifier/contentClassifier.js';
import { fetchXPostMetadata } from '../enricher/xEnricher.js';
import { enrichWithAI } from '../enricher/aiEnricher.js';

async function test() {
  const url = 'https://x.com/i/status/2087652821701210558';
  console.log('Testing URL classification and enrichment:', url);

  const classified = classifyContent(url);
  console.log('Classified:', classified);

  const xMeta = await fetchXPostMetadata(url);
  console.log('X Metadata fetched:', xMeta);

  const aiEnriched = await enrichWithAI(classified, undefined, undefined, xMeta);
  console.log('AI Enriched Output:', JSON.stringify(aiEnriched, null, 2));
}

test().catch(console.error);
