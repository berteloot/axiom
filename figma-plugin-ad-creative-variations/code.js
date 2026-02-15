/**
 * Ad Creative Variations – Figma plugin
 * Duplicates the selected frame and fills text layers with headline/description variations.
 * Use with Asset Organizer Ad Copy Generator output (JSON or line-by-line).
 */

const HEADLINE_DEFAULT = 'Headline';
const DESC_DEFAULT = 'Description';

function findTextNodeByName(node, name) {
  if (!node) return null;
  if (node.type === 'TEXT' && node.name.toLowerCase().includes(name.toLowerCase())) {
    return node;
  }
  if ('children' in node) {
    for (const child of node.children) {
      const found = findTextNodeByName(child, name);
      if (found) return found;
    }
  }
  return null;
}

async function loadFontsForNode(node) {
  if (node.type === 'TEXT' && node.fontName !== figma.mixed) {
    await figma.loadFontAsync(node.fontName);
  }
  if ('children' in node) {
    for (const child of node.children) {
      await loadFontsForNode(child);
    }
  }
}

figma.ui.onmessage = async (msg) => {
  if (msg.type !== 'generate-variations') return;

  const { headlines, descriptions, headlineLayerName, descLayerName } = msg;

  const selection = figma.currentPage.selection;
  if (selection.length === 0) {
    figma.ui.postMessage({ type: 'result', error: 'Select a frame or component first.' });
    return;
  }

  const sourceNode = selection[0];
  if (sourceNode.type !== 'FRAME' && sourceNode.type !== 'COMPONENT' && sourceNode.type !== 'INSTANCE') {
    figma.ui.postMessage({ type: 'result', error: 'Selection must be a Frame, Component, or Instance.' });
    return;
  }

  const headlineName = headlineLayerName || HEADLINE_DEFAULT;
  const descName = descLayerName || DESC_DEFAULT;

  const headlineNode = findTextNodeByName(sourceNode, headlineName);
  const descNode = findTextNodeByName(sourceNode, descName);

  if (!headlineNode && !descNode) {
    figma.ui.postMessage({
      type: 'result',
      error: `No text layers found matching "${headlineName}" or "${descName}". Rename your text layers or update the layer names.`,
    });
    return;
  }

  const descs = descriptions && descriptions.length > 0 ? descriptions : [''];
  const totalVariations = Math.max(headlines.length * descs.length, headlines.length, descs.length);

  if (totalVariations > 50) {
    figma.ui.postMessage({ type: 'result', error: 'Too many variations (max 50). Reduce headlines/descriptions.' });
    return;
  }

  figma.currentPage.selection = [];
  let count = 0;
  const gap = 24;
  let offsetX = 0;
  let offsetY = 0;
  const width = sourceNode.width + gap;

  for (let h = 0; h < headlines.length; h++) {
    for (let d = 0; d < descs.length; d++) {
      const clone = sourceNode.clone();
      clone.x = sourceNode.x + offsetX;
      clone.y = sourceNode.y + offsetY;
      clone.name = `${sourceNode.name} ${count + 1}`;

      if (clone.x + clone.width > figma.viewport.bounds.x + figma.viewport.bounds.width + 2000) {
        offsetX = 0;
        offsetY += sourceNode.height + gap;
        clone.x = sourceNode.x;
        clone.y = sourceNode.y + offsetY;
      }

      figma.currentPage.appendChild(clone);

      const hNode = findTextNodeByName(clone, headlineName);
      const dNode = findTextNodeByName(clone, descName);

      if (hNode && hNode.type === 'TEXT' && headlines[h]) {
        const font = hNode.fontName !== figma.mixed ? hNode.fontName : { family: 'Inter', style: 'Regular' };
        await figma.loadFontAsync(font);
        hNode.characters = headlines[h];
      }
      if (dNode && dNode.type === 'TEXT' && descs[d]) {
        const font = dNode.fontName !== figma.mixed ? dNode.fontName : { family: 'Inter', style: 'Regular' };
        await figma.loadFontAsync(font);
        dNode.characters = descs[d];
      }

      offsetX += width;
      count++;

      if (count >= 50) break;
    }
    if (count >= 50) break;
  }

  figma.viewport.scrollAndZoomIntoView([sourceNode]);
  figma.ui.postMessage({ type: 'result', message: `Created ${count} variation(s).`, count });
};

figma.showUI(__html__, { width: 360, height: 420 });
