const fs = require('fs');
const path = require('path');

const API_KEY = 'sk_c279612f4b774695ae31c2e9b24d70a7fc78d62564ca4af78f649f233df8f838';
// We'll use the actual Agentverse Search API
const ENDPOINT = 'https://agentverse.ai/v1/search/agents';

async function fetchAgents() {
    console.log(`Fetching available agents/models from Agentverse...`);
    try {
        const response = await fetch(ENDPOINT, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                search_text: "",
                limit: 250
            })
        });

        if (!response.ok) {
            throw new Error(`API returned status ${response.status}: ${await response.text()}`);
        }

        const data = await response.json();

        // Save to cache directory
        const outputDir = path.join(__dirname, '..', 'cache');
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        const outputPath = path.join(outputDir, 'asi_agents.json');
        fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));

        console.log(`✅ Successfully saved agents list to ${outputPath}`);

    } catch (error) {
        console.error(`❌ Failed to fetch agents:`, error.message);
    }
}

fetchAgents();
