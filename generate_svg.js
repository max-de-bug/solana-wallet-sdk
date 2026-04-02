const fs = require('fs');
const { execSync } = require('child_process');

async function main() {
    console.log("Loading viz.js...");
    const { instance } = require('@viz-js/viz');

    console.log("Compiling architecture.dot to SVG...");
    const dotData = fs.readFileSync('architecture.dot', 'utf8');
    const viz = await instance();
    const svg = viz.renderString(dotData, { format: 'svg' });
    
    fs.writeFileSync('architecture.svg', svg);
    console.log("Successfully wrote architecture.svg");
    
    // clean up dot file
    fs.unlinkSync('architecture.dot');
}

main().catch(console.error);
