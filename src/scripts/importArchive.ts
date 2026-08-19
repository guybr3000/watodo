import path from 'path';
import fs from 'fs-extra';
import { config } from '../config.js';
import { parseExportFile, processExportedMessages } from '../parser/chatExportParser.js';

async function main() {
  console.log('🚀 Watodo Historical Archive Re-Processor');

  const kbDir = config.outputDir;
  console.log(`🧹 Cleaning previous Knowledge Base output directory: ${kbDir}...`);
  await fs.remove(kbDir);
  await fs.ensureDir(kbDir);

  const txtPath = path.resolve(process.cwd(), 'chat_export_temp/WhatsApp Chat with To Do.txt');

  if (!(await fs.pathExists(txtPath))) {
    console.error(`❌ Export text file not found at: ${txtPath}`);
    process.exit(1);
  }

  console.log(`📖 Reading export file: ${txtPath}...`);
  const entries = await parseExportFile(txtPath);
  console.log(`Found ${entries.length} valid messages in export file.`);

  console.log('⚡ Re-processing all items with updated X post enricher, GitHub API scraper & AI context engine...');
  const count = await processExportedMessages(entries);

  console.log(`\n🎉 Done! Successfully re-processed ${count} items into Knowledge Base.`);
}

main().catch(err => {
  console.error('Fatal error during import:', err);
  process.exit(1);
});
