const LOOPBACK = '127.0.0.1';

const SHORT_ENTRY =
	/^(?:"([^"]*)"|'([^']*)'|([^\s"'#]\S*))\s*(?:#.*)?$/;
const LOOPBACK_PUBLISH =
	/^127\.0\.0\.1:(?:\d+|\$\{[A-Za-z_][A-Za-z0-9_]*(?::-\d+)?\}):\d+(?:\/(?:tcp|udp))?$/;

function indentOf(line) {
	return line.match(/^(\s*)/)[1].length;
}

function collectPortEntries(composeText) {
	const entries = [];
	let inPorts = false;
	let portsIndent = 0;

	for (const line of composeText.split('\n')) {
		const blank = line.trim() === '' || /^\s*#/.test(line);

		if (!inPorts || (!blank && indentOf(line) <= portsIndent && !/^\s*-\s/.test(line))) {
			inPorts = false;
			const open = line.match(/^(\s*)ports:\s*(.*)$/);
			if (!open) {
				continue;
			}
			const rest = open[2].replace(/\s+#.*$/, '').trim();
			if (rest !== '') {
				throw new Error(`Compose ports must be a block list of short entries, not: ${line.trim()}`);
			}
			inPorts = true;
			portsIndent = open[1].length;
			continue;
		}

		if (blank) {
			continue;
		}

		const item = line.match(/^\s*-\s+(.*)$/);
		const entry = item ? item[1].match(SHORT_ENTRY) : null;
		if (!entry) {
			throw new Error(`Unrecognized compose ports line (must be a short 127.0.0.1 entry): ${line.trim()}`);
		}
		entries.push(entry[1] ?? entry[2] ?? entry[3]);
	}

	return entries;
}

function hostForPublishedPort(entry) {
	const trimmed = entry.trim();
	if (/^\d+$/.test(trimmed)) {
		throw new Error(`Compose publish must bind to ${LOOPBACK}, not bare port: ${trimmed}`);
	}
	if (!LOOPBACK_PUBLISH.test(trimmed)) {
		throw new Error(`Compose publish must bind to exactly ${LOOPBACK}, not: ${trimmed}`);
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
