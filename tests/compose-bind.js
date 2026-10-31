const LOOPBACK = '127.0.0.1';

function collectPortEntries(composeText) {
	const entries = [];
	const lines = composeText.split('\n');
	let inPorts = false;
	let portsIndent = 0;

	for (const line of lines) {
		if (/^\s*ports:\s*$/.test(line)) {
			inPorts = true;
			portsIndent = line.match(/^(\s*)/)[1].length;
			continue;
		}

		if (!inPorts) {
			continue;
		}

		const listMatch = line.match(/^(\s*)-\s+(?:"([^"]*)"|'([^']*)'|(\S+))\s*$/);
		if (listMatch) {
			const indent = listMatch[1].length;
			if (indent <= portsIndent) {
				inPorts = false;
				continue;
			}
			const value = listMatch[2] ?? listMatch[3] ?? listMatch[4];
			entries.push(value);
			continue;
		}

		if (line.trim() === '' || /^\s+#/.test(line)) {
			continue;
		}

		const lineIndent = line.match(/^(\s*)/)[1].length;
		if (lineIndent <= portsIndent) {
			inPorts = false;
		}
	}

	return entries;
}

function hostForPublishedPort(entry) {
	const trimmed = entry.trim();
	if (/^\d+$/.test(trimmed)) {
		throw new Error(`Compose publish must bind to ${LOOPBACK}, not bare port: ${trimmed}`);
	}
	if (!trimmed.startsWith(`${LOOPBACK}:`)) {
		throw new Error(`Compose publish must bind to ${LOOPBACK}, not: ${trimmed}`);
	}
	return LOOPBACK;
}

/**
 * @param {string} composeText
 * @returns {string[]} host IP for each published port (always 127.0.0.1 when valid)
 */
export function parsePublishedHosts(composeText) {
	const entries = collectPortEntries(composeText);
	return entries.map(hostForPublishedPort);
}
