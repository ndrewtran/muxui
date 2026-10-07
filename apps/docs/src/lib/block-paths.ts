/** The Blocks routes. A block's variant owns one page and one isolated preview route. */
export const blocksPath = '/blocks/';
export const blockPath = (block: { slug: string }) => `${blocksPath}${block.slug}/`;
export const variantPath = (block: { slug: string }, variant: { slug: string }) => `${blockPath(block)}${variant.slug}/`;
export const previewPath = (block: { slug: string }, variant: { slug: string }) => `${variantPath(block, variant)}preview/`;
