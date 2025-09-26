<script lang="ts">
	let selectedTorrent: any = null;

	// --- DONNÉES MOCKÉES ---
	const instances = [
		{ name: 'Seedbox-FR', status: 'online', dl: '80.2 MB/s', ul: '20.1 MB/s' },
		{ name: 'Serveur-US', status: 'online', dl: '32.3 MB/s', ul: '25.7 MB/s' }
	];

	// Appliquer le padding réduit pour le dashboard
	import { onMount } from 'svelte';
	onMount(() => {
		const container = document.querySelector('#main-container') as HTMLElement;
		if (container) {
			container.style.padding = 'calc(var(--spacing-unit) * 2)';
		}
	});

	const globalStats = {
		downloadSpeed: '112.5 MB/s',
		uploadSpeed: '45.8 MB/s',
		activeTorrents: 87,
		totalTorrents: 1245
	};

	const torrents = [
		{
			id: 1,
			name: 'Ubuntu.24.04.LTS.iso',
			instance: 'Seedbox-FR',
			size: '4.6 GB',
			progress: 100,
			status: 'Seeding',
			dl_speed: '0 B/s',
			ul_speed: '12.3 MB/s'
		},
		{
			id: 2,
			name: 'ArchLinux.Latest.iso',
			instance: 'Serveur-US',
			size: '870 MB',
			progress: 76,
			status: 'Downloading',
			dl_speed: '15.4 MB/s',
			ul_speed: '1.2 MB/s'
		},
		{
			id: 3,
			name: 'My.Awesome.Movie.2025.2160p.mkv',
			instance: 'Serveur-US',
			size: '22.1 GB',
			progress: 23,
			status: 'Downloading',
			dl_speed: '16.9 MB/s',
			ul_speed: '540 KB/s'
		},
		{
			id: 4,
			name: 'Old.Backup.File.zip',
			instance: 'Seedbox-FR',
			size: '1.2 GB',
			progress: 0,
			status: 'Paused',
			dl_speed: '0 B/s',
			ul_speed: '0 B/s'
		}
	];
</script>

<div class="info-bar">
	<div class="instance-summary">
		{#each instances as instance}
			<div class="instance-stat-card">
				<div class="instance-name">
					<span class="status-dot {instance.status}"></span>
					{instance.name}
				</div>
				<div class="instance-speeds">
					<span>↓ {instance.dl}</span>
					<span>↑ {instance.ul}</span>
				</div>
			</div>
		{/each}
	</div>

	<div class="global-stats-summary">
		<div class="stat-item">
			<span class="stat-label">Total DL</span>
			<span class="stat-value">{globalStats.downloadSpeed}</span>
		</div>
		<div class="stat-item">
			<span class="stat-label">Total UL</span>
			<span class="stat-value">{globalStats.uploadSpeed}</span>
		</div>
		<div class="stat-item">
			<span class="stat-label">Active</span>
			<span class="stat-value">{globalStats.activeTorrents}</span>
		</div>
	</div>
</div>

<div class="toolbar">
	<div class="actions">
		<button class="action-btn" disabled>+ Add Torrent</button>
		<button class="action-btn" disabled>Pause All</button>
		<button class="action-btn" disabled>Resume All</button>
	</div>
	<div class="filters">
		<input type="search" placeholder="Filter by name..." disabled />
	</div>
</div>

<div class="content-area">
	<div class="table-container">
		<div class="card-header">
			<div class="metric-label">All Torrents</div>
			<button class="icon-btn" title="Customize columns" disabled>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					><path
						d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 0 2l-.15.08a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1 0-2l.15-.08a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"
					/><circle cx="12" cy="12" r="3" /></svg
				>
			</button>
		</div>
		<div class="torrent-table">
			<table>
				<thead>
					<tr>
						<th>Name</th>
						<th>Instance</th>
						<th>Size</th>
						<th>Progress</th>
						<th>Status</th>
						<th class="right">DL Speed</th>
						<th class="right">UL Speed</th>
					</tr>
				</thead>
				<tbody>
					{#each torrents as torrent (torrent.id)}
						<tr
							on:click={() => (selectedTorrent = torrent)}
							class:selected={selectedTorrent?.id === torrent.id}
						>
							<td class="name">{torrent.name}</td>
							<td>{torrent.instance}</td>
							<td>{torrent.size}</td>
							<td class="progress-cell">
								<div class="progress-bar-container">
									<div class="progress-bar" style="width: {torrent.progress}%"></div>
								</div>
							</td>
							<td
								><span class="status-indicator status-{torrent.status.toLowerCase()}"
									>{torrent.status}</span
								></td
							>
							<td class="right mono">{torrent.dl_speed}</td>
							<td class="right mono">{torrent.ul_speed}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>

	{#if selectedTorrent}
		<div class="info-panel">
			<div class="panel-header">
				<h3>{selectedTorrent.name}</h3>
				<button class="close-btn" on:click={() => (selectedTorrent = null)}>×</button>
			</div>
			<div class="panel-content">
				<div class="tabs">
					<button class="tab active">General</button>
					<button class="tab" disabled>Trackers</button>
					<button class="tab" disabled>Peers</button>
					<button class="tab" disabled>Files</button>
				</div>
				<div class="tab-content">
					<p><strong>Status:</strong> {selectedTorrent.status}</p>
					<p><strong>Instance:</strong> {selectedTorrent.instance}</p>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	/* --- Barre d'info supérieure --- */
	.info-bar {
		display: flex;
		justify-content: space-between;
		align-items: stretch;
		gap: 1.5rem;
		margin-bottom: 1rem;
	}
	.instance-summary,
	.global-stats-summary {
		display: flex;
		gap: 1rem;
		background-color: #fff;
		border: 1px solid var(--border-color);
		border-radius: 5px;
		padding: 0.75rem;
	}
	.instance-stat-card {
		padding-right: 1rem;
		border-right: 1px solid var(--border-color);
	}
	.instance-stat-card:last-child {
		border-right: none;
		padding-right: 0;
	}
	.instance-name {
		font-size: 0.9rem;
		font-weight: 700;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.status-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
	}
	.status-dot.online {
		background-color: #28a745;
	}
	.status-dot.offline {
		background-color: var(--secondary-text-color);
	}
	.instance-speeds {
		font-family: var(--font-family-mono);
		font-size: 0.8rem;
		color: var(--secondary-text-color);
		display: flex;
		gap: 0.75rem;
		margin-top: 0.25rem;
	}
	.global-stats-summary {
		align-items: center;
	}
	.stat-item {
		text-align: center;
		padding: 0 1rem;
	}
	.stat-label {
		font-size: 0.7rem;
		text-transform: uppercase;
		color: var(--secondary-text-color);
		font-weight: 700;
	}
	.stat-value {
		font-family: var(--font-family-mono);
		font-size: 1rem;
		font-weight: 700;
	}

	/* --- Barre d'outils --- */
	.toolbar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.75rem;
		background-color: #fff;
		border: 1px solid var(--border-color);
		border-radius: 5px;
		margin-bottom: 1.5rem;
	}
	.actions {
		display: flex;
		gap: 0.5rem;
	}
	.action-btn {
		background-color: transparent;
		border: 1px solid var(--border-color);
		padding: 0.5rem 1rem;
		border-radius: 4px;
		font-weight: 700;
		cursor: pointer;
	}
	.action-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	input[type='search'] {
		padding: 0.5rem;
		border: 1px solid var(--border-color);
		border-radius: 4px;
		min-width: 250px;
	}

	/* --- Contenu principal --- */
	.content-area {
		position: relative;
	}
	.table-container {
		background-color: #fff;
		border: 1px solid var(--border-color);
		border-radius: 5px;
		padding: 0;
	}
	.card-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.75rem 1rem;
		border-bottom: 1px solid var(--border-color);
	}
	.metric-label {
		font-size: 0.9rem;
		color: var(--secondary-text-color);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	.icon-btn {
		background: transparent;
		border: none;
		padding: 0.25rem;
		cursor: pointer;
		color: var(--secondary-text-color);
	}
	.icon-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
	.icon-btn:hover:not(:disabled) {
		color: var(--primary-text-color);
	}

	.torrent-table {
		width: 100%;
		overflow-x: auto;
	}
	table {
		width: 100%;
		border-collapse: collapse;
	}
	th,
	td {
		padding: 0.75rem 1rem;
		text-align: left;
		border-bottom: 1px solid var(--border-color);
		border-right: 1px solid var(--border-color);
		white-space: nowrap;
		font-size: 0.9rem;
	}
	th:last-child,
	td:last-child {
		border-right: none;
	}
	tbody tr {
		cursor: pointer;
		transition: background-color 0.15s ease;
	}
	tbody tr:hover {
		background-color: var(--background-color);
	}
	tbody tr.selected {
		background-color: hsl(210, 100%, 95%);
	}

	/* Styles spécifiques aux cellules du tableau */
	.name {
		max-width: 350px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.right {
		text-align: right;
	}
	.mono {
		font-family: var(--font-family-mono);
	}
	.progress-cell {
		min-width: 120px;
	}
	.progress-bar-container {
		height: 6px;
		background-color: var(--background-color);
		border-radius: 3px;
		overflow: hidden;
	}
	.progress-bar {
		height: 100%;
		background-color: var(--accent-color);
		border-radius: 3px;
	}
	.status-indicator {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 0.85rem;
	}
	.status-indicator::before {
		content: '';
		display: inline-block;
		width: 7px;
		height: 7px;
		border-radius: 50%;
	}
	.status-seeding::before {
		background-color: #28a745;
	}
	.status-downloading::before {
		background-color: var(--accent-color);
	}
	.status-paused::before {
		background-color: var(--secondary-text-color);
	}
	.status-error::before {
		background-color: #dc3545;
	}

	/* --- Panneau d'informations --- */
	.info-panel {
		background-color: #fff;
		border-top: 2px solid var(--border-color);
		height: 250px;
		display: flex;
		flex-direction: column;
	}
	.panel-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.5rem 1rem;
		border-bottom: 1px solid var(--border-color);
		font-weight: 700;
	}
	.close-btn {
		background: none;
		border: none;
		font-size: 1.5rem;
		cursor: pointer;
	}
	.panel-content {
		padding: 1rem;
		flex-grow: 1;
		overflow-y: auto;
	}
	.tabs {
		display: flex;
		gap: 0.25rem;
		border-bottom: 1px solid var(--border-color);
		margin-bottom: 1rem;
	}
	.tab {
		background: none;
		border: none;
		padding: 0.5rem 1rem;
		cursor: pointer;
		border-bottom: 2px solid transparent;
	}
	.tab.active {
		border-bottom-color: var(--accent-color);
		font-weight: 700;
	}
</style>
