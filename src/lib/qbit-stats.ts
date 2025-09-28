/**
 * Décode la chaîne de configuration AllStats de qBittorrent.
 * @param {string} configString - La ligne complète, ex: "AllStats=@Variant(...)"
 * @returns {{AlltimeUL: bigint, AlltimeDL: bigint} | null} Un objet avec les valeurs en octets (BigInt), ou null en cas d'erreur.
 */
export function decodeQbitStats(
	configString: string
): { AlltimeUL: bigint; AlltimeDL: bigint } | null {
	// 1. Extraire la partie binaire de la chaîne.
	const match = configString.match(/@Variant\((.*)\)/s);
	if (!match || !match[1]) {
		console.error("Format de chaîne invalide. '@Variant(...)' non trouvé.");
		return null;
	}
	const binaryStr = match[1];

	// 2. Convertir la chaîne en un tableau d'octets (Uint8Array).
	const bytes = new Uint8Array(binaryStr.length);
	for (let i = 0; i < binaryStr.length; i++) {
		bytes[i] = binaryStr.charCodeAt(i) & 0xff; // Masque pour garder seulement le byte inférieur
	}

	// 3. Utiliser un DataView pour lire les données binaires facilement.
	const dataView = new DataView(bytes.buffer);
	let offset = 0;

	try {
		// Structure attendue : QVariantMap (type 0x1c), 2 paires
		const mapType = dataView.getInt32(offset); // Lit 4 octets en Big Endian
		if (mapType !== 0x1c) throw new Error('Type non reconnu. Attendu: QVariantMap (0x1c).');
		offset += 4;

		const pairCount = dataView.getInt32(offset);
		if (pairCount !== 2) throw new Error(`Nombre de paires inattendu: ${pairCount}. Attendu: 2.`);
		offset += 4;

		const stats: Record<string, bigint> = {};
		const textDecoder = new TextDecoder('utf-16be'); // Les clés sont en UTF-16 Big Endian

		for (let i = 0; i < pairCount; i++) {
			// Lire la clé (QString)
			const keyLength = dataView.getInt32(offset);
			offset += 4;
			const keyBytes = bytes.subarray(offset, offset + keyLength);
			const key = textDecoder.decode(keyBytes);
			offset += keyLength;

			// Lire la valeur (QVariant -> qulonglong)
			const valueType = dataView.getInt32(offset);
			if (valueType !== 4)
				throw new Error(`Type de valeur inattendu pour la clé "${key}". Attendu: qulonglong (4).`);
			offset += 4;

			// La valeur est un entier non signé de 64 bits (BigInt)
			const value = dataView.getBigUint64(offset);
			offset += 8;

			stats[key] = value;
		}

		return {
			AlltimeUL: stats.AlltimeUL || 0n,
			AlltimeDL: stats.AlltimeDL || 0n
		};
	} catch (error) {
		console.error(
			'Erreur lors du décodage:',
			error instanceof Error ? error.message : String(error)
		);
		return null;
	}
}

/**
 * Lit le fichier qBittorrent-data.conf et extrait les statistiques globales
 * @param {string} configPath - Le chemin vers le répertoire de configuration
 * @returns {{AlltimeUL: bigint, AlltimeDL: bigint} | null} Un objet avec les valeurs en octets (BigInt), ou null en cas d'erreur.
 */
export async function readQbitStats(
	configPath: string
): Promise<{ AlltimeUL: bigint; AlltimeDL: bigint } | null> {
	try {
		// Importer fs de manière dynamique pour éviter les problèmes avec SSR
		const fs = await import('fs/promises');
		const path = await import('path');

		const confFilePath = path.join(configPath, 'qBittorrent-data.conf');

		// Vérifier si le fichier existe
		try {
			await fs.access(confFilePath);
		} catch {
			console.error(`Le fichier de configuration n'existe pas: ${confFilePath}`);
			return null;
		}

		// Lire le fichier
		const fileContent = await fs.readFile(confFilePath, 'utf-8');

		// Chercher la ligne AllStats
		const allStatsLine = fileContent.split('\n').find((line) => line.startsWith('AllStats='));

		if (!allStatsLine) {
			console.error(`La ligne AllStats n'a pas été trouvée dans ${confFilePath}`);
			return null;
		}

		// Décoder les statistiques
		return decodeQbitStats(allStatsLine);
	} catch (error) {
		console.error(`Erreur lors de la lecture des statistiques qBittorrent:`, error);
		return null;
	}
}
