/**
 * What IP address does this function's outbound traffic come from?
 *
 * An API key with an IP whitelist only works from a listed address,
 * and a serverless function's address changes with the instance. This
 * is how you find out what you have right now — and, once a static
 * egress is configured, whether the configuration took.
 */

import { onRequest } from 'firebase-functions/v2/https';

export const getEgressIp = onRequest(
  { invoker: 'public' },
  async (req, res) => {
    try {
      const response = await fetch('https://api.ipify.org?format=json');
      const data = (await response.json()) as { ip?: string };
      res.status(200).json({
        ip: data.ip ?? null,
        // A static egress is the whole point of the whitelist, so say
        // whether this one looks like one.
        note: '如果 ip 每次都唔同，就係動態 egress，唔可以入 IP 白名單。',
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? 'failed' });
    }
  },
);
