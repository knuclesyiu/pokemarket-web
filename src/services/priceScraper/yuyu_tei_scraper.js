/**
 * PokeMarket — Yuyu-Tei JP Price Scraper
 * Scrapes Japanese Pokemon card prices from yuyu-tei.jp
 * Updates Firestore `card_prices` with `jpPriceJpy` field.
 *
 * Usage: node src/services/priceScraper/yuyu_tei_scraper.js
 */

const { chromium } = require('playwright');

const CARDS_TO_SCRAPE = process.argv.slice(2);

// Firebase Admin (use existing firebase-tools credentials)
const admin = require('firebase-admin');
const serviceAccount = require('/home/user/.openclaw/workspace/pokemarket-sa.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

// Known Japanese name mappings for common cards
const JP_NAME_MAP = {
  'Charizard': 'リザードン',
  'Pikachu': ' Pikachu',  // keep space for exact match
  'Mewtwo': 'ミュウツー',
  'Mew': 'ミュウ',
  'Gengar': 'ゲンガー',
  'Giratina': 'ギラтина', // varies
  'Umbreon': 'umbraon',    // will use search
  'Espeon': 'エスプレオン',
  'Rayquaza': 'レックウザ',
  'Lugia': 'ルギア',
  'Arceus': 'アルセウス',
  'Snorlax': 'スリプル',
  'Eevee': 'イーブイ',
};

// Japanese set names on yuyu-tei for reference
const JP_SET_MAP = {
  'A2': '空間圧縮',
  'A4a': '強化拡張',
  'bwp': '黒い太子',
  'np': 'nome',
  'hgssp': 'HGSS',
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function searchCardPrice(browser, cardName) {
  const page = await browser.newPage();
  
  try {
    // Try English name search on yuyu-tei
    const searchUrl = `https://yuyu-tei.jp/buy/poc/s/search?search_word=${encodeURIComponent(cardName)}&rare=`;
    
    await page.goto(searchUrl, { 
      waitUntil: 'networkidle', 
      timeout: 15000 
    });
    
    await page.waitForTimeout(2000);
    
    // Extract prices from page
    const prices = await page.evaluate(() => {
      const text = document.body.innerText;
      // Japanese price format: number followed by 円
      const matches = text.match(/([\d,]+)円/g);
      return matches ? [...new Set(matches)].slice(0, 5) : [];
    });
    
    await page.close();
    return prices;
    
  } catch (e) {
    await page.close().catch(() => {});
    return [];
  }
}

async function getCardDetailPrice(browser, cardName) {
  // Try direct card search
  const page = await browser.newPage();
  
  try {
    // Try searching with both English and a broad category
    const searchTerms = [cardName, cardName.split(' ')[0]];
    
    for (const term of searchTerms) {
      const searchUrl = `https://yuyu-tei.jp/buy/poc/s/search?search_word=${encodeURIComponent(term)}`;
      
      await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 12000 });
      await page.waitForTimeout(1500);
      
      // Look for price in the page
      const result = await page.evaluate(() => {
        // Find all text nodes with prices
        const text = document.body.innerText;
        const priceMatches = text.match(/([\d,]+)円/g);
        const cardMatches = [...document.querySelectorAll('a')].filter(a => a.href.includes('/card/')).slice(0, 5);
        
        return {
          prices: priceMatches ? [...new Set(priceMatches)].slice(0, 5) : [],
          cardCount: cardMatches.length,
          firstCardName: cardMatches[0]?.innerText?.trim() || ''
        };
      });
      
      if (result.prices.length > 0) {
        await page.close();
        return result.prices;
      }
    }
    
    await page.close();
    return [];
    
  } catch (e) {
    await page.close().catch(() => {});
    return [];
  }
}

function parseJpyPrice(prices) {
  if (!prices || prices.length === 0) return null;
  
  // Extract numeric values from price strings like "80,000円" -> 80000
  const numericPrices = prices
    .map(p => parseInt(p.replace(/[,円]/g, ''), 10))
    .filter(n => n > 0 && n < 100000000); // sanity check < 100M JPY
  
  if (numericPrices.length === 0) return null;
  
  // Return the median price (most robust to outliers)
  numericPrices.sort((a, b) => a - b);
  const median = numericPrices[Math.floor(numericPrices.length / 2)];
  return median;
}

async function main() {
  console.log('Starting Yuyu-Tei JP Price Scraper...');
  
  // Get JP-only cards from Firestore (priceHkd = 0 or priceEur = 0)
  const cardsRef = db.collection('card_prices');
  
  let query;
  try {
    // Get all cards that have no price data
    query = await cardsRef.where('priceHkd', '==', 0).get();
  } catch (e) {
    // Fallback: get all and filter client-side
    const allDocs = await cardsRef.get();
    query = { docs: allDocs.docs.filter(d => d.get('priceHkd') === 0 || d.get('priceEur') === 0) };
  }
  
  const cardsToProcess = [];
  for (const doc of query.docs) {
    const d = doc.data();
    cardsToProcess.push({ id: doc.id, ...d });
  }
  
  console.log(`Cards to scrape: ${cardsToProcess.length}`);
  
  if (CARDS_TO_SCRAPE.length > 0) {
    // Process specific card IDs only
    console.log(`Processing specific cards: ${CARDS_TO_SCRAPE.join(', ')}`);
  }
  
  const browser = await chromium.launch({
    executablePath: '/usr/bin/chromium-browser',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });
  
  let processed = 0;
  let updated = 0;
  let failed = 0;
  let skipped = 0;
  
  for (const card of cardsToProcess) {
    if (CARDS_TO_SCRAPE.length > 0 && !CARDS_TO_SCRAPE.includes(card.id)) {
      skipped++;
      continue;
    }
    
    const cardName = card.name;
    const cardId = card.id;
    
    // Skip already updated (has jpPriceJpy)
    if (card.jpPriceJpy && card.jpPriceJpy > 0) {
      skipped++;
      continue;
    }
    
    console.log(`[${processed + 1}/${cardsToProcess.length}] Scraping: ${cardName} (${cardId})`);
    
    try {
      const prices = await getCardDetailPrice(browser, cardName);
      const jpyPrice = parseJpyPrice(prices);
      
      if (jpyPrice && jpyPrice > 0) {
        // Update Firestore
        await cardsRef.doc(cardId).update({
          jpPriceJpy: jpyPrice,
          jpPriceFetchedAt: admin.firestore.FieldValue.serverTimestamp(),
          jpPriceSource: 'yuyu-tei'
        });
        
        console.log(`  ✅ Updated: ${cardName} → ¥${jpyPrice.toLocaleString()}`);
        updated++;
      } else {
        console.log(`  ⚠️  No price found for: ${cardName}`);
        failed++;
      }
      
      processed++;
      await sleep(1500); // Rate limit to avoid blocking
      
    } catch (e) {
      console.log(`  ❌ Error scraping ${cardName}: ${e.message}`);
      failed++;
      processed++;
    }
    
    // Progress update every 20 cards
    if (processed % 20 === 0) {
      console.log(`\n📊 Progress: ${processed}/${cardsToProcess.length} | ✅ ${updated} updated | ❌ ${failed} failed\n`);
    }
  }
  
  await browser.close();
  
  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎉 SCRAPER COMPLETE

Cards processed: ${processed}
✅ Updated:      ${updated}
⚠️  No price:     ${failed}
⏭️  Skipped:      ${skipped}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  `);
  
  process.exit(0);
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});