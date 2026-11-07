// TCP proxy so Playwright's public port (E2E_KITE_PORT) reaches Express on
// E2E_API_PORT. Byte pipes keep HTTP upgrades (no header rewriting).
import net from 'node:net';

/**
 * @param {{ targetHost: string, targetPort: number }} options
 * @returns {import('node:net').Server & { closeProxy: () => void }}
 */
export function createTcpProxy({ targetHost, targetPort }) {
	/** @type {Set<import('node:net').Socket>} */
	const sockets = new Set();

	const server = net.createServer((client) => {
		const upstream = net.connect(targetPort, targetHost);
		track(client);
		track(upstream);
		const fail = () => {
			client.destroy();
			upstream.destroy();
		};
		client.on('error', fail);
		upstream.on('error', fail);
		client.pipe(upstream);
		upstream.pipe(client);
	});

	/** @param {import('node:net').Socket} socket */
	function track(socket) {
		sockets.add(socket);
		socket.on('close', () => {
			sockets.delete(socket);
		});
	}

	/** @type {import('node:net').Server & { closeProxy: () => void }} */
	const proxy = /** @type {import('node:net').Server & { closeProxy: () => void }} */ (server);
	proxy.closeProxy = () => {
		for (const socket of sockets) socket.destroy();
		server.close();
	};
	return proxy;
}
