import { BIGSCALE_PUBLIC_URL } from './config.js';

/**
 * Public address of this panel, for invite links. Usually the same host as
 * the coordinator (nginx routes both); BIGSCALE_PANEL_URL overrides it when
 * the panel is published elsewhere.
 */
export const PANEL_PUBLIC_URL = (process.env.BIGSCALE_PANEL_URL || BIGSCALE_PUBLIC_URL).replace(/\/$/, '');
