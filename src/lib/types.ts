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
	// Panel-side metadata advertised by biglace at connect-time.
	// Used by other peers to prefill the SSH user when targeting this device.
	os_user?: string;
}

export interface PreAuthKey {
	user: User;
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

export interface Route {
	id: string;
	node: Device;
	prefix: string;
	advertised: boolean;
	enabled: boolean;
	isPrimary: boolean;
	createdAt?: string;
	updatedAt?: string;
	deletedAt?: string;
}

export interface Policy {
	policy: string;
	updatedAt?: string;
}

export type InviteStatus = 'pending' | 'active' | 'used' | 'expired' | 'revoked';

export interface Invite {
	id: string;
	group: string | null;
	mutual: boolean;
	note: string;
	createdAt: string;
	expiresAt: string | null;
	maxUses: number;
	uses: { user: string; at: string }[];
	revokedAt?: string;
	inviter?: { user: string; device: string };
	status: InviteStatus;
}
