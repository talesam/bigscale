export interface User {
	id: string;
	name: string;
	email?: string;
	createdAt?: string;
}

export interface Device {
	id: string;
	name: string;
	givenName: string;
	lastSeen: string;
	ipAddresses: string[];
	forcedTags?: string[];
	validTags?: string[];
	user: User;
	online?: boolean;
	expiry?: string;
}

export interface PreAuthKey {
	user: string;
	id: string;
	key: string;
	createdAt: string;
	expiration: string;
	reusable: boolean;
	ephemeral: boolean;
	used: boolean;
}

export interface ApiKey {
	id: string;
	prefix: string;
	expiration: string;
	createdAt: string;
	lastSeen: string;
}
