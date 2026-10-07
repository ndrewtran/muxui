import type { APIRoute } from 'astro';
import { buildBlockFilterIndex } from '../../lib/blocks.ts';

export const prerender = true;

/** The rail's search terms and `uses` sets, derived from the catalog at build time. */
export const GET: APIRoute = () => Response.json(buildBlockFilterIndex());
