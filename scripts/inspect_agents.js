const fs = require('fs');
const data = JSON.parse(fs.readFileSync('./cache/asi_agents.json'));
const targets = data.agents.filter(a => a.name.includes('Tavily') || a.name.includes('AIRIS'));
let output = '';
targets.forEach(t => {
    output += '--- ' + t.name + ' ---\n';
    output += 'Address: ' + t.address + '\n';
    output += 'Readme:\n' + t.readme + '\n\n';
});
fs.writeFileSync('./scripts/agent_readmes.txt', output);
