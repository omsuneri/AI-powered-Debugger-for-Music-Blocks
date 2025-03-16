const fs = require('fs');

function convertMusicBlocks(inputFile, outputFile) {
    const data = JSON.parse(fs.readFileSync(inputFile, 'utf8'));

    if (!Array.isArray(data)) {
        console.log("Invalid JSON format: Expected a list at the root.");
        return;
    }

    if (data.length === 0) {
        console.log("Warning: No blocks found in input.json!");
        return;
    }

    console.log(`Loaded ${data.length} blocks from JSON.`); // Debugging info

    const blockMap = Object.fromEntries(data.map(block => [block[0], block])); // Map block IDs to their data
    const rootBlock = data[0]; // Assume first block is the root

    // Get metadata for the first "Start" block
    const metadata = extractMetadata(rootBlock);
    const outputLines = [`Start of Project`];

    const visited = new Set();
    outputLines.push(...processBlock(rootBlock, blockMap, visited, 1, false));

    fs.writeFileSync(outputFile, outputLines.join('\n'));
    console.log("Conversion complete. Check output.txt!");
}

function processBlock(block, blockMap, visited, indent = 0, isClamp = false) {
    const output = [];
    const blockId = block[0];

    if (visited.has(blockId)) {
        return output; // Prevent cycles
    }

    visited.add(blockId);

    let blockType = block[1];
    if (Array.isArray(blockType)) { // Extract block type if stored as a list
        blockType = blockType[0];
    }

    // Skip vspace and hidden blocks
    if (blockType === "vspace" || blockType === "hidden") {
        const connections = Array.isArray(block[block.length - 1]) ? block[block.length - 1] : [];
        for (const childId of connections) {
            if (blockMap[childId]) {
                output.push(...processBlock(blockMap[childId], blockMap, visited, indent, isClamp));
            }
        }
        return output;
    }

    // Skip Number blocks completely (Updated)
    if (blockType === "number") {
        return output; // Remove number blocks entirely
    }

    // Generate block output with metadata if it's a "Start" block
    let blockName = formatBlockName(blockType, block, blockMap);
    if (blockType === "start") {
        const metadata = extractMetadata(block);
        blockName += ` → {${metadata}}`;
    }

    const prefix = (isClamp ? "│   ".repeat(indent - 1) + "│   ├── " : "│   ".repeat(indent) + "├── ");
    output.push(`${prefix}${blockName}`);

    const connections = Array.isArray(block[block.length - 1]) ? block[block.length - 1] : [];

    // Process clamp connections (inside the parent block)
    for (const childId of connections.slice(0, -1)) { // All except the last are clamp connections
        if (blockMap[childId]) {
            // Skip voicename block for settimbre
            if (blockType === "settimbre" && blockMap[childId][1][0] === "voicename") {
                continue; // Skip voicename block
            }
            output.push(...processBlock(blockMap[childId], blockMap, visited, indent + 1, true));
        }
    }

    // Process block-to-block connections (sequential, not nested)
    if (connections.length > 0 && connections[connections.length - 1] !== null) {
        const childId = connections[connections.length - 1];
        if (blockMap[childId]) {
            output.push(...processBlock(blockMap[childId], blockMap, visited, indent, false));
        }
    }

    return output;
}

function formatBlockName(blockType, block, blockMap) {
    if (blockType === "settimbre") {
        let instrumentName = "Unknown";
        const connections = block[block.length - 1] || [];
        for (const childId of connections) {
            if (blockMap[childId] && blockMap[childId][1][0] === "voicename") {
                instrumentName = blockMap[childId][1][1]?.value || "Unknown";
                break;
            }
        }
        return instrumentName !== "Unknown" ? `Set Instrument → ${instrumentName}` : null;
    } else if (blockType === "newnote") {
        return "Note";
    } else if (blockType === "divide") {
        const connections = block[block.length - 1] || [];
        const numbers = connections.map(childId => blockMap[childId]?.[1][1]?.value).filter(v => v !== undefined);
        return numbers.length === 2 ? `Divider Block → ${numbers[0]} / ${numbers[1]} = ${numbers[0] / numbers[1]}` : "Divider Block";
    } else if (blockType === "multiply") {
        const connections = block[block.length - 1] || [];
        const numbers = connections.map(childId => blockMap[childId]?.[1][1]?.value).filter(v => v !== undefined);
        return numbers.length > 0 ? `Multiply → ${numbers.join(' * ')}` : "Multiply"; // Updated formatting
    } else if (blockType === "pitch") {
        return "Pitch Calculation";
    } else if (blockType === "solfege") {
        return block[1][1]?.value ? `Solfege: ${block[1][1].value}` : "Solfege";
    } else {
        return blockType.charAt(0).toUpperCase() + blockType.slice(1);
    }
}

function extractMetadata(block) {
    if (!block || typeof block[1] !== "object") return "";
    const metadataSource = Array.isArray(block[1]) ? block[1][1] : block[1];
    if (!metadataSource || typeof metadataSource !== "object") {
        return "No metadata";
    }
    const properties = ["id", "xcor", "ycor", "heading", "color", "shade", "pensize", "grey"];
    const metadata = properties.filter(key => key in metadataSource).map(key => `${key}: ${metadataSource[key]}`).join(", ");
    return metadata || "No metadata";
}

// Run the converter
convertMusicBlocks("input.json", "output.txt");
