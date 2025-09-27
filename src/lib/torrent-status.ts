interface TorrentData {
	state?:
		| 'error'
		| 'errored'
		| 'moving'
		| 'checkingUP'
		| 'checkingDL'
		| 'pausedDL'
		| 'pausedUP'
		| 'uploading'
		| 'stalledUP'
		| 'downloading'
		| 'stalledDL';
	progress?: number;
	dlspeed?: number;
	upspeed?: number;
	infohash_v1?: string;
}

export function mapTorrentStatus(torrent: TorrentData): { primary: string; secondary: string[] } {
	const state = torrent.state || '';
	const progress = torrent.progress || 0;
	const dlspeed = torrent.dlspeed || 0;
	const upspeed = torrent.upspeed || 0;

	const secondaryStatuses: string[] = [];

	// Ajouter les statuts secondaires en fonction des règles

	// Completed (progress == 1)
	if (progress === 1) {
		secondaryStatuses.push('Completed');
	}

	// Running (not paused)
	if (state !== 'pausedDL' && state !== 'pausedUP') {
		secondaryStatuses.push('Running');
	}

	// Active (data transfer happening)
	if ((dlspeed > 0 || upspeed > 0) && state && !['checkingUP', 'checkingDL'].includes(state)) {
		secondaryStatuses.push('Active');
	}

	// Inactive (no data transfer, not paused)
	if (dlspeed === 0 && upspeed === 0 && state && !['pausedDL', 'pausedUP'].includes(state)) {
		secondaryStatuses.push('Inactive');
	}

	// Stalled (meta state for stalledUP and stalledDL)
	if (state === 'stalledUP' || state === 'stalledDL') {
		secondaryStatuses.push('Stalled');
		if (state === 'stalledUP') {
			secondaryStatuses.push('Stalled uploading');
		} else if (state === 'stalledDL') {
			secondaryStatuses.push('Stalled downloading');
		}
	}

	// Déterminer le statut principal
	let primaryStatus = state || 'Unknown';

	// Errored
	if (state === 'error' || state === 'errored') {
		primaryStatus = 'Errored';
	}
	// Moving
	else if (state === 'moving') {
		primaryStatus = 'Moving';
	}
	// Checking
	else if (state === 'checkingUP' || state === 'checkingDL') {
		primaryStatus = 'Checking';
	}
	// Stopped
	else if (state === 'pausedDL' || state === 'pausedUP') {
		primaryStatus = 'Stopped';
	}
	// Completed (progress == 1)
	else if (progress === 1) {
		// Seeding (uploading)
		if (state === 'uploading') {
			primaryStatus = 'Seeding';
		}
		// Stalled uploading
		else if (state === 'stalledUP') {
			primaryStatus = 'Stalled uploading';
		} else {
			primaryStatus = 'Completed';
		}
	}
	// Downloading
	else if (state === 'downloading') {
		primaryStatus = 'Downloading';
	}
	// Stalled downloading
	else if (state === 'stalledDL') {
		primaryStatus = 'Stalled downloading';
	}
	// Active (data transfer happening)
	else if ((dlspeed > 0 || upspeed > 0) && state && !['checkingUP', 'checkingDL'].includes(state)) {
		primaryStatus = 'Active';
	}
	// Inactive (no data transfer, not paused)
	else if (dlspeed === 0 && upspeed === 0 && state && !['pausedDL', 'pausedUP'].includes(state)) {
		primaryStatus = 'Inactive';
	}
	// Running (not paused)
	else if (state && !['pausedDL', 'pausedUP'].includes(state)) {
		primaryStatus = 'Running';
	}
	// Stalled (meta state for stalledUP and stalledDL)
	else if (state && ['stalledUP', 'stalledDL'].includes(state)) {
		primaryStatus = 'Stalled';
	}

	return {
		primary: primaryStatus,
		secondary: secondaryStatuses
	};
}
