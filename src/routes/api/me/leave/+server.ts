import { json } from '@sveltejs/kit';
import { getAccount, keepAccount } from '$lib/server/account-store.js';
import { deleteNode, nodesOf, purgeIfEmpty } from '$lib/server/accounts.js';
import { jsonBody, requireMember } from '$lib/server/member.js';
import type { RequestHandler } from './$types';

// POST /api/me/leave { delete_account?: boolean }
//   → { device_removed: true, account_deleted: boolean, account_kept: boolean }
//
// Called by BigLace over the tailnet when its owner signs out: the device is
// removed from the network (so its name is free for the next install), and:
//   - by default an invite-made account is kept for KEEP_DAYS, so the person
//     can come back under the same name (reclaim secret);
//   - with delete_account, the account goes too when this was its last
//     device. Only accounts an invite created: users the admin made are the
//     admin's to remove.
//
// The device is removed only after the reply is sent: removing it cuts the
// very tunnel the reply travels on.

const KEEP_DAYS = 90;
const REMOVE_DELAY_MS = 1500;

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	const me = await requireMember(request, getClientAddress);
	if (me instanceof Response) return me;

	const body = jsonBody<{ delete_account?: unknown }>(me.body) ?? {};
	const wantsDelete = body.delete_account === true;
	const invited = getAccount(me.user) !== null;
	if (wantsDelete && !invited) return json({ error: 'not_allowed' }, { status: 403 });

	let others: number;
	try {
		others = (await nodesOf(me.user)).filter((n) => n.id !== me.nodeId).length;
	} catch {
		return json({ error: 'server_error' }, { status: 502 });
	}
	const deleteAccount = wantsDelete && others === 0;
	if (invited && !deleteAccount) keepAccount(me.user, KEEP_DAYS);

	setTimeout(() => {
		void (async () => {
			try {
				await deleteNode(me.nodeId);
				if (deleteAccount) await purgeIfEmpty(me.user);
			} catch (e) {
				console.error('[bigscale] leave:', (e as Error).message);
			}
		})();
	}, REMOVE_DELAY_MS);

	return json({
		device_removed: true,
		account_deleted: deleteAccount,
		account_kept: invited && !deleteAccount,
		other_devices: others
	});
};
