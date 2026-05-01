import { writable } from 'svelte/store';

export interface Toast {
	id: number;
	message: string;
	type: 'success' | 'error' | 'info';
}

export const toasts = writable<Toast[]>([]);

let _id = 0;
export function addToast(message: string, type: Toast['type'] = 'success', duration = 4000) {
	const id = ++_id;
	toasts.update((t) => [...t, { id, message, type }]);
	setTimeout(() => toasts.update((t) => t.filter((x) => x.id !== id)), duration);
}

export const theme = writable<'light' | 'dark'>('light');
