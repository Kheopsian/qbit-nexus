<script lang="ts">
	import type { PageData } from './$types';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { onMount } from 'svelte';
	import { qbitData, wsConnectionStatus } from '$lib/websocket-client';
	import { disconnectWebSocket } from '$lib/websocket-client';
	import { mapTorrentStatus } from '$lib/torrent-status';
	import type { QbitMainData } from '$lib/websocket';

	export let data: PageData;

	let selectedTorrent: any = null;
	// Trouver le torrent mis à jour dans allTorrents
	$: updatedTorrent = allTorrents.find((t) => t.hash === selectedTorrent?.hash) || selectedTorrent;
	let showStatusSettings = false;
	let selectedStatuses: string[] = [...data.config.settings.visibleStatuses];
	let visibleStatuses: string[];
	let settingsForm: HTMLFormElement;
	let pollingInterval: any = null;

	// --- GESTION DES TABS DANS LA POPUP ---
	let activeTab = 'general';
	interface Peer {
		client?: string;
		ip?: string;
		port?: number;
		progress: number;
		dl_speed: number;
		up_speed: number;
		flags?: string;
		reqs?: string;
		downloaded: number;
		uploaded: number;
	}

	interface TorrentDetails {
		trackers?: any[];
		peers?: {
			full_update: boolean;
			peers: Record<string, Peer>;
		};
	}

	let torrentDetails: TorrentDetails | null = null;

	// --- GESTION DU SCROLL ---
	let showStickyHeader = false;
	let showFilters = false;
	let isClosingFilters = false;
	let lastScrollPosition = 0;

	// --- GESTION DU THÈME ---
	let isDarkMode = false;

	// Référence pour l'élément des filtres
	let filtersElement: HTMLElement;

	// Fonction pour détecter le scroll
	function handleScroll() {
		const currentScrollPosition = window.pageYOffset || document.documentElement.scrollTop;

		// Vérifier si les filtres sont visibles
		if (filtersElement) {
			const filtersRect = filtersElement.getBoundingClientRect();
			const filtersVisible = filtersRect.bottom > 0;

			// Afficher le header sticky si les filtres ne sont plus visibles
			showStickyHeader = !filtersVisible;
		}

		// Fermer le bandeau de filtres lors du scroll avec animation
		if (showFilters && !isClosingFilters) {
			isClosingFilters = true;
			setTimeout(() => {
				showFilters = false;
				isClosingFilters = false;
			}, 300); // Durée correspondant à l'animation
		}

		lastScrollPosition = currentScrollPosition;
	}

	// Fonction pour faire défiler vers le haut
	function scrollToTop() {
		window.scrollTo({
			top: 0,
			behavior: 'smooth'
		});
	}

	// Fonction pour démarrer le polling
	function startPolling(torrent: any) {
		// Arrêter tout polling existant
		if (pollingInterval) {
			clearInterval(pollingInterval);
		}
		// Démarrer un nouveau polling toutes les 5 secondes
		pollingInterval = setInterval(() => {
			fetchTorrentDetails(torrent);
		}, 5000);
	}

	// Fonction pour arrêter le polling
	function stopPolling() {
		if (pollingInterval) {
			clearInterval(pollingInterval);
			pollingInterval = null;
		}
	}

	// Fonction pour sélectionner un torrent et réinitialiser l'onglet
	function selectTorrent(torrent: any) {
		selectedTorrent = torrent;
		activeTab = 'general';
		fetchTorrentDetails(torrent);
		startPolling(torrent);
	}

	// Fonction pour afficher/masquer les filtres
	function toggleFilters() {
		showFilters = !showFilters;
	}

	// Fonction pour basculer le thème
	function toggleTheme() {
		isDarkMode = !isDarkMode;
		updateTheme();
	}

	// Fonction pour mettre à jour le thème
	function updateTheme() {
		const html = document.documentElement;
		const icon = document.querySelector('#theme-switcher i');

		if (isDarkMode) {
			html.classList.add('dark-mode');
			if (icon) icon.className = 'fas fa-sun';
			localStorage.setItem('theme', 'dark');
		} else {
			html.classList.remove('dark-mode');
			if (icon) icon.className = 'fas fa-moon';
			localStorage.setItem('theme', 'light');
		}
	}

	onMount(() => {
		// Ajouter l'écouteur d'événement de scroll
		window.addEventListener('scroll', handleScroll);

		// Vérifier la préférence stockée ou utiliser la préférence système pour le thème
		const savedTheme = localStorage.getItem('theme');
		const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

		if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
			isDarkMode = true;
		}

		updateTheme();

		// Nettoyer l'écouteur d'événement lors de la destruction du composant
		return () => {
			window.removeEventListener('scroll', handleScroll);
		};
	});

	async function fetchTorrentDetails(torrent: any) {
		try {
			const instanceId = torrent.instanceId;
			const hash = torrent.hash;
			const response = await fetch(`/api/torrent-details?instanceId=${instanceId}&hash=${hash}`);
			if (!response.ok) {
				throw new Error(
					`Erreur lors de la récupération des détails du torrent: ${response.status}`
				);
			}
			const data = await response.json();
			// Forcer la mise à jour de torrentDetails en créant un nouvel objet
			torrentDetails = JSON.parse(JSON.stringify(data));
		} catch (error) {
			console.error('Erreur lors de la récupération des détails du torrent:', error);
			torrentDetails = null;
		}
	}

	$: selectedStatuses = [...data.config.settings.visibleStatuses];

	// --- DONNÉES WEBSOCKET ---
	$: aggregatedData = $qbitData;
	$: connectionStatus = $wsConnectionStatus;

	// Extraire les instances des données WebSocket
	$: instances = data.config.instances.map((instance: any) => {
		const instanceData = aggregatedData?.instances?.[instance.id];
		const serverState = instanceData?.server_state as any;
		const torrents = (instanceData?.torrents as Record<string, any>) || {};

		// Calculer les statistiques
		const dlSpeed = serverState?.dl_info_speed || 0;
		const ulSpeed = serverState?.up_info_speed || 0;
		const activeTorrents = serverState?.active_torrents || 0;
		const totalTorrents = Object.keys(torrents).length;

		return {
			id: instance.id,
			name: instance.name,
			status: connectionStatus === 'connected' ? 'online' : 'offline',
			dl: formatSpeed(dlSpeed),
			ul: formatSpeed(ulSpeed),
			activeTorrents,
			totalTorrents
		};
	});

	// Extraire tous les torrents de toutes les instances
	$: allTorrents = aggregatedData
		? Object.entries(aggregatedData.instances || {}).flatMap(([instanceId, instanceData]) => {
				const torrents = (instanceData?.torrents as Record<string, any>) || {};
				return Object.entries(torrents).map(([hash, torrent]: [string, any]) => {
					// Formater les vitesses en chaînes de caractères
					const dlSpeed = torrent.dlspeed || 0;
					const ulSpeed = torrent.upspeed || 0;

					return {
						...torrent,
						id: hash, // Utiliser le hash comme ID
						hash,
						name: torrent.name || '',
						size: formatSize(torrent.size || 0),
						progress: (torrent.progress || 0) * 100, // Convertir en pourcentage
						status: mapTorrentStatus(torrent).primary,
						statuses: mapTorrentStatus(torrent).secondary.concat([
							mapTorrentStatus(torrent).primary
						]),
						dl_speed: formatSpeed(dlSpeed),
						ul_speed: formatSpeed(ulSpeed),
						instance:
							data.config.instances.find((inst: any) => inst.id === parseInt(instanceId))?.name ||
							'Unknown',
						instanceId: parseInt(instanceId),
						category: torrent.category || '',
						tags: torrent.tags || []
					};
				});
			})
		: [];

	// Fonction pour formater les vitesses
	function formatSpeed(bytesPerSecond: number): string {
		if (bytesPerSecond === 0) return '0 B/s';
		const units = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
		let value = bytesPerSecond;
		let unitIndex = 0;

		while (value >= 1024 && unitIndex < units.length - 1) {
			value /= 1024;
			unitIndex++;
		}

		return `${value.toFixed(1)} ${units[unitIndex]}`;
	}

	// Fonction pour formater les tailles
	function formatSize(bytes: number): string {
		if (bytes === 0) return '0 B';
		const units = ['B', 'KB', 'MB', 'GB', 'TB'];
		let value = bytes;
		let unitIndex = 0;

		while (value >= 1024 && unitIndex < units.length - 1) {
			value /= 1024;
			unitIndex++;
		}

		return `${value.toFixed(1)} ${units[unitIndex]}`;
	}

	// --- TRI DES COLONNES ---
	let sortKey = 'name';
	let sortDirection: 'asc' | 'desc' = 'asc';

	function toggleSort(key: string) {
		if (sortKey === key) {
			sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
		} else {
			sortKey = key;
			sortDirection = 'asc';
		}
	}

	function parseSize(size: string): number {
		const match = size.match(/(\d+(?:\.\d+)?)\s*(GB|MB|KB|B)/);
		if (!match) return 0;
		const num = parseFloat(match[1]);
		const unit = match[2];
		const multipliers: { [key: string]: number } = { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3 };
		return num * multipliers[unit];
	}

	function parseSpeed(speed: string): number {
		if (speed === '0 B/s') return 0;
		const match = speed.match(/(\d+(?:\.\d+)?)\s*(MB|KB|B)\/s/);
		if (!match) return 0;
		const num = parseFloat(match[1]);
		const unit = match[2];
		const multipliers: { [key: string]: number } = { 'B/s': 1, 'KB/s': 1024, 'MB/s': 1024 ** 2 };
		return num * multipliers[unit + '/s'];
	}

	$: sortedTorrents = [...filteredTorrents].sort((a, b) => {
		let aVal: any = a[sortKey as keyof typeof a];
		let bVal: any = b[sortKey as keyof typeof b];

		if (sortKey === 'progress') {
			aVal = a.progress;
			bVal = b.progress;
		} else if (sortKey === 'size') {
			aVal = parseSize(a.size);
			bVal = parseSize(b.size);
		} else if (sortKey === 'dl_speed') {
			aVal = parseSpeed(a.dl_speed);
			bVal = parseSpeed(b.dl_speed);
		} else if (sortKey === 'ul_speed') {
			aVal = parseSpeed(a.ul_speed);
			bVal = parseSpeed(b.ul_speed);
		}

		if (typeof aVal === 'number' && typeof bVal === 'number') {
			return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
		} else {
			aVal = String(aVal).toLowerCase();
			bVal = String(bVal).toLowerCase();
			if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
			if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
			return 0;
		}
	});

	// --- REDIMENSIONNEMENT DES COLONNES ---
	let columnWidths = ['auto', 'auto', 'auto', 'auto', 'auto', 'auto', 'auto'];
	let resizingColumn: number | null = null;
	let startX = 0;
	let startWidth = 0;

	function startResize(event: MouseEvent, columnIndex: number) {
		resizingColumn = columnIndex;
		startX = event.clientX;
		const th = (event.target as HTMLElement).parentElement as HTMLElement;
		startWidth = th.offsetWidth;
		document.addEventListener('mousemove', resize);
		document.addEventListener('mouseup', stopResize);
	}

	function resize(event: MouseEvent) {
		if (resizingColumn !== null) {
			const deltaX = event.clientX - startX;
			const newWidth = Math.max(50, startWidth + deltaX); // Minimum 50px
			columnWidths[resizingColumn] = `${newWidth}px`;
		}
	}

	function stopResize() {
		resizingColumn = null;
		document.removeEventListener('mousemove', resize);
		document.removeEventListener('mouseup', stopResize);
	}

	// --- FILTRES ---
	let searchFilter = '';
	let statusFilter = '';
	let instanceFilter = '';
	let categoryFilter = '';
	let tagFilter = '';

	// --- ÉTATS DES DROPDOWNS ---
	let statusDropdownOpen = false;
	let instanceDropdownOpen = false;
	let categoryDropdownOpen = false;
	let tagDropdownOpen = false;

	// --- DONNÉES WEBSOCKET ---
	// Les instances sont maintenant calculées de manière réactive plus haut

	// Calculer les statistiques globales à partir des données WebSocket
	$: globalStats = aggregatedData
		? (() => {
				let totalDlSpeed = 0;
				let totalUlSpeed = 0;
				let totalActiveTorrents = 0;
				let totalTorrents = 0;
				let totalDownloaded = 0;
				let totalUploaded = 0;

				// Parcourir toutes les instances pour agréger les données
				Object.values(aggregatedData.instances || {}).forEach((instanceData) => {
					const serverState = instanceData.server_state as any;
					const torrents = (instanceData.torrents as Record<string, any>) || {};

					// Ajouter les vitesses de téléchargement et d'upload
					totalDlSpeed += serverState?.dl_info_speed || 0;
					totalUlSpeed += serverState?.up_info_speed || 0;

					// Ajouter le nombre de torrents actifs
					totalActiveTorrents += serverState?.active_torrents || 0;

					// Compter le nombre total de torrents
					totalTorrents += Object.keys(torrents).length;

					// Ajouter les statistiques globales de téléchargement et d'upload
					totalDownloaded += serverState?.dl_info_data || 0;
					totalUploaded += serverState?.up_info_data || 0;
				});

				// Calculer le ratio
				const ratio = totalDownloaded > 0 ? totalUploaded / totalDownloaded : 0;

				return {
					downloadSpeed: formatSpeed(totalDlSpeed),
					uploadSpeed: formatSpeed(totalUlSpeed),
					activeTorrents: totalActiveTorrents,
					totalTorrents: totalTorrents,
					totalDownloaded: formatSize(totalDownloaded),
					totalUploaded: formatSize(totalUploaded),
					ratio: ratio.toFixed(2)
				};
			})()
		: {
				downloadSpeed: '0 B/s',
				uploadSpeed: '0 B/s',
				activeTorrents: 0,
				totalTorrents: 0,
				totalDownloaded: '0 B',
				totalUploaded: '0 B',
				ratio: '0.00'
			};

	// --- STATUTS DISPONIBLES ---
	const allStatuses = [
		'Downloading',
		'Seeding',
		'Completed',
		'Running',
		'Stopped',
		'Active',
		'Inactive',
		'Stalled',
		'Stalled uploading',
		'Stalled downloading',
		'Checking',
		'Moving',
		'Errored'
	];

	$: visibleStatuses =
		data.config.settings.visibleStatuses.length > 0
			? data.config.settings.visibleStatuses
			: allStatuses;

	// --- ICÔNES POUR LES STATUTS ---
	function getStatusIcon(status: string): string {
		switch (status) {
			case '':
				return '<i class="fas fa-chart-bar" style="color: var(--accent-color)"></i>';
			case 'Allocating':
				return '<i class="fas fa-folder" style="color: var(--secondary-text-color)"></i>';
			case 'Checking':
				return '<i class="fas fa-search" style="color: var(--accent-color)"></i>';
			case 'Downloading':
				return '<i class="fas fa-download" style="color: var(--accent-color)"></i>';
			case 'Errored':
				return '<i class="fas fa-exclamation-triangle" style="color: #dc3545"></i>';
			case 'Forced downloading':
				return '<i class="fas fa-bolt" style="color: #ff9800"></i><i class="fas fa-download" style="color: var(--accent-color)"></i>';
			case 'Forced seeding':
				return '<i class="fas fa-bolt" style="color: #ff9800"></i><i class="fas fa-seedling" style="color: #28a745"></i>';
			case 'Forced uploading':
				return '<i class="fas fa-bolt" style="color: #ff9800"></i><i class="fas fa-upload" style="color: #28a745"></i>';
			case 'MetaDL':
				return '<i class="fas fa-file" style="color: var(--secondary-text-color)"></i>';
			case 'Paused':
				return '<i class="fas fa-pause" style="color: var(--secondary-text-color)"></i>';
			case 'Queued':
				return '<i class="fas fa-clock" style="color: var(--secondary-text-color)"></i>';
			case 'Seeding':
				return '<i class="fas fa-seedling" style="color: #28a745"></i>';
			case 'Stalled':
				return '<i class="fas fa-stop" style="color: #ff9800"></i>';
			case 'Unknown':
				return '<i class="fas fa-question" style="color: var(--secondary-text-color)"></i>';
			case 'Uploading':
				return '<i class="fas fa-upload" style="color: #28a745"></i>';
			case 'Completed':
				return '<i class="fas fa-check" style="color: #28a745"></i>';
			case 'Running':
				return '<i class="fas fa-play" style="color: var(--accent-color)"></i>';
			case 'Stopped':
				return '<i class="fas fa-stop" style="color: var(--secondary-text-color)"></i>';
			case 'Active':
				return '<i class="fas fa-bolt" style="color: #ff9800"></i>';
			case 'Inactive':
				return '<i class="fas fa-circle" style="color: var(--secondary-text-color)"></i>';
			case 'Stalled uploading':
				return '<i class="fas fa-upload" style="color: #ff9800"></i>';
			case 'Stalled downloading':
				return '<i class="fas fa-download" style="color: #ff9800"></i>';
			case 'Moving':
				return '<i class="fas fa-arrows-alt" style="color: #6f42c1"></i>';
			default:
				return '<i class="fas fa-folder" style="color: var(--secondary-text-color)"></i>';
		}
	}

	// --- COMPTAGES POUR LES FILTRES ---
	$: statusOptions = [
		{ value: '', label: 'Tous', count: torrents.length },
		...visibleStatuses.map((status) => ({
			value: status,
			label: status,
			count: torrents.filter((t) => t.statuses.includes(status)).length
		}))
	];

	$: instanceOptions = [
		{ value: '', label: 'Toutes', count: torrents.length },
		{
			value: 'Seedbox-FR',
			label: 'Seedbox-FR',
			count: torrents.filter((t) => t.instance === 'Seedbox-FR').length
		},
		{
			value: 'Serveur-US',
			label: 'Serveur-US',
			count: torrents.filter((t) => t.instance === 'Serveur-US').length
		}
	];

	$: allCategories = [...new Set(torrents.map((t) => t.category))];
	$: categoryOptions = [
		{ value: '', label: 'Toutes', count: torrents.length },
		...allCategories.map((cat) => ({
			value: cat,
			label: cat,
			count: torrents.filter((t) => t.category === cat).length
		}))
	];

	$: allTags = [...new Set(torrents.flatMap((t) => t.tags))];
	$: tagOptions = [
		{ value: '', label: 'Tous', count: torrents.length },
		...allTags.map((tag) => ({
			value: tag,
			label: tag,
			count: torrents.filter((t) => t.tags.includes(tag)).length
		}))
	];

	// --- LOGIQUE DE FILTRAGE ---
	$: filteredTorrents = torrents.filter((torrent) => {
		if (searchFilter && !torrent.name.toLowerCase().includes(searchFilter.toLowerCase()))
			return false;
		if (statusFilter && !torrent.statuses.includes(statusFilter)) return false;
		if (instanceFilter && torrent.instance !== instanceFilter) return false;
		if (categoryFilter && torrent.category !== categoryFilter) return false;
		if (tagFilter && !torrent.tags.includes(tagFilter)) return false;
		return true;
	});

	// Les torrents sont maintenant extraits des données WebSocket (allTorrents)
	$: torrents = allTorrents;
</script>

<!-- Header sticky qui apparaît lors du scroll -->
{#if showStickyHeader}
	<header class="header sticky-header">
		<div class="logo">
			<a href="/" style="text-decoration: none; color: inherit">QBIT / NEXUS</a>
		</div>
		<div class="sticky-actions">
			<button class="sticky-btn" on:click={toggleFilters}>
				<i class="fas fa-filter"></i> Filtre
			</button>
			<button class="sticky-btn" on:click={scrollToTop}>
				<i class="fas fa-arrow-up"></i> Remonter
			</button>
		</div>
		<nav class="nav">
			<a href="/" class="nav-item">DASHBOARD</a>
			<a href="/settings" class="nav-item">SETTINGS</a>
			<div id="theme-switcher" class="nav-item" on:click={toggleTheme}>
				<i class="fas fa-moon"></i>
			</div>
		</nav>
	</header>
{/if}

<!-- Filtres qui apparaissent quand on clique sur le bouton Filtre du header sticky -->
{#if showFilters || isClosingFilters}
	<div class="sticky-filters" class:closing={isClosingFilters}>
		<div class="toolbar">
			<div class="filters">
				<div class="filter-row">
					<label for="search">Recherche:</label>
					<input
						id="search"
						type="search"
						placeholder="Filter by name..."
						bind:value={searchFilter}
					/>
				</div>
				<div class="filter-row">
					<div class="custom-select">
						<label>Catégorie:</label>
						<button on:click={() => (categoryDropdownOpen = !categoryDropdownOpen)}>
							{categoryOptions.find((o) => o.value === categoryFilter)?.label || 'Toutes'} ({categoryOptions.find(
								(o) => o.value === categoryFilter
							)?.count || torrents.length})
							<svg
								class="arrow"
								class:open={categoryDropdownOpen}
								width="12"
								height="12"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"><polyline points="6,9 12,15 18,9"></polyline></svg
							>
						</button>
						{#if categoryDropdownOpen}
							<div class="dropdown">
								{#each categoryOptions as option}
									<div
										class="option"
										on:click={() => {
											categoryFilter = option.value;
											categoryDropdownOpen = false;
										}}
									>
										{option.label} ({option.count})
									</div>
								{/each}
							</div>
						{/if}
					</div>
					<div class="custom-select">
						<label>Instance:</label>
						<button on:click={() => (instanceDropdownOpen = !instanceDropdownOpen)}>
							{instanceOptions.find((o) => o.value === instanceFilter)?.label || 'Toutes'} ({instanceOptions.find(
								(o) => o.value === instanceFilter
							)?.count || torrents.length})
							<svg
								class="arrow"
								class:open={instanceDropdownOpen}
								width="12"
								height="12"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"><polyline points="6,9 12,15 18,9"></polyline></svg
							>
						</button>
						{#if instanceDropdownOpen}
							<div class="dropdown">
								{#each instanceOptions as option}
									<div
										class="option"
										on:click={() => {
											instanceFilter = option.value;
											instanceDropdownOpen = false;
										}}
									>
										{option.label} ({option.count})
									</div>
								{/each}
							</div>
						{/if}
					</div>
					<div class="custom-select">
						<label>Tag:</label>
						<button on:click={() => (tagDropdownOpen = !tagDropdownOpen)}>
							{tagOptions.find((o) => o.value === tagFilter)?.label || 'Tous'} ({tagOptions.find(
								(o) => o.value === tagFilter
							)?.count || torrents.length})
							<svg
								class="arrow"
								class:open={tagDropdownOpen}
								width="12"
								height="12"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"><polyline points="6,9 12,15 18,9"></polyline></svg
							>
						</button>
						{#if tagDropdownOpen}
							<div class="dropdown">
								{#each tagOptions as option}
									<div
										class="option"
										on:click={() => {
											tagFilter = option.value;
											tagDropdownOpen = false;
										}}
									>
										{option.label} ({option.count})
									</div>
								{/each}
							</div>
						{/if}
					</div>
				</div>
			</div>
		</div>
	</div>
{/if}

<div class="info-bar" bind:this={filtersElement}>
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
		<div class="cumulative-stats">
			<div class="stat-item">
				<span class="stat-label">Total DL</span>
				<span class="stat-value">{globalStats.totalDownloaded}</span>
			</div>
			<div class="stat-item">
				<span class="stat-label">Total UL</span>
				<span class="stat-value">{globalStats.totalUploaded}</span>
			</div>
			<div class="stat-item">
				<span class="stat-label">Ratio</span>
				<span class="stat-value">{globalStats.ratio}</span>
			</div>
		</div>
		<div class="current-stats">
			<div class="stat-item">
				<span class="stat-label">Current DL</span>
				<span class="stat-value">{globalStats.downloadSpeed}</span>
			</div>
			<div class="stat-item">
				<span class="stat-label">Current UL</span>
				<span class="stat-value">{globalStats.uploadSpeed}</span>
			</div>
			<div class="stat-item">
				<span class="stat-label">Active</span>
				<span class="stat-value">{globalStats.activeTorrents}</span>
			</div>
		</div>
	</div>
</div>

<div class="toolbar">
	<div class="actions">
		<button class="action-btn" disabled>+ Add Torrent</button>
		<button class="action-btn" disabled>Pause All</button>
		<button class="action-btn" disabled>Resume All</button>
	</div>
	<div class="status-filter-group" style="position: relative;">
		<div class="status-filters">
			{#each statusOptions as option}
				<button
					class="status-btn {statusFilter === option.value ? 'active' : ''}"
					on:click={() => (statusFilter = statusFilter === option.value ? '' : option.value)}
				>
					{@html getStatusIcon(option.value)}
					<span class="label">{option.label}</span>
					<span class="count">({option.count})</span>
				</button>
			{/each}
			<button class="settings-btn" on:click={() => (showStatusSettings = !showStatusSettings)}>
				<i class="fas fa-cog"></i>
			</button>
		</div>
		{#if showStatusSettings}
			<div class="status-settings-overlay" on:click={() => (showStatusSettings = false)}>
				<div class="status-settings" on:click|stopPropagation>
					<form method="POST" action="?/updateSettings" use:enhance bind:this={settingsForm}>
						<input type="hidden" name="visibleStatuses" value={JSON.stringify(selectedStatuses)} />
						{#each allStatuses as status}
							<label>
								<input
									type="checkbox"
									bind:group={selectedStatuses}
									value={status}
									on:change={() => settingsForm?.requestSubmit()}
								/>
								{status}
							</label>
						{/each}
					</form>
				</div>
			</div>
		{/if}
	</div>
	<div class="filters">
		<div class="filter-row">
			<label for="search">Recherche:</label>
			<input id="search" type="search" placeholder="Filter by name..." bind:value={searchFilter} />
		</div>
		<div class="filter-row">
			<div class="custom-select">
				<label>Catégorie:</label>
				<button on:click={() => (categoryDropdownOpen = !categoryDropdownOpen)}>
					{categoryOptions.find((o) => o.value === categoryFilter)?.label || 'Toutes'} ({categoryOptions.find(
						(o) => o.value === categoryFilter
					)?.count || torrents.length})
					<svg
						class="arrow"
						class:open={categoryDropdownOpen}
						width="12"
						height="12"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"><polyline points="6,9 12,15 18,9"></polyline></svg
					>
				</button>
				{#if categoryDropdownOpen}
					<div class="dropdown">
						{#each categoryOptions as option}
							<div
								class="option"
								on:click={() => {
									categoryFilter = option.value;
									categoryDropdownOpen = false;
								}}
							>
								{option.label} ({option.count})
							</div>
						{/each}
					</div>
				{/if}
			</div>
			<div class="custom-select">
				<label>Instance:</label>
				<button on:click={() => (instanceDropdownOpen = !instanceDropdownOpen)}>
					{instanceOptions.find((o) => o.value === instanceFilter)?.label || 'Toutes'} ({instanceOptions.find(
						(o) => o.value === instanceFilter
					)?.count || torrents.length})
					<svg
						class="arrow"
						class:open={instanceDropdownOpen}
						width="12"
						height="12"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"><polyline points="6,9 12,15 18,9"></polyline></svg
					>
				</button>
				{#if instanceDropdownOpen}
					<div class="dropdown">
						{#each instanceOptions as option}
							<div
								class="option"
								on:click={() => {
									instanceFilter = option.value;
									instanceDropdownOpen = false;
								}}
							>
								{option.label} ({option.count})
							</div>
						{/each}
					</div>
				{/if}
			</div>
			<div class="custom-select">
				<label>Tag:</label>
				<button on:click={() => (tagDropdownOpen = !tagDropdownOpen)}>
					{tagOptions.find((o) => o.value === tagFilter)?.label || 'Tous'} ({tagOptions.find(
						(o) => o.value === tagFilter
					)?.count || torrents.length})
					<svg
						class="arrow"
						class:open={tagDropdownOpen}
						width="12"
						height="12"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"><polyline points="6,9 12,15 18,9"></polyline></svg
					>
				</button>
				{#if tagDropdownOpen}
					<div class="dropdown">
						{#each tagOptions as option}
							<div
								class="option"
								on:click={() => {
									tagFilter = option.value;
									tagDropdownOpen = false;
								}}
							>
								{option.label} ({option.count})
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</div>
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
						<th
							style="width: {columnWidths[0]}; position: relative; cursor: pointer;"
							on:click={() => toggleSort('name')}
						>
							Name <span class="sort-indicator"
								>{sortKey === 'name' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}</span
							>
							<div class="resize-handle" on:mousedown={(e) => startResize(e, 0)}></div>
						</th>
						<th
							style="width: {columnWidths[1]}; position: relative; cursor: pointer;"
							on:click={() => toggleSort('instance')}
						>
							Instance <span class="sort-indicator"
								>{sortKey === 'instance' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}</span
							>
							<div class="resize-handle" on:mousedown={(e) => startResize(e, 1)}></div>
						</th>
						<th
							style="width: {columnWidths[2]}; position: relative; cursor: pointer;"
							on:click={() => toggleSort('size')}
						>
							Size <span class="sort-indicator"
								>{sortKey === 'size' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}</span
							>
							<div class="resize-handle" on:mousedown={(e) => startResize(e, 2)}></div>
						</th>
						<th
							style="width: {columnWidths[3]}; position: relative; cursor: pointer;"
							on:click={() => toggleSort('progress')}
						>
							Progress <span class="sort-indicator"
								>{sortKey === 'progress' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}</span
							>
							<div class="resize-handle" on:mousedown={(e) => startResize(e, 3)}></div>
						</th>
						<th
							style="width: {columnWidths[4]}; position: relative; cursor: pointer;"
							on:click={() => toggleSort('status')}
						>
							Status <span class="sort-indicator"
								>{sortKey === 'status' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}</span
							>
							<div class="resize-handle" on:mousedown={(e) => startResize(e, 4)}></div>
						</th>
						<th
							class="right"
							style="width: {columnWidths[5]}; position: relative; cursor: pointer;"
							on:click={() => toggleSort('dl_speed')}
						>
							DL Speed <span class="sort-indicator"
								>{sortKey === 'dl_speed' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}</span
							>
							<div class="resize-handle" on:mousedown={(e) => startResize(e, 5)}></div>
						</th>
						<th
							class="right"
							style="width: {columnWidths[6]}; position: relative; cursor: pointer;"
							on:click={() => toggleSort('ul_speed')}
						>
							UL Speed <span class="sort-indicator"
								>{sortKey === 'ul_speed' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}</span
							>
						</th>
					</tr>
				</thead>
				<tbody>
					{#each sortedTorrents as torrent (torrent.id)}
						<tr
							on:click={() => selectTorrent(torrent)}
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
</div>

{#if selectedTorrent}
	<div class="info-panel">
		<div class="panel-header">
			<h3>{selectedTorrent.name}</h3>
			<button
				class="close-btn"
				on:click={() => {
					selectedTorrent = null;
					stopPolling();
				}}>×</button
			>
		</div>
		<div class="panel-content">
			<div class="tabs">
				<button
					class="tab {activeTab === 'general' ? 'active' : ''}"
					on:click={() => (activeTab = 'general')}
				>
					General
				</button>
				<button
					class="tab {activeTab === 'trackers' ? 'active' : ''}"
					on:click={() => (activeTab = 'trackers')}
				>
					Trackers
				</button>
				<button
					class="tab {activeTab === 'peers' ? 'active' : ''}"
					on:click={() => (activeTab = 'peers')}
				>
					Peers
				</button>
				<button
					class="tab {activeTab === 'files' ? 'active' : ''}"
					on:click={() => (activeTab = 'files')}
				>
					Files
				</button>
			</div>
			<div class="tab-content">
				{#if activeTab === 'general'}
					<div class="general-info-grid">
						<div class="info-row">
							<span class="info-label">Status:</span>
							<span class="info-value">{updatedTorrent.status}</span>
						</div>
						<div class="info-row">
							<span class="info-label">Instance:</span>
							<span class="info-value">{updatedTorrent.instance}</span>
						</div>
						<div class="info-row">
							<span class="info-label">Size:</span>
							<span class="info-value">{updatedTorrent.size}</span>
						</div>
						<div class="info-row">
							<span class="info-label">Progress:</span>
							<span class="info-value">{updatedTorrent.progress.toFixed(1)}%</span>
						</div>
						<div class="info-row">
							<span class="info-label">Download Speed:</span>
							<span class="info-value">{updatedTorrent.dl_speed}</span>
						</div>
						<div class="info-row">
							<span class="info-label">Upload Speed:</span>
							<span class="info-value">{updatedTorrent.ul_speed}</span>
						</div>
						{#if updatedTorrent.category}
							<div class="info-row">
								<span class="info-label">Category:</span>
								<span class="info-value">{updatedTorrent.category}</span>
							</div>
						{/if}
						{#if updatedTorrent.tags && updatedTorrent.tags.length > 0}
							<div class="info-row">
								<span class="info-label">Tags:</span>
								<span class="info-value"
									>{Array.isArray(updatedTorrent.tags)
										? updatedTorrent.tags.join(', ')
										: updatedTorrent.tags}</span
								>
							</div>
						{/if}
					</div>
				{:else if activeTab === 'trackers'}
					{#if torrentDetails && torrentDetails.trackers}
						<div class="tracker-info">
							<table class="tracker-table">
								<thead>
									<tr>
										<th>URL</th>
										<th>Status</th>
										<th>Peers</th>
										<th>Seeds</th>
										<th>Leeches</th>
										<th>Downloaded</th>
										<th>Message</th>
									</tr>
								</thead>
								<tbody>
									{#each torrentDetails.trackers as tracker}
										<tr>
											<td>{tracker.url}</td>
											<td>{tracker.status}</td>
											<td>{tracker.peers}</td>
											<td>{tracker.seeds}</td>
											<td>{tracker.leeches}</td>
											<td>{tracker.downloaded}</td>
											<td>{tracker.msg}</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					{:else}
						<div class="empty-state">
							<i class="fas fa-spinner fa-spin"></i>
							<p>Chargement des informations des trackers...</p>
						</div>
					{/if}
				{:else if activeTab === 'peers'}
					{#if torrentDetails && torrentDetails.peers && torrentDetails.peers.full_update}
						<div class="peer-info">
							<table class="peer-table">
								<thead>
									<tr>
										<th>IP</th>
										<th>Port</th>
										<th>Client</th>
										<th>Progress</th>
										<th>DL Speed</th>
										<th>UL Speed</th>
										<th>Flags</th>
										<th>Reqs</th>
										<th>Downloaded</th>
										<th>Uploaded</th>
									</tr>
								</thead>
								<tbody>
									{#each Object.entries(torrentDetails.peers?.peers || {}) as [ipPort, peer]}
										<tr>
											<td>{peer.ip || ipPort.split(':')[0]}</td>
											<td>{peer.port || ipPort.split(':')[1]}</td>
											<td>{peer.client || 'N/A'}</td>
											<td>{(peer.progress * 100).toFixed(1)}%</td>
											<td class="mono">{formatSpeed(peer.dl_speed)}</td>
											<td class="mono">{formatSpeed(peer.up_speed)}</td>
											<td>{peer.flags || ''}</td>
											<td>{peer.reqs || ''}</td>
											<td class="mono">{formatSize(peer.downloaded)}</td>
											<td class="mono">{formatSize(peer.uploaded)}</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					{:else}
						<div class="empty-state">
							<i class="fas fa-spinner fa-spin"></i>
							<p>Chargement des informations des peers...</p>
						</div>
					{/if}
				{:else if activeTab === 'files'}
					<div class="empty-state">
						<i class="fas fa-exclamation-circle"></i>
						<p>File information not available</p>
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}

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
		background-color: var(--card-background-color);
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
		margin-top: 0rem;
	}
	.global-stats-summary {
		flex-direction: column;
		gap: 0.25rem;
		width: fit-content;
	}
	.cumulative-stats,
	.current-stats {
		display: grid;
		grid-template-columns: 2fr 2fr 1fr;
		gap: 0.5rem;
	}
	.stat-item {
		text-align: left;
		padding: 0 1rem;
	}
	.stat-label {
		font-size: 0.7rem;
		text-transform: uppercase;
		color: var(--secondary-text-color);
		font-weight: 700;
		min-width: 70px;
		text-align: right;
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
		align-items: flex-start;
		padding: 0.75rem;
		background-color: var(--card-background-color);
		border: 1px solid var(--border-color);
		border-radius: 5px;
		margin-bottom: 1.5rem;
		gap: 1rem;
	}
	.actions {
		display: flex;
		flex-direction: column;
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
	.status-filters {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
		gap: 0.25rem;
		max-width: 550px;
	}
	.status-btn {
		background: transparent;
		border: 1px solid var(--border-color);
		padding: 0.25rem 0.5rem;
		border-radius: 4px;
		font-size: 0.75rem;
		cursor: pointer;
		display: flex;
		align-items: center;
		gap: 0.25rem;
		justify-content: space-between;
	}
	.label {
		flex: 1;
		text-align: center;
	}
	.count {
		flex-shrink: 0;
	}
	.status-btn.active {
		background: transparent;
		color: var(--accent-color);
		border: 2px solid var(--accent-color);
		font-weight: bold;
	}
	.status-btn:hover {
		background: var(--background-color);
	}
	.settings-btn {
		background: transparent;
		border: 1px solid var(--border-color);
		padding: 0.25rem;
		border-radius: 4px;
		cursor: pointer;
		font-size: 0.75rem;
	}
	.settings-btn:hover {
		background: var(--background-color);
	}
	.status-settings-overlay {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 5;
	}
	.status-settings {
		position: absolute;
		top: 100%;
		left: 0;
		background: var(--card-background-color);
		border: 1px solid var(--border-color);
		border-radius: 4px;
		padding: 0.5rem;
		z-index: 10;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		max-height: 200px;
		overflow-y: auto;
		box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
	}
	.status-settings label {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		font-size: 0.8rem;
		cursor: pointer;
	}
	.filters {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}
	.filter-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.filter-row label {
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--secondary-text-color);
		min-width: 80px;
	}
	.filter-row input[type='search'],
	.filter-row select {
		padding: 0.5rem;
		border: 1px solid var(--border-color);
		border-radius: 4px;
		font-size: 0.9rem;
	}
	.filter-row input[type='search'] {
		min-width: 250px;
		flex: 1;
	}
	.filter-row select {
		min-width: 120px;
	}
	.custom-select {
		position: relative;
		display: flex;
		flex-direction: column;
		min-width: 120px;
	}
	.custom-select label {
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--secondary-text-color);
		margin-bottom: 0.25rem;
	}
	.custom-select button {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.5rem;
		border: 1px solid var(--border-color);
		border-radius: 4px;
		background: var(--card-background-color);
		cursor: pointer;
		font-size: 0.9rem;
	}
	.custom-select button:hover {
		background: var(--background-color);
	}
	.arrow {
		transition: transform 0.2s;
	}
	.arrow.open {
		transform: rotate(180deg);
	}
	.dropdown {
		position: absolute;
		top: 100%;
		left: 0;
		right: 0;
		background: var(--card-background-color);
		border: 1px solid var(--border-color);
		border-radius: 4px;
		z-index: 10;
		max-height: 200px;
		overflow-y: auto;
	}
	.option {
		padding: 0.5rem;
		cursor: pointer;
		font-size: 0.9rem;
	}
	.option:hover {
		background: var(--background-color);
	}

	/* --- Contenu principal --- */
	.content-area {
		position: relative;
	}
	.table-container {
		background-color: var(--card-background-color);
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
		background-color: rgba(0, 123, 255, 0.1);
	}

	/* --- Poignées de redimensionnement --- */
	.resize-handle {
		position: absolute;
		right: 0;
		top: 0;
		bottom: 0;
		width: 8px;
		cursor: col-resize;
		background-color: transparent;
		opacity: 0;
		transition: opacity 0.2s;
	}
	th:hover .resize-handle {
		opacity: 1;
	}
	.resize-handle:hover {
		background-color: var(--accent-color);
		opacity: 0.5;
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
		background-color: var(--card-background-color);
		border-top: 2px solid var(--border-color);
		height: 33.33vh; /* 1/3 de la hauteur de l'écran */
		min-height: 300px;
		max-height: 80vh;
		display: flex;
		flex-direction: column;
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		z-index: 1000;
		box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.1);
	}
	.panel-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.75rem 1rem;
		border-bottom: 1px solid var(--border-color);
		font-weight: 700;
		background-color: var(--background-color);
	}
	.panel-header h3 {
		margin: 0;
		font-size: 1rem;
		color: var(--primary-text-color);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: calc(100% - 50px);
	}
	.close-btn {
		background: none;
		border: none;
		font-size: 1.5rem;
		cursor: pointer;
		color: var(--primary-text-color);
		padding: 0;
		line-height: 1;
		width: 30px;
		height: 30px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 3px;
		transition: background-color 0.2s;
	}
	.close-btn:hover {
		background-color: var(--background-color);
	}
	.panel-content {
		padding: 1rem;
		flex-grow: 1;
		overflow-y: auto;
	}
	.tabs {
		display: flex;
		gap: 0;
		border-bottom: 1px solid var(--border-color);
		margin-bottom: 1rem;
	}
	.tab {
		background: none;
		border: none;
		padding: 0.5rem 1rem;
		cursor: pointer;
		border-bottom: 2px solid transparent;
		color: var(--secondary-text-color);
		font-size: 0.9rem;
		transition: all 0.2s;
		border-radius: 0;
	}
	.tab:hover {
		background-color: var(--background-color);
		color: var(--primary-text-color);
	}
	.tab.active {
		border-bottom-color: var(--accent-color);
		font-weight: 700;
		color: var(--primary-text-color);
	}
	.tab-content {
		flex-grow: 1;
		overflow-y: auto;
	}
	.general-info {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.general-info-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		column-gap: 3rem;
		row-gap: 0.5rem;
	}

	.info-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
		gap: 1rem;
	}

	.info-item {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.info-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.25rem 0;
		border-bottom: 1px solid var(--border-color);
	}
	.info-row:last-child {
		border-bottom: none;
	}
	.info-label {
		font-weight: 600;
		color: var(--secondary-text-color);
		font-size: 0.9rem;
	}
	.info-value {
		color: var(--primary-text-color);
		font-size: 0.9rem;
	}
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 100%;
		color: var(--secondary-text-color);
		text-align: center;
	}
	.empty-state i {
		font-size: 2rem;
		margin-bottom: 0.5rem;
		opacity: 0.5;
	}
	.empty-state p {
		margin: 0;
		font-size: 0.9rem;
	}

	/* Dark mode styles */
	:global(html.dark-mode .info-bar .instance-summary),
	:global(html.dark-mode .info-bar .global-stats-summary),
	:global(html.dark-mode .toolbar),
	:global(html.dark-mode .status-settings),
	:global(html.dark-mode .dropdown),
	:global(html.dark-mode .table-container),
	:global(html.dark-mode .info-panel),
	:global(html.dark-mode .panel-header),
	:global(html.dark-mode .panel-content),
	:global(html.dark-mode .tracker-table) {
		background-color: var(--card-background-color);
		border-color: var(--border-color);
	}

	:global(html.dark-mode .close-btn) {
		color: var(--primary-text-color);
	}

	:global(html.dark-mode .close-btn:hover) {
		background-color: var(--background-color);
	}

	:global(html.dark-mode .tab) {
		color: var(--secondary-text-color);
	}

	:global(html.dark-mode .tab:hover) {
		background-color: var(--background-color);
		color: var(--primary-text-color);
	}

	:global(html.dark-mode .tab.active) {
		color: var(--primary-text-color);
		border-bottom-color: var(--accent-color);
	}

	:global(html.dark-mode .info-label) {
		color: var(--secondary-text-color);
	}

	:global(html.dark-mode .info-value) {
		color: var(--primary-text-color);
	}

	:global(html.dark-mode .empty-state) {
		color: var(--secondary-text-color);
	}

	:global(html.dark-mode .info-row) {
		border-bottom-color: var(--border-color);
	}

	:global(html.dark-mode .custom-select button),
	:global(html.dark-mode .status-btn),
	:global(html.dark-mode .settings-btn),
	:global(html.dark-mode .action-btn) {
		background-color: var(--card-background-color);
		border-color: var(--border-color);
		color: var(--primary-text-color);
	}

	:global(html.dark-mode .custom-select button:hover),
	:global(html.dark-mode .status-btn:hover),
	:global(html.dark-mode .settings-btn:hover),
	:global(html.dark-mode .action-btn:not(:disabled):hover) {
		background-color: var(--background-color);
	}

	:global(html.dark-mode .option:hover),
	:global(html.dark-mode tbody tr:hover) {
		background-color: var(--background-color);
	}

	:global(html.dark-mode tbody tr.selected) {
		background-color: rgba(0, 153, 255, 0.1);
	}

	:global(html.dark-mode .resize-handle:hover) {
		background-color: var(--accent-color);
	}

	:global(html.dark-mode .status-settings label) {
		color: var(--primary-text-color);
	}

	:global(html.dark-mode .status-indicator) {
		color: var(--primary-text-color);
	}

	:global(html.dark-mode .status-btn .label),
	:global(html.dark-mode .status-btn .count) {
		color: var(--primary-text-color);
	}

	:global(html.dark-mode .filter-row label),
	:global(html.dark-mode .custom-select label) {
		color: var(--secondary-text-color);
	}
	/* --- Header sticky et filtres --- */
	.sticky-header {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		padding: var(--spacing-unit) calc(var(--spacing-unit) * 4);
		border-bottom: 1px solid var(--border-color);
		background-color: var(--card-background-color);
		z-index: 100;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
		animation: slideDown 0.3s ease-out;
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.sticky-header .logo {
		font-weight: 700;
		letter-spacing: 0.05em;
	}

	.sticky-actions {
		display: flex;
		gap: 0.5rem;
	}

	.sticky-btn {
		background-color: var(--accent-color);
		color: white;
		border: none;
		padding: 0.5rem 1rem;
		border-radius: 4px;
		font-weight: 600;
		cursor: pointer;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		transition: background-color 0.2s;
	}

	.sticky-btn i {
		color: white;
	}

	.sticky-btn:hover {
		background-color: var(--accent-color-hover, #0056b3);
	}

	.sticky-filters {
		position: fixed;
		top: 60px;
		left: 0;
		right: 0;
		background-color: var(--card-background-color);
		border-bottom: 1px solid var(--border-color);
		z-index: 99;
		padding: 0.75rem 1rem;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
		animation: slideDown 0.3s ease-out;
		width: 33.33%;
		max-width: 600px;
		margin: 0 auto;
	}

	@keyframes slideDown {
		from {
			transform: translateY(-100%);
			opacity: 0;
		}
		to {
			transform: translateY(0);
			opacity: 1;
		}
	}

	@keyframes slideUp {
		from {
			transform: translateY(0);
			opacity: 1;
		}
		to {
			transform: translateY(-100%);
			opacity: 0;
		}
	}

	.sticky-filters {
		transition:
			opacity 0.3s ease-out,
			transform 0.3s ease-out;
	}

	.sticky-filters.closing {
		animation: slideUp 0.3s ease-out forwards;
	}

	/* Dark mode styles pour le header sticky */
	:global(html.dark-mode .sticky-header),
	:global(html.dark-mode .sticky-header .logo) {
		color: var(--primary-text-color);
	}

	:global(html.dark-mode .sticky-btn) {
		background-color: var(--accent-color);
		color: white;
	}

	:global(html.dark-mode .sticky-btn:hover) {
		background-color: var(--accent-color-hover, #0056b3);
	}

	/* Responsive styles pour le header sticky */
	@media (max-width: 600px) {
		.sticky-header {
			padding: var(--spacing-unit) calc(var(--spacing-unit) * 1.5);
		}
	}

	@media (max-width: 400px) {
		.sticky-header {
			padding: 1rem;
		}
	}
</style>
