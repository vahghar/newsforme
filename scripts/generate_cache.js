// scripts/generate_cache.js
const fs = require('fs');
const path = require('path');

const CATEGORIES = ['tech', 'finance', 'world'];
const CACHE_DIR = path.join(__dirname, '..', 'cache');

// Ensure cache directory exists
if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
}

async function fetchAndCacheCategory(category) {
    console.log(`Starting generation for: ${category}`);
    try {
        // Call our own local API route
        // Note: Assuming the dev server is running on localhost:3000
        // If running in production, this should point to the absolute production URL
        const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
        const response = await fetch(`${baseUrl}/api/news?category=${category}&page=1`);

        if (!response.ok) {
            throw new Error(`API returned status ${response.status}`);
        }

        const data = await response.json();

        if (data.error) {
            throw new Error(data.error);
        }

        const filePath = path.join(CACHE_DIR, `news-${category}.json`);

        // Write the full JSON payload
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));

        console.log(`✅ Successfully cached ${category} news at: ${filePath}`);

    } catch (error) {
        console.error(`❌ Failed to cache ${category}:`, error.message);
    }
}

async function run() {
    console.log('--- Flario Morning Edition Cache Generator ---');
    // Run them sequentially to not overload the API/LLM tokens
    for (const cat of CATEGORIES) {
        await fetchAndCacheCategory(cat);
    }
    console.log('--- Generation Complete ---');
}

run();
